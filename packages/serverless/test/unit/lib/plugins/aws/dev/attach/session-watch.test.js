import { expect, test } from '@jest/globals'
import { createAttachmentWatch } from '../../../../../../../lib/plugins/aws/dev/attach/session-watch.js'
import {
  countingTimers,
  fakeLambdaWeb,
  fakeLog,
  testSessionId,
} from './fakes.js'
import { attachWebApp } from '../../../../../../../lib/plugins/aws/dev/web/attach.js'
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

describe('web apps', () => {
  const FN = 'svc-dev-api'
  const deployed = () =>
    fakeLambdaWeb({
      [FN]: {
        revisions: {
          'rev-cfn': {
            buildConfig: {
              codeConfig: { s3Object: { bucket: 'b', key: 'web.zip' } },
              runtimeConfig: { runtime: 'nodejs24.x' },
            },
            serviceConfig: {
              environmentVariables: {
                AWS_LAMBDA_NODEJS_ENTRYPOINT: 'server.js',
              },
            },
          },
        },
        endpoints: {
          main: { revisionWeights: [{ revisionId: 'rev-cfn', weight: 100 }] },
        },
      },
    })
  const attach = (
    lambdaWeb,
    { id = testSessionId(1), owner = 'alice@mbp', localOnly } = {},
  ) =>
    attachWebApp({
      lambdaWeb,
      functionName: FN,
      bridge: { bucket: 'b', key: 'bridge.zip' },
      session: {
        id,
        owner,
        attachedAt: 1790000000,
        broker: { arn: 'arn:aws:iam::123456789012:role/b', externalId: 'e' },
        key: 'a2V5',
        iotEndpoint: 'abc-ats.iot.us-east-1.amazonaws.com',
      },
      localOnly,
    })
  const watchOf = (
    lambdaWeb,
    { localOnly = false, owner = 'alice@mbp' } = {},
  ) => {
    const lost = []
    const logger = fakeLog()
    const timers = countingTimers()
    const watch = createAttachmentWatch({
      clients: { lambda: { getFunctionOnce: async () => null }, lambdaWeb },
      scope: { stage: 'dev', region: 'us-east-1' },
      logger,
      sessionId: testSessionId(1),
      owner,
      attached: new Set(),
      webApps: [{ key: 'api', functionName: FN, localOnly }],
      timers,
      watchIntervalMs: 60_000,
      isStopping: () => false,
      onWebAppLost: (change) => lost.push(change),
    })
    return { watch, lost, logger, timers }
  }
  const warnings = (logger) =>
    logger.lines.filter((line) => line.level === 'warning').map((l) => l.text)

  test('watch reports detached when main moved', async () => {
    const lambdaWeb = deployed()
    await attach(lambdaWeb)
    const w = watchOf(lambdaWeb)
    await w.watch.check()
    expect(w.lost).toEqual([])
    // A deploy moved main to a revision Dev Mode did not create.
    await lambdaWeb.updateEndpointWeights({
      functionName: FN,
      endpointName: 'main',
      revisionId: 'rev-cfn',
    })
    await w.watch.check()
    await w.watch.check()
    expect(w.lost).toEqual([{ webApp: 'api', state: 'detached' }])
    expect(warnings(w.logger)).toEqual([
      'The web app api left Dev Mode: its endpoint main serves a revision Dev Mode did not create (serverless deploy, dev restore or another tool).',
    ])
    w.watch.cancel()
    expect(w.timers.live()).toBe(0)
  })

  test('a web function deleted is reported as function_deleted', async () => {
    const lambdaWeb = deployed()
    await attach(lambdaWeb)
    const w = watchOf(lambdaWeb)
    lambdaWeb.state.delete(FN)
    await w.watch.check()
    expect(w.lost).toEqual([{ webApp: 'api', state: 'function_deleted' }])
    expect(warnings(w.logger)).toEqual([
      'The web app api left Dev Mode: its web function no longer exists.',
    ])
  })

  test("main on another session's dev revision is taken_over, with that session's owner", async () => {
    const lambdaWeb = deployed()
    await attach(lambdaWeb)
    const w = watchOf(lambdaWeb)
    // Another session (with --take-over) moved main to its own dev revision.
    lambdaWeb.state.get(FN).revisions.set('rev-theirs', {
      revisionId: 'rev-theirs',
      state: 'Active',
      description: `Serverless Dev Mode dev for session ${testSessionId(2)}`,
      serviceConfig: {
        environmentVariables: {
          SLS_DEV_REVISION_ROLE: 'dev',
          SLS_DEV_SESSION: testSessionId(2),
          SLS_DEV_OWNER: 'bob@desk',
        },
      },
    })
    await lambdaWeb.updateEndpointWeights({
      functionName: FN,
      endpointName: 'main',
      revisionId: 'rev-theirs',
    })
    await w.watch.check()
    expect(w.lost).toEqual([
      { webApp: 'api', state: 'taken_over', owner: 'bob@desk' },
    ])
    expect(warnings(w.logger)).toEqual([
      'The web app api left Dev Mode: bob@desk took it over with --take-over.',
    ])
  })

  test('another session of the same owner taking a web app over is taken_over_by_you, as for a function', async () => {
    const lambdaWeb = deployed()
    await attach(lambdaWeb)
    const w = watchOf(lambdaWeb)
    lambdaWeb.state.get(FN).revisions.set('rev-mine', {
      revisionId: 'rev-mine',
      state: 'Active',
      description: `Serverless Dev Mode dev for session ${testSessionId(2)}`,
      serviceConfig: {
        environmentVariables: {
          SLS_DEV_REVISION_ROLE: 'dev',
          SLS_DEV_SESSION: testSessionId(2),
          SLS_DEV_OWNER: 'alice@mbp',
        },
      },
    })
    await lambdaWeb.updateEndpointWeights({
      functionName: FN,
      endpointName: 'main',
      revisionId: 'rev-mine',
    })
    await w.watch.check()
    expect(w.lost).toEqual([
      { webApp: 'api', state: 'taken_over_by_you', owner: 'alice@mbp' },
    ])
    expect(warnings(w.logger)).toEqual([
      'The web app api left Dev Mode: another Dev Mode session of yours attached it.',
    ])
  })

  test('checks of web apps alone that keep failing name the web apps', async () => {
    const lambdaWeb = deployed()
    await attach(lambdaWeb)
    // AWS never answers.
    lambdaWeb.getEndpointOnce = () => new Promise(() => {})
    const logger = fakeLog()
    const timers = countingTimers()
    const watch = createAttachmentWatch({
      clients: { lambda: { getFunctionOnce: async () => null }, lambdaWeb },
      logger,
      sessionId: testSessionId(1),
      owner: 'alice@mbp',
      attached: new Set(),
      webApps: [{ key: 'api', functionName: FN }],
      timers,
      watchIntervalMs: 5,
      isStopping: () => false,
    })
    for (let i = 0; i < 3; i += 1) await watch.check()
    const texts = (level) =>
      logger.lines.filter((line) => line.level === level).map((l) => l.text)
    expect(texts('debug')).toContain(
      'Dev Mode could not check the attached web apps: AWS Lambda did not answer within 0.005 s',
    )
    expect(texts('warning')).toEqual([
      'Dev Mode could not check the attached web apps the last 3 times (AWS Lambda did not answer within 0.005 s). It keeps trying; later failures show with --debug only.',
    ])
    watch.cancel()
  })

  test('a --local-only web app is checked on its local endpoint', async () => {
    const lambdaWeb = deployed()
    await attach(lambdaWeb, { localOnly: true })
    const w = watchOf(lambdaWeb, { localOnly: true })
    await w.watch.check()
    expect(w.lost).toEqual([])
    await lambdaWeb.deleteEndpoint({
      functionName: FN,
      endpointName: 'sls-dev-local',
    })
    await w.watch.check()
    expect(w.lost).toEqual([{ webApp: 'api', state: 'detached' }])
    expect(warnings(w.logger)).toEqual([
      "The web app api left Dev Mode: its endpoint sls-dev-local was deleted or no longer serves this session's Dev Mode revision (dev restore or another tool).",
    ])
  })

  test('the watch reads web apps once, without retries, and none when there are none', async () => {
    const lambdaWeb = deployed()
    await attach(lambdaWeb)
    lambdaWeb.calls.length = 0
    const w = watchOf(lambdaWeb)
    await w.watch.check()
    expect(lambdaWeb.calls.map(([method]) => method)).toEqual([
      'getEndpointOnce',
      'getRevisionOnce',
    ])
    lambdaWeb.calls.length = 0
    const functionsOnly = createAttachmentWatch({
      clients: { lambda: { getFunctionOnce: async () => null }, lambdaWeb },
      logger: fakeLog(),
      sessionId: testSessionId(1),
      owner: 'alice@mbp',
      attached: new Set(['svc-dev-fn']),
      timers: countingTimers(),
      watchIntervalMs: 60_000,
      isStopping: () => false,
    })
    await functionsOnly.check()
    expect(lambdaWeb.calls).toEqual([])
  })

  test('a web app whose read fails is skipped until the next check; the functions are still checked', async () => {
    const lambdaWeb = deployed()
    await attach(lambdaWeb)
    lambdaWeb.failures.getEndpointOnce = [new Error('socket hang up')]
    const lost = []
    const logger = fakeLog()
    const watch = createAttachmentWatch({
      clients: { lambda: { getFunctionOnce: async () => null }, lambdaWeb },
      logger,
      sessionId: testSessionId(1),
      owner: 'alice@mbp',
      attached: new Set(['svc-dev-fn']),
      webApps: [{ key: 'api', functionName: FN }],
      timers: countingTimers(),
      watchIntervalMs: 60_000,
      isStopping: () => false,
      onLost: (change) => lost.push(change),
      onWebAppLost: (change) => lost.push(change),
    })
    await watch.check()
    expect(lost).toEqual([{ name: 'svc-dev-fn', state: 'function_deleted' }])
    expect(logger.lines).toContainEqual({
      level: 'debug',
      text: 'Dev Mode could not check the web app api: socket hang up',
    })
    expect(warnings(logger)).toHaveLength(1)
  })
})
