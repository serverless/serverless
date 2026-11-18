// A Dev Mode session whose terminal went away (its window closed) while the CLI's spinner showed:
// the hang-up starts the restore, and the spinner can no longer put standard input back in its
// normal mode. The restore puts every function back and reports it, and the output the CLI prints
// after the command (its own progress, with the CLI's real logger) does not throw.
import {
  log,
  progress,
  getGlobalRendererSettings,
  setGlobalRendererSettings,
} from '@serverless/util/src/logger/index.js'
import { attachFunction } from '../../../../../../../lib/plugins/aws/dev/attach/attach.js'
import { createRestore } from '../../../../../../../lib/plugins/aws/dev/attach/session-restore.js'
import {
  GLOBAL_TIMERS,
  guardedLogger,
  guardedProgress,
} from '../../../../../../../lib/plugins/aws/dev/attach/session-support.js'
import {
  buildAttachVariables,
  layerArnsOf,
  variablesOf,
} from '../../../../../../../lib/plugins/aws/dev/attach/undo-record.js'
import { fakeTerminal } from '../../../../util/spinner-terminal.js'
import { fakeLambda, fakeProcess, testSessionId } from './fakes.js'

const DEV = 'arn:aws:lambda:us-east-1:123456789012:layer:serverless-dev-arm64:1'
const SESSION = {
  id: testSessionId(1),
  owner: 'alice@mbp',
  attachedAt: 1790000000,
  broker: {
    arn: 'arn:aws:iam::123456789012:role/serverless-dev-broker-us-east-1',
    externalId: 'e'.repeat(32),
  },
}
const quick = { sleep: async () => {} }

let saved
let savedSuffix
let terminal
beforeEach(() => {
  saved = getGlobalRendererSettings()
  savedSuffix = process.env.SLS_DEV_TEST_SUFFIX
  delete process.env.SLS_DEV_TEST_SUFFIX
})
afterEach(() => {
  try {
    progress.cleanup()
  } finally {
    terminal?.restore()
    setGlobalRendererSettings({
      isInteractive: saved.isInteractive,
      logLevel: saved.logLevel,
    })
    if (savedSuffix === undefined) delete process.env.SLS_DEV_TEST_SUFFIX
    else process.env.SLS_DEV_TEST_SUFFIX = savedSuffix
  }
})

test('a terminal that went away under the spinner: every function is restored, and the CLI ends without an error', async () => {
  const lambda = fakeLambda({ api: {}, worker: {} })
  for (const name of ['api', 'worker']) {
    await attachFunction({
      lambda,
      name,
      layerArn: DEV,
      prepare: (live) => ({
        variables: buildAttachVariables({
          live: variablesOf(live),
          otherLayerArns: layerArnsOf(live),
          session: SESSION,
        }),
      }),
      ...quick,
    })
  }

  terminal = fakeTerminal({ code: 'EIO' })
  const logger = guardedLogger(log.get('sls:dev'))
  const main = guardedProgress(progress.get('main'))
  main.notice('Connecting to AWS IoT Core')
  main.remove()
  logger.notice('Dev Mode on')
  // A rebuild's spinner shows when the terminal goes.
  main.notice('Rebuilding')

  terminal.hangUp()
  const { restoreAttached } = createRestore({
    clients: { lambda },
    scope: { stage: 'dev', region: 'us-east-1' },
    logger,
    main,
    sessionId: SESSION.id,
    ...quick,
    now: Date.now,
    timers: GLOBAL_TIMERS,
    restoreTimeoutMs: 60_000,
    processRef: fakeProcess(),
    touched: new Set(['api', 'worker']),
    settled: new Set(),
    signalled: () => 'SIGHUP',
  })
  const result = await restoreAttached()

  expect(result.failed).toEqual([])
  expect(result.restored.map(({ name }) => name).sort()).toEqual([
    'api',
    'worker',
  ])
  for (const name of ['api', 'worker']) {
    const config = lambda.state.get(name)
    expect(config.Layers).toEqual([])
    expect(config.Environment.Variables).not.toHaveProperty(
      'AWS_LAMBDA_EXEC_WRAPPER',
    )
  }
  expect(terminal.written.join('')).toContain('Dev Mode off')

  // What the CLI prints once the command has ended, outside the session's guards.
  expect(() => {
    const state = progress.get('main').get('state')
    state.notice('Saving state')
    state.remove()
    progress.get('main').notice('Finalizing')
    log.get('core').notice('Done')
    progress.cleanup()
  }).not.toThrow()
})
