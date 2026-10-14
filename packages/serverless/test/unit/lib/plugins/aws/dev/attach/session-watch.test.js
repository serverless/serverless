import { expect, test } from '@jest/globals'
import { createAttachmentWatch } from '../../../../../../../lib/plugins/aws/dev/attach/session-watch.js'
import { countingTimers, fakeLog, testSessionId } from './fakes.js'
import { credentialsInvalidError } from '../../../../../../../lib/plugins/aws/dev/attach/aws.js'

test('each function found changed is told to onLost once, with the state its line shows', async () => {
  const configs = {
    'svc-dev-api': null,
    'svc-dev-worker': {
      Layers: [],
      Environment: {
        Variables: { SLS_DEV_SESSION: 's_other', SLS_DEV_OWNER: 'alice@mbp' },
      },
    },
  }
  const lost = []
  const logger = fakeLog()
  const timers = countingTimers()
  const watch = createAttachmentWatch({
    clients: { lambda: { getFunctionOnce: async (name) => configs[name] } },
    logger,
    sessionId: testSessionId(1),
    owner: 'alice@mbp',
    attached: new Set(Object.keys(configs)),
    timers,
    watchIntervalMs: 60_000,
    isStopping: () => false,
    onLost: (change) => lost.push(change),
  })
  await watch.check()
  await watch.check()
  expect(lost).toEqual([
    { name: 'svc-dev-api', state: 'function_deleted' },
    { name: 'svc-dev-worker', state: 'taken_over_by_you', owner: 'alice@mbp' },
  ])
  expect(logger.lines.filter((line) => line.level === 'warning')).toHaveLength(
    2,
  )
  watch.cancel()
  expect(timers.live()).toBe(0)
})

test('a check that timed out holds off the next ones until its reads settle: checks never overlap', async () => {
  const pending = []
  const reads = []
  const logger = fakeLog()
  const timers = countingTimers()
  const watch = createAttachmentWatch({
    clients: {
      lambda: {
        getFunctionOnce: (name) =>
          new Promise((resolve) => {
            reads.push(name)
            pending.push(resolve)
          }),
      },
    },
    logger,
    sessionId: testSessionId(1),
    owner: 'alice@mbp',
    attached: new Set(['svc-dev-api']),
    timers,
    watchIntervalMs: 20,
    isStopping: () => false,
  })
  // The first check's read never answers within the interval.
  await watch.check()
  expect(reads).toEqual(['svc-dev-api'])
  // While that read is still pending, later checks start no new reads and count as failed.
  await watch.check()
  await watch.check()
  expect(reads).toEqual(['svc-dev-api'])
  expect(logger.lines.filter((line) => line.level === 'warning')).toHaveLength(
    1,
  )
  // Once it settles, the next check reads again.
  pending.shift()({ Layers: [], Environment: { Variables: {} } })
  const turn = () => new Promise((resolve) => setImmediate(resolve))
  await turn()
  await turn()
  const next = watch.check()
  while (reads.length < 2) await turn()
  expect(reads).toEqual(['svc-dev-api', 'svc-dev-api'])
  pending.shift()({
    Layers: [],
    Environment: {
      Variables: {
        SLS_DEV_SESSION: testSessionId(1),
        AWS_LAMBDA_EXEC_WRAPPER: '/opt/sls-dev-wrapper',
      },
    },
  })
  await next
  watch.cancel()
  expect(timers.live()).toBe(0)
})

test('checks failing on rejected credentials warn with the AWS message, then the advice once', async () => {
  const rejected = credentialsInvalidError(
    Object.assign(
      new Error('The security token included in the request is expired'),
      {
        name: 'ExpiredTokenException',
      },
    ),
    'eu-west-1',
    { source: 'profile', profile: 'dev' },
  )
  const logger = fakeLog()
  const timers = countingTimers()
  const watch = createAttachmentWatch({
    clients: {
      lambda: {
        getFunctionOnce: async () => {
          throw rejected
        },
      },
    },
    logger,
    sessionId: testSessionId(1),
    owner: 'alice@mbp',
    attached: new Set(['svc-dev-api']),
    timers,
    watchIntervalMs: 60_000,
    isStopping: () => false,
    onLost: () => {},
  })
  for (let i = 0; i < 3; i += 1) await watch.check()
  const warnings = logger.lines
    .filter((line) => line.level === 'warning')
    .map((line) => line.text)
  expect(warnings).toEqual([
    `Dev Mode could not check the attached functions the last 3 times (The security token included in the request is expired). ${rejected.advice} It keeps trying; later failures show with --debug only.`,
  ])
  expect(warnings[0].match(/The credentials come from/g)).toHaveLength(1)
  watch.cancel()
  expect(timers.live()).toBe(0)
})
