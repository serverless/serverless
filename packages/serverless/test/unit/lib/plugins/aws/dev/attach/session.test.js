import { jest } from '@jest/globals'
import { EventEmitter } from 'events'
import fs from 'fs'
import os from 'os'
import path from 'path'
import AwsProvider from '../../../../../../../lib/plugins/aws/provider.js'
import { detectLocalRuntimes } from '../../../../../../../lib/plugins/aws/dev/local/adapters/index.js'
import { startLaptopRuntime } from '../../../../../../../lib/plugins/aws/dev/local/index.js'
import {
  defaultOwner,
  newSessionId,
  runDevSession,
} from '../../../../../../../lib/plugins/aws/dev/attach/session.js'
import { newSessionKey } from '../../../../../../../lib/plugins/aws/dev/attach/session-support.js'
import { connectToSession } from '../../../../../../../lib/plugins/aws/dev/control/client.js'
import { runDevStatus } from '../../../../../../../lib/plugins/aws/dev/commands/status.js'
import { createIdleTimer } from '../../../../../../../lib/plugins/aws/dev/attach/session-idle.js'
import { manualClock } from '../relay/manual-clock.js'
import {
  buildAttachVariables,
  envSize,
} from '../../../../../../../lib/plugins/aws/dev/attach/undo-record.js'
import { decodeSessionKey } from '../../../../../../../lib/plugins/aws/dev/relay/protocol.js'
import { DRAIN_MS } from '../../../../../../../lib/plugins/aws/dev/attach/session-relay.js'
import {
  livenessDeniedLine,
  livenessUnansweredLine,
  newBrokerLine,
  sideChannelOffLine,
} from '../../../../../../../lib/plugins/aws/dev/relay/messages.js'
import {
  DETAILED_ON,
  KEY_HELP,
  KEYS_HINT,
} from '../../../../../../../lib/plugins/aws/dev/local/hotkeys.js'
import { handlerEnvironment } from '../../../../../../../lib/plugins/aws/dev/local/environment.js'
import { STOP_HINT } from '../../../../../../../lib/plugins/aws/dev/attach/output.js'
import { layerDescription } from '../../../../../../../lib/plugins/aws/dev/attach/layer.js'
import { buildPermissionPolicy } from '../../../../../../../lib/plugins/aws/dev/attach/broker.js'
import { fakeTty } from '../local/tty.js'
import { noSessionState } from '../../../../../../../lib/plugins/aws/dev/state/session-state.js'
import {
  ACCOUNT,
  IOT_ENDPOINT,
  artifact,
  countingTimers,
  fakeIam,
  fakeIot,
  fakeLambda,
  fakeLog,
  fakeProcess,
  fakeProgress,
  fakeProvider,
  fakeServerless,
  humanText,
  memoryState,
  recordingProgress,
  testSessionId,
} from './fakes.js'
import { runWithoutColor } from '../without-color.js'

// Its tests read the plain text of styled lines.
runWithoutColor()

const LOCAL = {
  node: { available: true, command: 'node', version: '24.21.0' },
  python: { available: true, command: 'python3', version: '3.13.8' },
}

let savedSuffix
beforeAll(() => {
  savedSuffix = process.env.SLS_DEV_TEST_SUFFIX
  delete process.env.SLS_DEV_TEST_SUFFIX
})
afterAll(() => {
  if (savedSuffix === undefined) delete process.env.SLS_DEV_TEST_SUFFIX
  else process.env.SLS_DEV_TEST_SUFFIX = savedSuffix
})

// Every session must clear the timers it starts, on every exit path: a leaked keep-alive
// interval keeps `serverless dev` running after "Dev Mode off". Each session gets its own
// counting timers; when it ends (resolved or rejected) none of its timers may still be live.
// A test must end every session it starts: one still running here is stopped only so the
// suite can go on, and fails the test, since its timers cannot be checked.
let sessions = []
afterEach(async () => {
  const ended = sessions.map((session) => session.ended())
  const listeners = sessions.map((session) =>
    session.ended()
      ? session.proc
          .eventNames()
          .reduce((sum, name) => sum + session.proc.listenerCount(name), 0)
      : 0,
  )
  for (const session of sessions) {
    if (!session.ended()) session.proc.emit('SIGINT', 'SIGINT')
  }
  const live = await Promise.all(sessions.map((session) => session.timersLeft))
  sessions = []
  expect(ended).toEqual(ended.map(() => true))
  expect(live).toEqual(live.map(() => 0))
  expect(listeners).toEqual(listeners.map(() => 0))
})

const start = ({
  stage = 'dev',
  functions,
  live = {},
  options = {},
  // The logger's interactivity; a person at a terminal (`tty`) is interactive unless a test says
  // otherwise.
  interactive,
  lambda,
  iam = fakeIam(),
  iot = fakeIot(),
  stackExists = true,
  confirmAnswer = true,
  logger: givenLogger,
  watchIntervalMs = 3_600_000,
  provider = fakeProvider({ stage }),
  deps = {},
  // null: the real session file and event log, in `serviceDir`.
  state = memoryState(),
  serviceDir,
  // A person at a terminal: stdin and stdout are terminals, no CI, no agent.
  tty = false,
  // The loaded plugin instances (the mcp plugin's registry of servers, for one).
  plugins,
  // The service's `provider` configuration.
  serviceProvider,
  // The whole service in place of the fake one: a configuration build plugins read.
  service,
} = {}) => {
  const logger = givenLogger ?? fakeLog({ interactive: interactive ?? tty })
  // The spinner's texts, in their own log: the lines a session prints stay as they are.
  const progress = recordingProgress()
  const serverless = Object.assign(
    fakeServerless({ stage, functions }),
    serviceDir && { serviceDir },
  )
  if (plugins) serverless.pluginManager.plugins = plugins
  if (serviceProvider) serverless.service.provider = serviceProvider
  if (service) serverless.service = service
  const fns =
    lambda ??
    fakeLambda(
      Object.fromEntries(
        Object.entries(live).map(([key, config]) => [
          `svc-${stage}-${key}`,
          config,
        ]),
      ),
    )
  const proc = fakeProcess()
  // What the keys reach in the laptop runtime.
  const laptop = {
    reloadNow: jest.fn(async () => {}),
    toggleDetailed: jest.fn(() => true),
    runtime: {
      workers: () => [{ functionKey: 'api', pid: 4242, busy: false }],
    },
    stop: async () => {},
  }
  if (tty) {
    proc.stdin = fakeTty()
    proc.stdout.isTTY = true
  }
  const timers = countingTimers()
  const asked = []
  const shownWhenAsked = []
  let ready
  const whenReady = new Promise((resolve) => {
    ready = resolve
  })
  const result = runDevSession({
    serverless,
    provider,
    options,
    deps: {
      clients: { lambda: fns, iam, iot },
      logger,
      progress,
      sleep: async () => {},
      owner: 'alice@mbp',
      sessionId: testSessionId(1),
      processRef: proc,
      readArtifact: async (arch) => artifact(arch),
      stackExists: async () => stackExists,
      // One answer for every question, or one per question in order.
      confirm: async (question) => {
        asked.push(question.message)
        shownWhenAsked.push(logger.text())
        return Array.isArray(confirmAnswer)
          ? confirmAnswer[asked.length - 1]
          : confirmAnswer
      },
      onReady: ready,
      watchIntervalMs,
      timers,
      detectLocal: async () => LOCAL,
      startLaptop: async () => ({ stop: async () => {} }),
      connectRelay: async () => fakeRelayConnection(),
      // Every other session found on the functions has ended, unless a test says otherwise.
      checkSessionsLiveness: async ({ sessionIds }) =>
        new Map(sessionIds.map((id) => [id, 'gone'])),
      openSideChannel: async () => ({ enabled: true, sweep: async () => 0 }),
      s3: { fake: 's3' },
      state,
      ...(tty && {
        isAgent: () => false,
        startLaptop: async () => laptop,
      }),
      ...deps,
    },
  })
  // Timers still live at the moment the session ended.
  const timersLeft = result.then(
    () => timers.live(),
    () => timers.live(),
  )
  let ended = false
  result.then(
    () => {
      ended = true
    },
    () => {
      ended = true
    },
  )
  sessions.push({ timersLeft, proc, ended: () => ended })
  return {
    serverless,
    lambda: fns,
    iam,
    state,
    logger,
    proc,
    asked,
    shownWhenAsked,
    result,
    whenReady,
    laptop,
    progress,
  }
}
/** A connected relay connection: records its stop. */
const fakeRelayConnection = (order = []) => {
  const connection = {
    stops: 0,
    transport: { publish: async () => true },
    credentials: { current: () => ({ accessKeyId: 'AKID' }) },
    setReceiver() {},
    onReconnected() {},
    quiet() {
      order.push('connection.quiet')
    },
    async stop() {
      connection.stops += 1
      order.push('connection.stop')
    },
  }
  return connection
}
const shapes = (lambda) =>
  JSON.stringify(
    [...lambda.state.values()].map(({ FunctionName, Layers, Environment }) => ({
      FunctionName,
      Layers,
      Environment,
    })),
  )
const updates = (lambda) =>
  lambda.calls
    .filter(([op]) => op === 'updateFunctionConfiguration')
    .map(([, params]) => params)
const failFor = (lambda, name, error) => {
  const real = lambda.updateFunctionConfiguration
  lambda.updateFunctionConfiguration = async (params) => {
    if (params.FunctionName === name) throw error
    return real(params)
  }
}
const four = {
  functions: {
    api: {},
    worker: {},
    report: {},
    edge: { events: [{ cloudFront: { eventType: 'viewer-request' } }] },
  },
  live: {
    api: {},
    worker: { Runtime: 'python3.13', Architectures: ['x86_64'] },
    report: { Runtime: 'java21' },
    edge: {},
  },
}
const denied = (action) =>
  Object.assign(
    new Error(
      `User is not authorized to perform: ${action} because no identity-based policy allows it`,
    ),
    { name: 'AccessDeniedException', $metadata: { httpStatusCode: 403 } },
  )
/** A clock the test moves by hand: a stop signal more than half a second after the first forces. */
const handClock = () => {
  let time = 1_790_000_000_000
  return {
    now: () => time,
    advance: (ms) => {
      time += ms
    },
  }
}
// A clock that moves one second per reading, so update waits time out without real waiting.
const ticking = () => {
  let t = 1_790_000_000_000
  return () => (t += 1000)
}

test('attaches eligible functions, prints plan, table and summary, and restores them on Ctrl+C', async () => {
  const s = start(four)
  const before = shapes(s.lambda)
  await s.whenReady
  const api = s.lambda.state.get('svc-dev-api')
  expect(api.Layers[0].Arn).toMatch(/:layer:serverless-dev-arm64:1$/)
  expect(api.Environment.Variables).toMatchObject({
    AWS_LAMBDA_EXEC_WRAPPER: '/opt/sls-dev-wrapper',
    SLS_DEV_SESSION: testSessionId(1),
  })
  expect(s.lambda.state.get('svc-dev-worker').Layers[0].Arn).toMatch(
    /:layer:serverless-dev-x86_64:1$/,
  )
  expect(s.lambda.state.get('svc-dev-report').Layers).toEqual([])
  const text = s.logger.text()
  const shown = (level) =>
    s.logger.lines.filter((line) => line.level === level).map((l) => l.text)
  // The plan goes to the debug log; what the setup did is one line.
  expect(shown('debug').join('\n')).toContain(
    'Account setup (first time in us-east-1):',
  )
  expect(shown('notice').join('\n')).not.toContain('These changes will be made')
  expect(shown('notice')).toContainEqual(
    expect.stringMatching(
      /^Set up Dev Mode in us-east-1: created IAM role serverless-dev-broker-us-east-1\S*, published layer serverless-dev-arm64\S*, published layer serverless-dev-x86_64/,
    ),
  )
  // Two functions do not run here: the table says why.
  expect(text).toMatch(
    /report\s+deployed\s+Java runtime \(Dev Mode support planned\)/,
  )
  expect(text).toMatch(/edge\s+deployed\s+Lambda@Edge \(not supported\)/)
  expect(shown('success')).toContainEqual(
    expect.stringMatching(/^Dev Mode on · 2 of 4 functions \(\d+\.\ds\)$/),
  )
  expect(text).not.toContain('Dev Mode uses the deployed configuration.')
  expect(text).not.toMatch(/ready in|attach \d/)
  expect(updates(s.lambda).every((params) => !('Timeout' in params))).toBe(true)
  s.proc.emit('SIGINT', 'SIGINT')
  expect(await s.result).toBe(0)
  expect(shapes(s.lambda)).toBe(before)
  expect(s.logger.text()).toMatch(/Dev Mode off · 2 functions restored \(/)
  expect(s.proc.listenerCount('SIGINT')).toBe(0)
  expect(s.proc.exits).toEqual([])
})

test('the broker role and the layers are created once and reused by the next session', async () => {
  const first = start(four)
  await first.whenReady
  first.proc.emit('SIGTERM', 'SIGTERM')
  await first.result
  const second = start({ ...four, lambda: first.lambda, iam: first.iam })
  await second.whenReady
  second.proc.emit('SIGINT', 'SIGINT')
  await second.result
  expect(first.iam.calls.filter(([op]) => op === 'createRole')).toHaveLength(1)
  expect(
    first.lambda.calls.filter(([op]) => op === 'publishLayerVersion'),
  ).toHaveLength(2)
  expect(second.logger.text()).not.toContain('Set up Dev Mode')
})

test.each(['prod', 'Production'])(
  'stage %s is refused before any AWS call',
  async (stage) => {
    const s = start({ stage, ...four })
    await expect(s.result).rejects.toMatchObject({
      code: 'DEV_MODE_STAGE_PROTECTED',
    })
    expect(s.lambda.calls).toEqual([])
    expect(s.iam.calls).toEqual([])
  },
)

test('the stop handlers are in place before the first function is changed', async () => {
  const s = start(four)
  let listening
  s.lambda.beforeUpdate = () => {
    listening = s.proc.listenerCount('SIGINT')
  }
  await s.whenReady
  expect(listening).toBe(1)
  s.proc.emit('SIGINT', 'SIGINT')
  expect(await s.result).toBe(0)
})

test('Ctrl+C while functions are being attached restores whatever was attached', async () => {
  const s = start(four)
  const before = shapes(s.lambda)
  s.lambda.beforeUpdate = () => s.proc.emit('SIGINT', 'SIGINT')
  expect(await s.result).toBe(0)
  expect(shapes(s.lambda)).toBe(before)
  expect(s.logger.text()).not.toContain('Dev Mode on ·')
})

test('Ctrl+C before any function was changed says so and exits 0', async () => {
  const s = start(four)
  s.iam.createRole = async (params) => {
    s.proc.emit('SIGINT', 'SIGINT')
    return fakeIam().createRole(params)
  }
  expect(await s.result).toBe(0)
  expect(updates(s.lambda)).toEqual([])
  expect(s.logger.text()).toContain('Dev Mode off · no function was changed')
})

test("a Ctrl+C the checks' spinner passes on (no signal name) while the session checks AWS records SIGINT", async () => {
  const state = memoryState()
  const held = {}
  held.s = start({
    ...four,
    state,
    deps: {
      stackExists: async () => {
        // In a terminal the spinner reads stdin in raw mode: Ctrl+C arrives with no signal name.
        held.s.proc.emit('SIGINT')
        return true
      },
    },
  })
  const { s } = held
  expect(await s.result).toBe(0)
  expect(updates(s.lambda)).toEqual([])
  expect(s.logger.text()).toContain('Dev Mode off · no function was changed')
  expect(
    state.records.find((record) => record.type === 'session.stopping'),
  ).toEqual({ type: 'session.stopping', trigger: 'signal', signal: 'SIGINT' })
})

test('a second Ctrl+C exits 3 naming the functions still attached', async () => {
  const clock = handClock()
  const s = start({ ...four, deps: { now: clock.now, elapsed: clock.now } })
  await s.whenReady
  s.proc.emit('SIGINT', 'SIGINT')
  clock.advance(501)
  s.proc.emit('SIGINT', 'SIGINT')
  expect(s.proc.exits).toEqual([3])
  expect(s.logger.text()).toContain(
    'Exiting without waiting. Not restored: svc-dev-api, svc-dev-worker.',
  )
  await s.result
})

test('a forced exit abandons the restore: no update starts after its lines, and nothing more is printed', async () => {
  const clock = handClock()
  const s = start({ ...four, deps: { now: clock.now, elapsed: clock.now } })
  await s.whenReady
  const sent = []
  const update = s.lambda.updateFunctionConfiguration
  s.lambda.updateFunctionConfiguration = (params) => {
    sent.push(params.FunctionName)
    // The second Ctrl+C comes while the first function's restore is being sent.
    if (sent.length === 1) {
      clock.advance(501)
      s.proc.emit('SIGINT', 'SIGINT')
    }
    return update(params)
  }
  s.proc.emit('SIGINT', 'SIGINT')
  expect(await s.result).toBe(3)
  expect(s.proc.exits).toEqual([3])
  // The update under way when the exit began finished; none started after it.
  expect(sent).toHaveLength(1)
  const lines = s.logger.lines.map((line) => line.text)
  const forced = lines.findIndex((text) =>
    text.startsWith('Exiting without waiting.'),
  )
  expect(lines[forced]).toBe(
    'Exiting without waiting. Not restored: svc-dev-api, svc-dev-worker.',
  )
  // Its two lines are the last the session printed.
  expect(lines.slice(forced)).toHaveLength(2)
})

test('a second Ctrl+C during the restore spinner forces the exit, also as the spinner passes it on (no signal name)', async () => {
  const clock = handClock()
  const s = start({ ...four, deps: { now: clock.now, elapsed: clock.now } })
  await s.whenReady
  const update = s.lambda.updateFunctionConfiguration
  let spinner
  s.lambda.updateFunctionConfiguration = (params) => {
    if (spinner === undefined) {
      spinner = s.progress.texts('main').at(-1)
      // In a terminal the spinner reads stdin in raw mode: Ctrl+C reaches the process as a SIGINT
      // event with no signal name.
      clock.advance(600)
      s.proc.emit('SIGINT')
    }
    return update(params)
  }
  s.proc.emit('SIGINT', 'SIGINT')
  expect(await s.result).toBe(3)
  expect(spinner).toBe(
    'Restoring 2 functions (0/2) · press Ctrl+C again to exit without waiting',
  )
  expect(s.proc.exits).toEqual([3])
  expect(s.logger.text()).toContain(
    'Exiting without waiting. Not restored: svc-dev-api, svc-dev-worker.',
  )
})

test('a forced exit while functions are being attached starts no attach after its lines', async () => {
  const clock = handClock()
  const s = start({ ...four, deps: { now: clock.now, elapsed: clock.now } })
  const sent = []
  const update = s.lambda.updateFunctionConfiguration
  s.lambda.updateFunctionConfiguration = (params) => {
    sent.push(params.FunctionName)
    // Ctrl+C twice while the first function's attach is being sent.
    if (sent.length === 1) {
      s.proc.emit('SIGINT', 'SIGINT')
      clock.advance(501)
      s.proc.emit('SIGINT', 'SIGINT')
    }
    return update(params)
  }
  expect(await s.result).toBe(3)
  expect(s.proc.exits).toEqual([3])
  // The other function's attach would start after the lines that name what is attached.
  expect(sent).toEqual([sent[0]])
  const lines = s.logger.lines.map((line) => line.text)
  const forced = lines.findIndex((text) =>
    text.startsWith('Exiting without waiting.'),
  )
  expect(lines[forced]).toBe(
    `Exiting without waiting. Not restored: ${sent[0]}.`,
  )
  expect(lines.slice(forced)).toHaveLength(2)
})

test('two SIGTERMs 3 ms apart, or SIGINT then SIGTERM, are one stop: the restore finishes and the session exits 0', async () => {
  for (const [first, second] of [
    ['SIGTERM', 'SIGTERM'],
    ['SIGINT', 'SIGTERM'],
  ]) {
    const clock = handClock()
    const s = start({ ...four, deps: { now: clock.now, elapsed: clock.now } })
    await s.whenReady
    s.proc.emit(first, first)
    clock.advance(3)
    s.proc.emit(second, second)
    expect(await s.result).toBe(0)
    expect(s.proc.exits).toEqual([])
    expect(s.logger.text()).toMatch(/Dev Mode off · 2 functions restored/)
  }
})

test('a step of the wall clock between two copies of one stop does not force the exit', async () => {
  let step = 0
  const s = start({ ...four, deps: { now: () => Date.now() + step } })
  await s.whenReady
  s.proc.emit('SIGTERM', 'SIGTERM')
  // The system clock jumps ahead (a time sync) before the copy of the signal arrives.
  step = 60_000
  s.proc.emit('SIGTERM', 'SIGTERM')
  expect(await s.result).toBe(0)
  expect(s.proc.exits).toEqual([])
})

test('a hang-up restores like Ctrl+C, and later hang-ups never force an exit', async () => {
  const s = start(four)
  const before = shapes(s.lambda)
  await s.whenReady
  s.proc.emit('SIGHUP', 'SIGHUP')
  s.proc.emit('SIGHUP', 'SIGHUP')
  expect(await s.result).toBe(0)
  expect(s.proc.exits).toEqual([])
  expect(shapes(s.lambda)).toBe(before)
})

test('output that fails after the terminal went away does not stop the restore', async () => {
  const logger = fakeLog()
  const s = start({ ...four, logger })
  const before = shapes(s.lambda)
  await s.whenReady
  for (const level of ['notice', 'success', 'warning', 'error']) {
    logger[level] = () => {
      throw Object.assign(new Error('write EIO'), { code: 'EIO' })
    }
  }
  s.proc.emit('SIGHUP', 'SIGHUP')
  expect(await s.result).toBe(0)
  expect(shapes(s.lambda)).toBe(before)
})

test('write errors on stdout and stderr are absorbed while the session runs, and after a hang-up for good', async () => {
  const s = start(four)
  await s.whenReady
  expect(s.proc.stdout.listenerCount('error')).toBe(1)
  expect(s.proc.stderr.listenerCount('error')).toBe(1)
  expect(() =>
    s.proc.stderr.emit(
      'error',
      Object.assign(new Error('write EIO'), { code: 'EIO' }),
    ),
  ).not.toThrow()
  s.proc.emit('SIGINT', 'SIGINT')
  await s.result
  expect(s.proc.stderr.listenerCount('error')).toBe(0)

  const hung = start(four)
  await hung.whenReady
  hung.proc.emit('SIGHUP', 'SIGHUP')
  await hung.result
  expect(hung.proc.stderr.listenerCount('error')).toBe(1)
})

test('a hang-up after Ctrl+C keeps write errors absorbed for good and skips the removal prompt', async () => {
  const s = start({
    ...four,
    options: { 'on-exit': 'remove' },
    interactive: true,
  })
  await s.whenReady
  s.proc.emit('SIGINT', 'SIGINT')
  s.proc.emit('SIGHUP', 'SIGHUP')
  expect(await s.result).toBe(0)
  expect(s.proc.exits).toEqual([])
  expect(s.proc.stdout.listenerCount('error')).toBe(1)
  expect(s.proc.stderr.listenerCount('error')).toBe(1)
  expect(s.asked).toEqual([])
  expect(s.serverless.pluginManager.spawned).toEqual([])
  expect(s.proc.listenerCount('SIGHUP')).toBe(0)
})

test('a restore that runs out of time names the functions that failed and those still running', async () => {
  const s = start({ ...four, deps: { restoreTimeoutMs: 50 } })
  await s.whenReady
  s.lambda.updateFunctionConfiguration = (params) =>
    params.FunctionName === 'svc-dev-api'
      ? Promise.reject(
          Object.assign(new Error('boom'), { name: 'ServiceException' }),
        )
      : new Promise(() => {})
  s.proc.emit('SIGINT', 'SIGINT')
  expect(await s.result).toBe(3)
  expect(s.logger.text()).toContain(
    'Not restored: svc-dev-api, svc-dev-worker.',
  )
})

test('an unexpected error after attaching restores first, then reports the error', async () => {
  const s = start({
    ...four,
    deps: {
      onReady: () => {
        throw new Error('surprise')
      },
    },
  })
  const before = shapes(s.lambda)
  await expect(s.result).rejects.toThrow('surprise')
  expect(shapes(s.lambda)).toBe(before)
  expect(s.proc.listenerCount('SIGINT')).toBe(0)
})

test('an unexpected error with a failed restore exits 3 and says both', async () => {
  const lambda = fakeLambda({ 'svc-dev-api': {} })
  const s = start({
    functions: { api: {} },
    lambda,
    deps: {
      onReady: () => {
        lambda.updateErrors.push(
          Object.assign(new Error('Rate exceeded'), {
            name: 'ServiceException',
          }),
        )
        throw new Error('surprise')
      },
    },
  })
  expect(await s.result).toBe(3)
  const text = s.logger.text()
  expect(text).toContain('surprise')
  expect(text).toContain('1 function not restored: api (Rate exceeded).')
})

test('a failed restore on a personal stage names that stage and region in the restore it suggests', async () => {
  const lambda = fakeLambda({ 'svc-alice-api': {} })
  const s = start({
    stage: 'alice',
    provider: fakeProvider({ stage: 'alice', region: 'eu-west-1' }),
    functions: { api: {} },
    lambda,
  })
  await s.whenReady
  lambda.updateErrors.push(
    Object.assign(new Error('Rate exceeded'), { name: 'ServiceException' }),
  )
  s.proc.emit('SIGINT', 'SIGINT')
  expect(await s.result).toBe(3)
  expect(s.logger.text()).toContain(
    'It runs the deployed code until restored: run "serverless dev restore --stage alice --region eu-west-1 --function api".',
  )
})

test('a session started with --aws-profile records it, and the restore it suggests uses it', async () => {
  const lambda = fakeLambda({ 'svc-alice-api': {} })
  const state = memoryState()
  const s = start({
    stage: 'alice',
    provider: fakeProvider({ stage: 'alice', region: 'eu-west-1' }),
    functions: { api: {} },
    lambda,
    state,
    options: { 'aws-profile': 'sandbox' },
  })
  await s.whenReady
  expect(state.records[0]).toMatchObject({
    type: 'session.starting',
    stage: 'alice',
    region: 'eu-west-1',
    aws_profile: 'sandbox',
  })
  lambda.updateErrors.push(
    Object.assign(new Error('Rate exceeded'), { name: 'ServiceException' }),
  )
  s.proc.emit('SIGINT', 'SIGINT')
  expect(await s.result).toBe(3)
  expect(s.logger.text()).toContain(
    'It runs the deployed code until restored: run "serverless dev restore --stage alice --region eu-west-1 --aws-profile sandbox --function api".',
  )
})

test('a session started without --aws-profile records none', async () => {
  const state = memoryState()
  const s = start({ functions: { api: {} }, live: { api: {} }, state })
  await s.whenReady
  expect(state.records[0]).not.toHaveProperty('aws_profile')
  s.proc.emit('SIGINT', 'SIGINT')
  expect(await s.result).toBe(0)
})

test('a restore that does not finish in time names what is left and exits 3', async () => {
  const s = start({ ...four, deps: { restoreTimeoutMs: 20 } })
  await s.whenReady
  s.lambda.updateFunctionConfiguration = () => new Promise(() => {})
  s.proc.emit('SIGINT', 'SIGINT')
  expect(await s.result).toBe(3)
  expect(s.proc.exits).toEqual([3])
  expect(s.logger.text()).toContain(
    'Not restored: svc-dev-api, svc-dev-worker.',
  )
})

test('--on-exit keep leaves the functions attached and exits 0', async () => {
  const s = start({ ...four, options: { 'on-exit': 'keep' } })
  await s.whenReady
  s.proc.emit('SIGINT', 'SIGINT')
  expect(await s.result).toBe(0)
  expect(
    s.lambda.state.get('svc-dev-api').Environment.Variables.SLS_DEV_SESSION,
  ).toBe(testSessionId(1))
  expect(s.logger.text()).toContain(
    'Left 2 functions in Dev Mode (--on-exit keep).',
  )
})

test('--on-exit keep exits 3 when a function could not be attached, as a stop that restores does', async () => {
  const s = start({ ...four, options: { 'on-exit': 'keep' } })
  const real = s.lambda.updateFunctionConfiguration
  s.lambda.updateFunctionConfiguration = async (params) => {
    if (
      params.FunctionName === 'svc-dev-worker' &&
      params.Environment?.Variables?.SLS_DEV_SESSION
    ) {
      throw Object.assign(new Error('refused'), {
        name: 'InvalidParameterValueException',
      })
    }
    return real(params)
  }
  await s.whenReady
  s.proc.emit('SIGINT', 'SIGINT')
  expect(await s.result).toBe(3)
  expect(s.logger.text()).toContain(
    'Left 1 function in Dev Mode (--on-exit keep).',
  )
})

test('--on-exit remove asks in a terminal, then removes the service after restoring', async () => {
  const s = start({
    ...four,
    options: { 'on-exit': 'remove' },
    interactive: true,
  })
  await s.whenReady
  s.proc.emit('SIGINT', 'SIGINT')
  expect(await s.result).toBe(0)
  expect(s.asked).toEqual(['Remove "svc" from stage "dev" in "us-east-1"?'])
  expect(s.serverless.pluginManager.spawned).toEqual(['remove'])
  const quiet = start({ ...four, options: { 'on-exit': 'remove' } })
  await quiet.whenReady
  quiet.proc.emit('SIGINT', 'SIGINT')
  await quiet.result
  expect(quiet.serverless.pluginManager.spawned).toEqual([])
  expect(quiet.logger.text()).toContain(
    'Removal skipped: there is no terminal to confirm it.',
  )
})

test('--on-exit remove does not ask once a forced exit began', async () => {
  const clock = handClock()
  const s = start({
    ...four,
    options: { 'on-exit': 'remove' },
    interactive: true,
    deps: { now: clock.now, elapsed: clock.now },
  })
  await s.whenReady
  const update = s.lambda.updateFunctionConfiguration
  let restoring = 0
  s.lambda.updateFunctionConfiguration = (params) => {
    // The second signal arrives while the last restore update is on its way: it finishes, so
    // nothing is left attached, and the exit is already forced.
    if (++restoring === 2) {
      clock.advance(501)
      s.proc.emit('SIGINT', 'SIGINT')
    }
    return update(params)
  }
  s.proc.emit('SIGINT', 'SIGINT')
  await s.result
  expect(s.proc.exits).toEqual([3])
  expect(s.asked).toEqual([])
  expect(s.serverless.pluginManager.spawned).toEqual([])
})

test('--on-exit remove does not ask after a hang-up: the terminal is gone', async () => {
  const s = start({
    ...four,
    options: { 'on-exit': 'remove' },
    interactive: true,
  })
  await s.whenReady
  s.proc.emit('SIGHUP', 'SIGHUP')
  expect(await s.result).toBe(0)
  expect(s.asked).toEqual([])
  expect(s.serverless.pluginManager.spawned).toEqual([])
})

test("a running developer's function is skipped; --take-over attaches it", async () => {
  const running = {
    checkSessionsLiveness: async ({ sessionIds }) =>
      new Map(sessionIds.map((id) => [id, 'live'])),
  }
  const held = {
    Environment: {
      Variables: {
        AWS_LAMBDA_EXEC_WRAPPER: '/opt/sls-dev-wrapper',
        SLS_DEV_SESSION: 's_bob',
        SLS_DEV_OWNER: 'bob@desk',
      },
    },
  }
  const s = start({
    functions: { api: {}, shared: {} },
    live: { api: {}, shared: held },
    deps: running,
  })
  await s.whenReady
  expect(s.logger.text()).toMatch(
    /shared\s+skipped\s+in Dev Mode for bob@desk \(--take-over to take it\)/,
  )
  expect(
    s.lambda.state.get('svc-dev-shared').Environment.Variables.SLS_DEV_SESSION,
  ).toBe('s_bob')
  s.proc.emit('SIGINT', 'SIGINT')
  await s.result
  expect(
    s.lambda.state.get('svc-dev-shared').Environment.Variables.SLS_DEV_SESSION,
  ).toBe('s_bob')

  const t = start({
    functions: { shared: {} },
    live: { shared: held },
    options: { 'take-over': true },
    deps: running,
  })
  await t.whenReady
  expect(
    t.lambda.state.get('svc-dev-shared').Environment.Variables.SLS_DEV_OWNER,
  ).toBe('alice@mbp')
  t.proc.emit('SIGINT', 'SIGINT')
  expect(await t.result).toBe(0)
})

test('your own crashed session is re-attached and reported', async () => {
  const leftover = {
    Environment: {
      Variables: {
        AWS_LAMBDA_EXEC_WRAPPER: '/opt/sls-dev-wrapper',
        SLS_DEV_SESSION: 's_crashed',
        SLS_DEV_OWNER: 'alice@mbp',
        SLS_DEV_ATTACHED_AT: '1790000000',
      },
    },
    Layers: [
      {
        Arn: 'arn:aws:lambda:us-east-1:123456789012:layer:serverless-dev-arm64:1',
      },
    ],
  }
  const s = start({ functions: { api: {} }, live: { api: leftover } })
  await s.whenReady
  expect(s.logger.text()).toContain(
    '1 function still had Dev Mode configuration from an earlier session of yours',
  )
  s.proc.emit('SIGINT', 'SIGINT')
  expect(await s.result).toBe(0)
  expect(s.lambda.state.get('svc-dev-api').Environment.Variables).toEqual({})
  expect(s.lambda.state.get('svc-dev-api').Layers).toEqual([])
})

test('the restored count leaves out functions something else already restored', async () => {
  const s = start(four)
  await s.whenReady
  // A deploy during the session put api back on its deployed configuration.
  s.lambda.touch('svc-dev-api', () => ({
    Layers: [],
    Environment: { Variables: {} },
  }))
  s.proc.emit('SIGINT', 'SIGINT')
  expect(await s.result).toBe(0)
  expect(s.logger.text()).toMatch(/Dev Mode off · 1 function restored \(/)
})

test('a failed attach shows why and makes the exit code 3', async () => {
  const lambda = fakeLambda({ 'svc-dev-api': {}, 'svc-dev-bad': {} })
  failFor(
    lambda,
    'svc-dev-bad',
    Object.assign(new Error('boom'), { name: 'ServiceException' }),
  )
  const s = start({ functions: { api: {}, bad: {} }, lambda })
  await s.whenReady
  expect(s.logger.text()).toMatch(/bad\s+deployed\s+attach failed: boom/)
  s.proc.emit('SIGINT', 'SIGINT')
  expect(await s.result).toBe(3)
})

test('an error reading one function fails only that function', async () => {
  const lambda = fakeLambda({ 'svc-dev-api': {}, 'svc-dev-bad': {} })
  const realGet = lambda.getFunction
  let reads = 0
  lambda.getFunction = async (name) => {
    // The planning read succeeds; the read just before the write fails.
    if (name === 'svc-dev-bad' && ++reads > 1) {
      throw Object.assign(new Error('socket hang up'), { code: 'ECONNRESET' })
    }
    return realGet(name)
  }
  const s = start({ functions: { api: {}, bad: {} }, lambda })
  await s.whenReady
  expect(s.logger.text()).toMatch(
    /bad\s+deployed\s+attach failed: socket hang up/,
  )
  expect(
    s.lambda.state.get('svc-dev-api').Environment.Variables.SLS_DEV_SESSION,
  ).toBe(testSessionId(1))
  s.proc.emit('SIGINT', 'SIGINT')
  expect(await s.result).toBe(3)
  expect(s.logger.text()).toMatch(/Dev Mode off · 1 function restored \(/)
})

test('a function whose update times out after the write is restored with the others', async () => {
  const lambda = fakeLambda({ 'svc-dev-api': {}, 'svc-dev-slow': {} })
  const before = shapes(lambda)
  let stuck = true
  const realUpdate = lambda.updateFunctionConfiguration
  lambda.updateFunctionConfiguration = async (params) => {
    const result = await realUpdate(params)
    if (params.FunctionName === 'svc-dev-slow' && stuck) {
      lambda.state.get('svc-dev-slow').LastUpdateStatus = 'InProgress'
    }
    return result
  }
  const realGet = lambda.getFunction
  lambda.getFunction = async (name) => {
    const config = await realGet(name)
    if (config && name === 'svc-dev-slow' && !stuck) {
      config.LastUpdateStatus = 'Successful'
    }
    return config
  }
  const s = start({
    functions: { api: {}, slow: {} },
    lambda,
    deps: { now: ticking() },
  })
  await s.whenReady
  expect(s.logger.text()).toMatch(
    /slow\s+deployed\s+attach failed: .*did not finish/,
  )
  stuck = false
  s.proc.emit('SIGINT', 'SIGINT')
  expect(await s.result).toBe(3)
  expect(shapes(lambda).replace(/"LastUpdateStatus":"\w+",?/g, '')).toBe(
    before.replace(/"LastUpdateStatus":"\w+",?/g, ''),
  )
  expect(
    updates(lambda).filter((p) => p.FunctionName === 'svc-dev-slow'),
  ).toHaveLength(2)
})

test('a function whose update failed after the write is restored with the others', async () => {
  const lambda = fakeLambda({ 'svc-dev-api': {}, 'svc-dev-bad': {} })
  const before = shapes(lambda)
  const realUpdate = lambda.updateFunctionConfiguration
  let failNext = true
  lambda.updateFunctionConfiguration = async (params) => {
    const result = await realUpdate(params)
    if (params.FunctionName === 'svc-dev-bad' && failNext) {
      failNext = false
      Object.assign(lambda.state.get('svc-dev-bad'), {
        LastUpdateStatus: 'Failed',
        LastUpdateStatusReason: 'KMS key is disabled',
      })
    }
    return result
  }
  const s = start({ functions: { api: {}, bad: {} }, lambda })
  await s.whenReady
  expect(s.logger.text()).toMatch(
    /bad\s+deployed\s+attach failed: KMS key is disabled/,
  )
  s.proc.emit('SIGINT', 'SIGINT')
  expect(await s.result).toBe(3)
  expect(
    lambda.state.get('svc-dev-bad').Environment.Variables.SLS_DEV_SESSION,
  ).toBeUndefined()
  expect(shapes(lambda).replace(/"LastUpdateStatus[^,]*,?/g, '')).toBe(
    before.replace(/"LastUpdateStatus[^,]*,?/g, ''),
  )
})

test('a second Ctrl+C names a function whose update may have been applied', async () => {
  const lambda = fakeLambda({ 'svc-dev-api': {}, 'svc-dev-bad': {} })
  const realUpdate = lambda.updateFunctionConfiguration
  lambda.updateFunctionConfiguration = async (params) => {
    const result = await realUpdate(params)
    if (params.FunctionName === 'svc-dev-bad') {
      Object.assign(lambda.state.get('svc-dev-bad'), {
        LastUpdateStatus: 'Failed',
        LastUpdateStatusReason: 'boom',
      })
    }
    return result
  }
  const clock = handClock()
  const s = start({
    functions: { api: {}, bad: {} },
    lambda,
    deps: { now: clock.now, elapsed: clock.now },
  })
  await s.whenReady
  s.proc.emit('SIGINT', 'SIGINT')
  clock.advance(501)
  s.proc.emit('SIGINT', 'SIGINT')
  expect(s.logger.text()).toContain('Not restored: svc-dev-api, svc-dev-bad.')
  await s.result
})

test('a limit Lambda enforces on the update is shown as deployed and is not a failure', async () => {
  const lambda = fakeLambda({ 'svc-dev-api': {}, 'svc-dev-big': {} })
  failFor(
    lambda,
    'svc-dev-big',
    Object.assign(
      new Error(
        'Layers consume more than the available size of 262144000 bytes',
      ),
      { name: 'InvalidParameterValueException' },
    ),
  )
  const s = start({ functions: { api: {}, big: {} }, lambda })
  await s.whenReady
  expect(s.logger.text()).toMatch(
    /big\s+deployed\s+code and layers would exceed the 250 MB unzipped limit/,
  )
  s.proc.emit('SIGINT', 'SIGINT')
  expect(await s.result).toBe(0)
})

test('when Lambda rejects every attach the session ends with nothing attached', async () => {
  const lambda = fakeLambda({ 'svc-dev-big': {} })
  failFor(
    lambda,
    'svc-dev-big',
    Object.assign(new Error('… 262144000 bytes'), {
      name: 'InvalidParameterValueException',
    }),
  )
  const s = start({ functions: { big: {} }, lambda })
  const error = await s.result.catch((e) => e)
  expect(error.code).toBe('DEV_MODE_NOTHING_TO_ATTACH')
  const planned = start({
    functions: { report: {} },
    live: { report: { Runtime: 'java21' } },
  })
  const plannedError = await planned.result.catch((e) => e)
  expect(error.message).toBe(plannedError.message)
  expect(s.proc.listenerCount('SIGINT')).toBe(0)
})

test('--function limits the session; an unknown name fails before any AWS call', async () => {
  const s = start({ ...four, options: { function: ['api'] } })
  await s.whenReady
  expect(updates(s.lambda).map((p) => p.FunctionName)).toEqual(['svc-dev-api'])
  expect(s.logger.text()).toMatch(
    /worker\s+deployed\s+not selected \(--function\)/,
  )
  s.proc.emit('SIGINT', 'SIGINT')
  await s.result
  const bad = start({ ...four, options: { function: ['nope'] } })
  await expect(bad.result).rejects.toMatchObject({
    code: 'DEV_MODE_UNKNOWN_FUNCTION',
  })
  expect(bad.lambda.calls).toEqual([])
})

test('--skip-function keeps a function on its deployed code', async () => {
  const s = start({ ...four, options: { 'skip-function': ['worker'] } })
  await s.whenReady
  expect(updates(s.lambda).map((p) => p.FunctionName)).toEqual(['svc-dev-api'])
  expect(s.logger.text()).toMatch(
    /worker\s+deployed\s+not selected \(--skip-function\)/,
  )
  s.proc.emit('SIGINT', 'SIGINT')
  expect(await s.result).toBe(0)
})

test('a region without IoT Core fails before anything changes', async () => {
  const s = start({
    ...four,
    iot: fakeIot(
      Object.assign(new Error('getaddrinfo ENOTFOUND'), { code: 'ENOTFOUND' }),
    ),
    deps: { lookup: async () => ({ address: '1.2.3.4' }) },
  })
  await expect(s.result).rejects.toMatchObject({
    code: 'DEV_MODE_REGION_NO_BROKER',
  })
  expect(s.lambda.calls).toEqual([])
})

test('a function whose timeout is too short is not attached, and the table says why', async () => {
  const s = start({
    functions: { api: {}, worker: {} },
    live: { api: { Timeout: 2 }, worker: { Timeout: 6 } },
  })
  await s.whenReady
  expect(s.logger.text()).toMatch(
    /api\s+deployed\s+timeout of 2s is too short to run on this machine/,
  )
  expect(updates(s.lambda).map((params) => params.FunctionName)).toEqual([
    'svc-dev-worker',
  ])
  s.proc.emit('SIGINT', 'SIGINT')
  expect(await s.result).toBe(0)
})

test('a stage whose functions all have a timeout under 3 s is not deployed', async () => {
  const s = start({
    functions: { api: { timeout: 2 }, worker: { timeout: 1 } },
    stackExists: false,
  })
  await expect(s.result).rejects.toMatchObject({
    code: 'DEV_MODE_NOTHING_TO_ATTACH',
  })
  expect(s.serverless.pluginManager.spawned).toEqual([])
  expect(s.lambda.calls).toEqual([])
  const text = s.logger.text()
  expect(text).toMatch(
    /api\s+deployed\s+timeout of 2s is too short to run on this machine/,
  )
  expect(text).toMatch(
    /worker\s+deployed\s+timeout of 1s is too short to run on this machine/,
  )
})

test('nothing eligible prints the table and creates nothing', async () => {
  const s = start({
    functions: { report: {} },
    live: { report: { Runtime: 'java21' } },
  })
  await expect(s.result).rejects.toMatchObject({
    code: 'DEV_MODE_NOTHING_TO_ATTACH',
  })
  expect(s.logger.text()).toMatch(/report\s+deployed\s+Java runtime/)
  expect(s.iam.calls.map(([op]) => op)).toEqual(['getRole'])
  expect(s.lambda.calls.filter(([op]) => op === 'publishLayerVersion')).toEqual(
    [],
  )
})

test('--approve asks in a terminal; no changes when declined', async () => {
  const s = start({
    ...four,
    options: { approve: true },
    interactive: true,
    confirmAnswer: false,
  })
  expect(await s.result).toBe(0)
  expect(updates(s.lambda)).toEqual([])
  expect(s.iam.calls.filter(([op]) => op === 'createRole')).toEqual([])
  expect(s.logger.text()).toContain('Nothing was changed.')
})

test('--approve without a terminal changes nothing and fails', async () => {
  const s = start({
    ...four,
    options: { approve: true },
    deps: { isAgent: () => false },
  })
  const error = await s.result.catch((e) => e)
  expect(error.code).toBe('DEV_MODE_APPROVE_NEEDS_TERMINAL')
  expect(error.message).toBe(
    '--approve needs an interactive terminal to ask for confirmation. Nothing was changed. Run "serverless dev --approve" in a terminal, or run "serverless dev" without --approve to make the changes without asking.',
  )
  expect(updates(s.lambda)).toEqual([])
  expect(s.iam.calls.filter(([op]) => op === 'createRole')).toEqual([])
  expect(s.asked).toEqual([])
  expect(s.proc.listenerCount('SIGINT')).toBe(0)
})

test('--approve from an AI agent changes nothing and says how to proceed', async () => {
  const s = start({
    ...four,
    options: { approve: true },
    deps: { isAgent: () => true },
  })
  const error = await s.result.catch((e) => e)
  expect(error.code).toBe('DEV_MODE_APPROVE_NEEDS_TERMINAL')
  expect(error.message).toBe(
    '--approve needs a person at an interactive terminal to confirm the changes, and this session has none. Nothing was changed. To make the changes without asking, run "serverless dev" without --approve.',
  )
  expect(updates(s.lambda)).toEqual([])
  expect(s.lambda.calls.filter(([op]) => op === 'publishLayerVersion')).toEqual(
    [],
  )
})

test('a failed --on-exit remove reports its error after a single restore', async () => {
  const s = start({
    ...four,
    options: { 'on-exit': 'remove' },
    interactive: true,
  })
  const before = shapes(s.lambda)
  s.serverless.pluginManager.spawn = async () => {
    throw new Error('stack is in UPDATE_IN_PROGRESS')
  }
  await s.whenReady
  s.proc.emit('SIGINT', 'SIGINT')
  await expect(s.result).rejects.toThrow('stack is in UPDATE_IN_PROGRESS')
  expect(shapes(s.lambda)).toBe(before)
  const text = s.logger.text()
  expect(
    s.progress
      .texts('main')
      .filter((line) => line.startsWith('Restoring 2 functions (0/2)')),
  ).toHaveLength(1)
  expect(text.match(/Dev Mode off/g)).toHaveLength(1)
})

test('a stage that was never deployed is deployed first, as a normal deploy, then attached', async () => {
  const options = { function: ['api'] }
  const s = start({ ...four, stackExists: false, options })
  const seen = []
  s.serverless.pluginManager.spawn = async (name) => {
    seen.push({
      name,
      devmodeEnabled: s.serverless.devmodeEnabled,
      only: options.function,
    })
  }
  await s.whenReady
  expect(seen).toEqual([
    { name: 'deploy', devmodeEnabled: undefined, only: undefined },
  ])
  expect(options.function).toEqual(['api'])
  expect(s.serverless.devmodeEnabled).toBe(true)
  expect(s.logger.lines).toContainEqual({
    level: 'notice',
    text: 'Stage "dev" is not deployed yet: deploying it first.',
  })
  expect(s.logger.text()).toMatch(/Service deployed to stack svc-dev \(\d+s\)/)
  expect(updates(s.lambda).map((p) => p.FunctionName)).toEqual(['svc-dev-api'])
  s.proc.emit('SIGINT', 'SIGINT')
  expect(await s.result).toBe(0)
})

test('the first deploy ships every function: --skip-function only chooses what is attached', async () => {
  const options = { 'skip-function': ['worker'] }
  const s = start({ ...four, stackExists: false, options })
  let during
  s.serverless.pluginManager.spawn = async () => {
    during = { ...options }
  }
  await s.whenReady
  expect(during).toEqual({})
  expect(options).toEqual({ 'skip-function': ['worker'] })
  expect(updates(s.lambda).map((p) => p.FunctionName)).toEqual(['svc-dev-api'])
  s.proc.emit('SIGINT', 'SIGINT')
  expect(await s.result).toBe(0)
})

test('declining --approve before the first deploy deploys nothing', async () => {
  const s = start({
    ...four,
    stackExists: false,
    options: { approve: true },
    interactive: true,
    confirmAnswer: false,
  })
  expect(await s.result).toBe(0)
  expect(s.serverless.pluginManager.spawned).toEqual([])
  expect(updates(s.lambda)).toEqual([])
  expect(s.asked).toEqual(['Continue?'])
  expect(s.logger.text()).toContain('Nothing was changed.')
})

test('--approve on a stage that was never deployed asks before the deploy and again before attaching', async () => {
  const s = start({
    ...four,
    stackExists: false,
    options: { approve: true },
    interactive: true,
    confirmAnswer: [true, true],
  })
  await s.whenReady
  expect(s.serverless.pluginManager.spawned).toEqual(['deploy'])
  expect(s.asked).toEqual(['Continue?', 'Continue?'])
  const [beforeDeploy, beforeAttach] = s.shownWhenAsked
  // The first question covers the deployment and the account setup known so far.
  expect(beforeDeploy).toContain('Stage "dev" is not deployed yet.')
  expect(beforeDeploy).toContain(
    'create IAM role serverless-dev-broker-us-east-1',
  )
  expect(beforeDeploy).not.toContain('These changes will be made')
  expect(beforeDeploy).not.toContain('Service deployed')
  // The second follows the deployment and the full list of what attaching changes.
  expect(beforeAttach).toMatch(/Service deployed to stack svc-dev \(\d+s\)/)
  expect(beforeAttach).toContain('publish Lambda layer serverless-dev-arm64')
  expect(beforeAttach).toContain('These changes will be made to 2 functions')
  expect(updates(s.lambda).map((p) => p.FunctionName)).toEqual([
    'svc-dev-api',
    'svc-dev-worker',
  ])
  s.proc.emit('SIGINT', 'SIGINT')
  expect(await s.result).toBe(0)
})

test("the artifacts the first deployment's packaging sets are not taken for package.artifact", async () => {
  const serviceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sls-dev-pkg-'))
  try {
    // A handler a build writes (not in the service's files), on a function with no artifact.
    const functions = {
      api: { handler: 'dist/api.handler', package: {} },
      worker: { handler: 'dist/worker.handler', package: {} },
    }
    const s = start({
      functions,
      live: { api: {}, worker: {} },
      stackExists: false,
      serviceDir,
    })
    s.serverless.pluginManager.spawn = async (name) => {
      s.serverless.pluginManager.spawned.push(name)
      // As packaging does for every function it zips.
      for (const fn of Object.values(functions)) {
        fn.package.artifact = path.join(serviceDir, '.serverless', 'svc.zip')
      }
    }
    await s.whenReady
    expect(s.serverless.pluginManager.spawned).toEqual(['deploy'])
    expect(updates(s.lambda).map((p) => p.FunctionName)).toEqual([
      'svc-dev-api',
      'svc-dev-worker',
    ])
    s.proc.emit('SIGINT', 'SIGINT')
    expect(await s.result).toBe(0)
  } finally {
    fs.rmSync(serviceDir, { recursive: true, force: true })
  }
})

test('a function deployed from package.artifact whose handler is not in the service stays on its deployed code', async () => {
  const serviceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sls-dev-pkg-'))
  try {
    fs.mkdirSync(path.join(serviceDir, 'src'))
    fs.writeFileSync(path.join(serviceDir, 'src', 'worker.js'), '')
    const s = start({
      functions: {
        api: {
          handler: 'dist/api.handler',
          package: { artifact: 'build/api.zip' },
        },
        worker: {
          handler: 'src/worker.handler',
          package: { artifact: 'build/worker.zip' },
        },
      },
      live: { api: {}, worker: {} },
      serviceDir,
    })
    await s.whenReady
    expect(updates(s.lambda).map((p) => p.FunctionName)).toEqual([
      'svc-dev-worker',
    ])
    expect(s.logger.text()).toMatch(
      /api\s+deployed\s+its handler is only in package\.artifact, not in this service's files/,
    )
    s.proc.emit('SIGINT', 'SIGINT')
    expect(await s.result).toBe(0)
  } finally {
    fs.rmSync(serviceDir, { recursive: true, force: true })
  }
})

test('answering no before attaching leaves the new stage deployed and attaches nothing', async () => {
  const s = start({
    ...four,
    stackExists: false,
    options: { approve: true },
    interactive: true,
    confirmAnswer: [true, false],
  })
  expect(await s.result).toBe(0)
  expect(s.serverless.pluginManager.spawned).toEqual(['deploy'])
  expect(s.asked).toEqual(['Continue?', 'Continue?'])
  expect(updates(s.lambda)).toEqual([])
  expect(s.iam.calls.filter(([op]) => op === 'createRole')).toEqual([])
  expect(s.lambda.calls.filter(([op]) => op === 'publishLayerVersion')).toEqual(
    [],
  )
  expect(s.serverless.devmodeEnabled).toBeUndefined()
  expect(s.logger.text()).toContain('Stage deployed; nothing attached.')
  expect(s.logger.text()).not.toContain('Nothing was changed.')
  expect(s.proc.listenerCount('SIGINT')).toBe(0)
})

test('a stage whose selected functions can never run in dev is not deployed', async () => {
  const s = start({
    functions: {
      api: { provisionedConcurrency: 1 },
      worker: { image: 'repo/worker:latest' },
      report: { runtime: 'java21' },
      edge: {},
    },
    stackExists: false,
    options: { 'skip-function': ['edge'] },
  })
  await expect(s.result).rejects.toMatchObject({
    code: 'DEV_MODE_NOTHING_TO_ATTACH',
  })
  expect(s.serverless.pluginManager.spawned).toEqual([])
  expect(s.lambda.calls).toEqual([])
  const text = s.logger.text()
  expect(text).toMatch(
    /api\s+deployed\s+provisioned concurrency \(Dev Mode support planned\)/,
  )
  expect(text).toMatch(/worker\s+deployed\s+container image/)
  expect(text).toMatch(/report\s+deployed\s+Java runtime/)
  expect(text).toMatch(/edge\s+deployed\s+not selected \(--skip-function\)/)
  expect(text).not.toContain('is not deployed yet')
})

test('--approve without a terminal on a stage that was never deployed deploys nothing', async () => {
  const s = start({
    ...four,
    stackExists: false,
    options: { approve: true },
    deps: { isAgent: () => true },
  })
  await expect(s.result).rejects.toMatchObject({
    code: 'DEV_MODE_APPROVE_NEEDS_TERMINAL',
  })
  expect(s.serverless.pluginManager.spawned).toEqual([])
  expect(updates(s.lambda)).toEqual([])
  expect(s.asked).toEqual([])
  expect(s.proc.listenerCount('SIGINT')).toBe(0)
})

test('Ctrl+C during the first deploy lets the deployment step end and attaches nothing', async () => {
  const s = start({ ...four, stackExists: false })
  let listening
  s.serverless.pluginManager.spawn = async () => {
    listening = s.proc.listenerCount('SIGINT')
    s.proc.emit('SIGINT', 'SIGINT')
  }
  expect(await s.result).toBe(0)
  expect(listening).toBe(1)
  expect(updates(s.lambda)).toEqual([])
  expect(s.iam.calls.filter(([op]) => op === 'createRole')).toEqual([])
  expect(s.lambda.calls.filter(([op]) => op === 'publishLayerVersion')).toEqual(
    [],
  )
  expect(s.serverless.devmodeEnabled).toBeUndefined()
  const text = s.logger.text()
  expect(s.progress.texts('main')).toContain(
    'Stopping after the deployment · press Ctrl+C again to exit without waiting',
  )
  expect(text).toMatch(/Service deployed to stack svc-dev \(\d+s\)/)
  expect(text).toContain('Dev Mode off · no function was changed')
  expect(text).not.toContain('Dev Mode on ·')
  expect(s.proc.listenerCount('SIGINT')).toBe(0)
  expect(s.proc.exits).toEqual([])
})

test('a second Ctrl+C during the first deploy exits at once and says the deployment may continue', async () => {
  const clock = handClock()
  const s = start({
    ...four,
    stackExists: false,
    deps: { now: clock.now, elapsed: clock.now },
  })
  let finishDeploy
  let deploying
  const deployStarted = new Promise((resolve) => {
    deploying = resolve
  })
  s.serverless.pluginManager.spawn = () =>
    new Promise((resolve) => {
      finishDeploy = resolve
      s.proc.emit('SIGINT', 'SIGINT')
      clock.advance(501)
      s.proc.emit('SIGINT', 'SIGINT')
      deploying()
    })
  await deployStarted
  expect(s.proc.exits).toEqual([0])
  expect(s.logger.text()).toContain(
    'Exiting without waiting. The deployment of stage "dev" may continue in AWS CloudFormation; no function was attached.',
  )
  finishDeploy()
  expect(await s.result).toBe(0)
  expect(updates(s.lambda)).toEqual([])
})

test('a first deploy that fails is reported as is and attaches nothing', async () => {
  const options = { function: ['api'] }
  const s = start({ ...four, stackExists: false, options })
  s.serverless.pluginManager.spawn = async () => {
    throw new Error('CREATE_FAILED: ApiLambdaFunction')
  }
  await expect(s.result).rejects.toThrow('CREATE_FAILED: ApiLambdaFunction')
  expect(options).toEqual({ function: ['api'] })
  expect(updates(s.lambda)).toEqual([])
  expect(s.serverless.devmodeEnabled).toBeUndefined()
  expect(s.proc.listenerCount('SIGINT')).toBe(0)
  expect(s.logger.text()).not.toContain('Service deployed')
})

test('a denied layer publish names the permission and changes no function', async () => {
  const s = start(four)
  s.lambda.publishLayerVersion = async () => {
    throw denied('lambda:PublishLayerVersion')
  }
  const error = await s.result.catch((e) => e)
  expect(error.code).toBe('DEV_MODE_LAYER_ACCESS_DENIED')
  expect(error.message).toContain('lambda:PublishLayerVersion')
  expect(updates(s.lambda)).toEqual([])
  expect(s.proc.listenerCount('SIGINT')).toBe(0)
})

test('a denied layer listing names the permission before anything changes', async () => {
  const s = start(four)
  s.lambda.listLayerVersions = async function* () {
    yield* []
    throw denied('lambda:ListLayerVersions')
  }
  const error = await s.result.catch((e) => e)
  expect(error.code).toBe('DEV_MODE_LAYER_ACCESS_DENIED')
  expect(error.message).toContain('lambda:ListLayerVersions')
  expect(s.iam.calls.filter(([op]) => op === 'createRole')).toEqual([])
  expect(updates(s.lambda)).toEqual([])
})

test('expired credentials while publishing the layer are reported as such', async () => {
  const s = start(four)
  s.lambda.publishLayerVersion = async () => {
    throw Object.assign(
      new Error('The security token included in the request is expired'),
      {
        name: 'ExpiredTokenException',
      },
    )
  }
  await expect(s.result).rejects.toMatchObject({
    code: 'DEV_MODE_AWS_CREDENTIALS_INVALID',
  })
  expect(updates(s.lambda)).toEqual([])
})

// What provider.request throws: a ServerlessError wrapping the AWS error. AWS SDK v2 errors carry
// `code` and `statusCode`; v3 errors carry `name` and `$metadata`.
const providerRequestError = (code, message, statusCode, { v3 = false } = {}) =>
  Object.assign(new Error(message), {
    name: 'ServerlessError',
    code: `AWS_PROVIDER_REQUEST_${code.toUpperCase()}`,
    providerError: v3
      ? {
          name: code,
          code,
          statusCode,
          $metadata: { httpStatusCode: statusCode },
        }
      : { code, statusCode, message },
  })

const withRequest = (request, overrides = {}) => ({
  ...fakeProvider(),
  request,
  ...overrides,
})

test('a denied stack check names cloudformation:DescribeStacks and changes nothing', async () => {
  for (const v3 of [false, true]) {
    const requested = []
    const s = start({
      ...four,
      provider: withRequest(async (service, method, params) => {
        requested.push([service, method, params])
        throw providerRequestError(
          'AccessDenied',
          'User is not authorized to perform: cloudformation:DescribeStacks',
          403,
          { v3 },
        )
      }),
      deps: { stackExists: undefined },
    })
    const error = await s.result.catch((e) => e)
    expect(requested).toEqual([
      ['CloudFormation', 'describeStacks', { StackName: 'svc-dev' }],
    ])
    expect(error.code).toBe('DEV_MODE_STACK_ACCESS_DENIED')
    expect(error.message).toContain('cloudformation:DescribeStacks')
    expect(error.message).toContain('us-east-1')
    expect(error.message).toContain('User is not authorized')
    expect(error.originalName).toBe('AccessDenied')
    expect(updates(s.lambda)).toEqual([])
    expect(s.serverless.pluginManager.spawned).toEqual([])
    expect(s.proc.listenerCount('SIGINT')).toBe(0)
  }
})

test('expired credentials on the stack check are reported as such', async () => {
  for (const [code, v3] of [
    ['ExpiredToken', false],
    ['ExpiredTokenException', true],
    ['InvalidClientTokenId', false],
  ]) {
    const s = start({
      ...four,
      provider: withRequest(async () => {
        throw providerRequestError(
          code,
          'The security token included in the request is expired',
          403,
          { v3 },
        )
      }),
      deps: { stackExists: undefined },
    })
    const error = await s.result.catch((e) => e)
    expect(error.code).toBe('DEV_MODE_AWS_CREDENTIALS_INVALID')
    expect(error.message).toContain('is expired')
    expect(error.message).not.toContain('cloudformation:DescribeStacks')
    expect(updates(s.lambda)).toEqual([])
  }
})

test('a stack that does not exist is deployed first; other stack check errors are reported as is', async () => {
  const missing = start({
    ...four,
    provider: withRequest(async () => {
      throw providerRequestError(
        'ValidationError',
        'Stack with id svc-dev does not exist',
        400,
      )
    }),
    deps: { stackExists: undefined },
  })
  await missing.whenReady
  expect(missing.serverless.pluginManager.spawned).toEqual(['deploy'])
  missing.proc.emit('SIGINT', 'SIGINT')
  expect(await missing.result).toBe(0)

  const throttled = providerRequestError('Throttling', 'Rate exceeded', 400)
  const s = start({
    ...four,
    provider: withRequest(async () => {
      throw throttled
    }),
    deps: { stackExists: undefined },
  })
  expect(await s.result.catch((e) => e)).toBe(throttled)
})

test('a denied caller identity names sts:GetCallerIdentity and changes nothing', async () => {
  const s = start({
    ...four,
    provider: {
      ...fakeProvider(),
      getAccountInfo: async () => {
        throw providerRequestError(
          'AccessDenied',
          'User is not authorized to perform: sts:GetCallerIdentity',
          403,
        )
      },
    },
  })
  const error = await s.result.catch((e) => e)
  expect(error.code).toBe('DEV_MODE_IDENTITY_ACCESS_DENIED')
  expect(error.message).toContain('sts:GetCallerIdentity')
  expect(error.message).toContain('User is not authorized')
  expect(s.iam.calls).toEqual([])
  expect(updates(s.lambda)).toEqual([])
})

test('expired credentials on the caller identity are reported as such', async () => {
  for (const v3 of [false, true]) {
    const s = start({
      ...four,
      provider: {
        ...fakeProvider(),
        getAccountInfo: async () => {
          throw providerRequestError(
            'ExpiredToken',
            'The security token included in the request is expired',
            403,
            { v3 },
          )
        },
      },
    })
    const error = await s.result.catch((e) => e)
    expect(error.code).toBe('DEV_MODE_AWS_CREDENTIALS_INVALID')
    expect(error.message).not.toContain('sts:GetCallerIdentity')
    expect(s.iam.calls).toEqual([])
  }
})

test('defaultOwner and newSessionId', () => {
  expect(
    defaultOwner({
      osRef: {
        userInfo: () => ({ username: 'alice' }),
        hostname: () => 'mbp.local',
      },
    }),
  ).toBe('alice@mbp')
  expect(
    defaultOwner({
      osRef: {
        userInfo: () => {
          throw new Error('no passwd')
        },
        hostname: () => 'box',
      },
      env: { USER: 'ci' },
    }),
  ).toBe('ci@box')
  expect(newSessionId(() => Buffer.from('abcdef'))).toBe(
    `s_${Buffer.from('abcdef').toString('hex')}`,
  )
})

test('defaultOwner names one machine the same way however its host name is cased', () => {
  const owner = (hostname) =>
    defaultOwner({
      osRef: {
        userInfo: () => ({ username: 'alice' }),
        hostname: () => hostname,
      },
    })
  expect(owner('Alices-MacBook-Pro.local')).toBe('alice@alices-macbook-pro')
  expect(owner('ALICES-MACBOOK-PRO.LOCAL')).toBe('alice@alices-macbook-pro')
  expect(owner('alices-macbook-pro')).toBe('alice@alices-macbook-pro')
})

const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const until = async (condition, ms = 4000) => {
  const started = Date.now()
  while (!condition()) {
    if (Date.now() - started > ms) throw new Error('condition never met')
    await pause(5)
  }
}
const warningsOf = (logger) =>
  logger.lines.filter((l) => l.level === 'warning').map((l) => l.text)
const SDK_WRAPPER = '/opt/sls-sdk-node/exec-wrapper.sh'
const replaceWrapper = (lambda, name) =>
  lambda.touch(name, (c) => ({
    Environment: {
      Variables: {
        ...c.Environment.Variables,
        AWS_LAMBDA_EXEC_WRAPPER: SDK_WRAPPER,
      },
    },
  }))

test('a wrapper replaced during the session is reported once, and exit leaves it in place', async () => {
  const s = start({
    functions: { api: {} },
    live: { api: {} },
    watchIntervalMs: 5,
  })
  await s.whenReady
  replaceWrapper(s.lambda, 'svc-dev-api')
  await until(() => warningsOf(s.logger).length > 0)
  await pause(50)
  expect(warningsOf(s.logger)).toEqual([
    expect.stringContaining(
      'api left Dev Mode: something else changed its AWS_LAMBDA_EXEC_WRAPPER',
    ),
  ])
  s.proc.emit('SIGINT', 'SIGINT')
  expect(await s.result).toBe(0)
  const api = s.lambda.state.get('svc-dev-api')
  expect(api.Environment.Variables).toEqual({
    AWS_LAMBDA_EXEC_WRAPPER: SDK_WRAPPER,
  })
  expect(api.Layers).toEqual([])
})

test('a function restored elsewhere or deleted is reported once and not read again', async () => {
  const s = start({
    functions: { api: {}, worker: {}, jobs: {} },
    live: { api: {}, worker: {}, jobs: {} },
    watchIntervalMs: 5,
  })
  await s.whenReady
  s.lambda.touch('svc-dev-worker', () => ({
    Layers: [],
    Environment: { Variables: {} },
  }))
  s.lambda.state.delete('svc-dev-jobs')
  await until(() => warningsOf(s.logger).length >= 2)
  const readsOf = (name) =>
    s.lambda.calls.filter(([op, n]) => op === 'getFunction' && n === name)
      .length
  const before = ['svc-dev-api', 'svc-dev-worker', 'svc-dev-jobs'].map(readsOf)
  await pause(50)
  expect(readsOf('svc-dev-api')).toBeGreaterThan(before[0])
  expect(readsOf('svc-dev-worker')).toBe(before[1])
  expect(readsOf('svc-dev-jobs')).toBe(before[2])
  expect(warningsOf(s.logger).sort()).toEqual([
    'jobs left Dev Mode: the function no longer exists.',
    'worker left Dev Mode: its Dev Mode configuration was removed elsewhere (serverless deploy, dev restore or another tool).',
  ])
  expect(
    updates(s.lambda).filter((p) => p.FunctionName !== 'svc-dev-api'),
  ).toHaveLength(2)
  s.proc.emit('SIGINT', 'SIGINT')
  expect(await s.result).toBe(0)
  expect(s.logger.text()).toContain(
    'Already on the deployed configuration: worker.',
  )
})

test('a check that was running when Ctrl+C came prints nothing about the functions being restored', async () => {
  const s = start({
    functions: { api: {} },
    live: { api: {} },
    watchIntervalMs: 5,
  })
  await s.whenReady
  replaceWrapper(s.lambda, 'svc-dev-api')
  const getFunction = s.lambda.getFunction
  let release
  const held = new Promise((resolve) => {
    release = resolve
  })
  let checkStarted
  const started = new Promise((resolve) => {
    checkStarted = resolve
  })
  let first = true
  s.lambda.getFunction = async (name) => {
    if (first) {
      first = false
      checkStarted()
      await held
    }
    return getFunction(name)
  }
  await started
  s.proc.emit('SIGINT', 'SIGINT')
  release()
  expect(await s.result).toBe(0)
  await pause(20)
  expect(warningsOf(s.logger)).toEqual([])
  expect(s.logger.text()).not.toContain('left Dev Mode')
})

test('failed checks stay quiet: a debug line each, and one warning once three in a row failed', async () => {
  const s = start({
    functions: { api: {} },
    live: { api: {} },
    watchIntervalMs: 5,
  })
  await s.whenReady
  const getFunction = s.lambda.getFunction
  let failing = true
  let failures = 0
  s.lambda.getFunction = async (name) => {
    if (failing) {
      failures += 1
      throw Object.assign(new Error('Rate exceeded'), {
        name: 'TooManyRequestsException',
      })
    }
    return getFunction(name)
  }
  await until(() => failures >= 6)
  failing = false
  s.proc.emit('SIGINT', 'SIGINT')
  expect(await s.result).toBe(0)
  expect(warningsOf(s.logger)).toEqual([
    'Dev Mode could not check the attached functions the last 3 times (Rate exceeded). It keeps trying; later failures show with --debug only.',
  ])
  const debug = s.logger.lines.filter(
    (l) =>
      l.level === 'debug' &&
      l.text ===
        'Dev Mode could not check the attached functions: Rate exceeded',
  )
  expect(debug.length).toBeGreaterThanOrEqual(6)
  expect(s.logger.text()).toMatch(/Dev Mode off · 1 function restored \(/)
})

test('variables that can no longer be read are reported once and never written', async () => {
  const s = start({
    functions: { api: {} },
    live: { api: {} },
    watchIntervalMs: 5,
  })
  await s.whenReady
  const writes = updates(s.lambda).length
  s.lambda.touch('svc-dev-api', () => ({
    Environment: {
      Error: {
        ErrorCode: 'KMSAccessDeniedException',
        Message: 'Lambda was unable to decrypt the environment variables',
      },
    },
  }))
  await until(() => warningsOf(s.logger).length > 0)
  await pause(50)
  expect(warningsOf(s.logger)).toEqual([
    expect.stringMatching(/^api can no longer be checked: /),
  ])
  s.proc.emit('SIGINT', 'SIGINT')
  expect(await s.result).toBe(3)
  expect(updates(s.lambda)).toHaveLength(writes)
})

const attachedBy = (lambda, name, session, owner) =>
  lambda.touch(name, (c) => ({
    Environment: {
      Variables: {
        ...c.Environment.Variables,
        SLS_DEV_SESSION: session,
        SLS_DEV_OWNER: owner,
      },
    },
  }))

test('a take-over by another session of the same person says so, not --take-over', async () => {
  const s = start({
    functions: { api: {}, worker: {} },
    live: { api: {}, worker: {} },
    watchIntervalMs: 5,
  })
  await s.whenReady
  attachedBy(s.lambda, 'svc-dev-api', testSessionId(2), 'alice@mbp')
  attachedBy(s.lambda, 'svc-dev-worker', testSessionId(3), 'bob@desk')
  await until(() => warningsOf(s.logger).length >= 2)
  await pause(50)
  expect(warningsOf(s.logger).sort()).toEqual([
    'api left Dev Mode: another Dev Mode session of yours attached it.',
    'worker left Dev Mode: bob@desk took it over with --take-over.',
  ])
  s.proc.emit('SIGINT', 'SIGINT')
  expect(await s.result).toBe(0)
  // Both stay with the sessions that took them.
  expect(
    s.lambda.state.get('svc-dev-api').Environment.Variables.SLS_DEV_SESSION,
  ).toBe(testSessionId(2))
  expect(s.logger.text()).toContain('taken over by another session')
})

test('a check that does not finish within one interval counts as a failed check, and leaves no timer behind', async () => {
  const s = start({
    functions: { api: {} },
    live: { api: {} },
    watchIntervalMs: 5,
  })
  await s.whenReady
  let hung = 0
  s.lambda.getFunctionOnce = () => {
    hung += 1
    return new Promise(() => {})
  }
  await until(() => warningsOf(s.logger).length > 0)
  expect(warningsOf(s.logger)).toEqual([
    'Dev Mode could not check the attached functions the last 3 times (AWS Lambda did not answer within 0.005 s). It keeps trying; later failures show with --debug only.',
  ])
  // Checks never overlap: the hung read holds off every later one.
  expect(hung).toBe(1)
  // Ctrl+C while a check is still waiting: the session ends and its check timer is cleared.
  s.proc.emit('SIGINT', 'SIGINT')
  expect(await s.result).toBe(0)
  expect(s.logger.text()).toMatch(/Dev Mode off · 1 function restored \(/)
})

test('a function that cannot be read is skipped for that check; the others are still reported', async () => {
  const s = start({
    functions: { api: {}, worker: {}, jobs: {} },
    live: { api: {}, worker: {}, jobs: {} },
    watchIntervalMs: 5,
  })
  await s.whenReady
  let refused = 0
  s.lambda.getFunctionOnce = async (name) => {
    if (name === 'svc-dev-worker') {
      refused += 1
      throw Object.assign(new Error('Rate exceeded'), {
        name: 'TooManyRequestsException',
      })
    }
    return s.lambda.getFunction(name)
  }
  replaceWrapper(s.lambda, 'svc-dev-jobs')
  // api still reads fine, so no check fails as a whole and no failure warning is printed.
  await until(() => warningsOf(s.logger).length > 0 && refused >= 5)
  expect(warningsOf(s.logger)).toEqual([
    expect.stringContaining('jobs left Dev Mode: something else'),
  ])
  expect(
    s.logger.lines.some(
      (l) =>
        l.level === 'debug' &&
        l.text === 'Dev Mode could not check svc-dev-worker: Rate exceeded',
    ),
  ).toBe(true)
  s.proc.emit('SIGINT', 'SIGINT')
  expect(await s.result).toBe(0)
  expect(s.logger.text()).toMatch(/Dev Mode off · 3 functions restored \(/)
})

test('a function that lost the Dev Mode layer but keeps its wrapper is reported, and exit restores it', async () => {
  const s = start({
    functions: { api: {} },
    live: { api: {} },
    watchIntervalMs: 5,
  })
  await s.whenReady
  s.lambda.touch('svc-dev-api', () => ({ Layers: [] }))
  await until(() => warningsOf(s.logger).length > 0)
  await pause(50)
  expect(warningsOf(s.logger)).toEqual([
    'api lost the Dev Mode layer but still points at its wrapper (AWS_LAMBDA_EXEC_WRAPPER); it cannot start until it is restored (serverless dev restore --stage dev --region us-east-1).',
  ])
  s.proc.emit('SIGINT', 'SIGINT')
  expect(await s.result).toBe(0)
  expect(s.lambda.state.get('svc-dev-api').Environment.Variables).toEqual({})
  expect(s.lambda.state.get('svc-dev-api').Layers).toEqual([])
})

test('starts the laptop runtime with the attached functions and their deployed configuration, and stops it after the restore', async () => {
  const order = []
  const startLaptop = jest.fn(async () => {
    order.push('laptop started')
    return { stop: async () => order.push('laptop stopped') }
  })
  const s = start({
    ...four,
    options: { detailed: true },
    deps: { startLaptop },
  })
  await s.whenReady
  const [args] = startLaptop.mock.calls[0]
  expect(args.functions.map((f) => f.key)).toEqual(['api', 'worker'])
  expect(args.functions[1].live).toMatchObject({ Runtime: 'python3.13' })
  expect(args.localRuntimes).toBe(LOCAL)
  expect(args.options).toMatchObject({ detailed: true })
  expect(s.logger.text().indexOf('Dev Mode on ·')).toBeGreaterThan(-1)
  s.lambda.beforeUpdate = () => order.push('restore')
  s.proc.emit('SIGINT', 'SIGINT')
  expect(await s.result).toBe(0)
  expect(order).toEqual(['laptop started', 'restore', 'laptop stopped'])
})

test('a laptop runtime that cannot start restores what was attached and fails the session', async () => {
  const startLaptop = async () => {
    throw Object.assign(
      new Error(
        'Dev Mode could not start the Lambda Runtime API on this machine (listen EACCES).',
      ),
      { code: 'DEV_MODE_LOCAL_RUNTIME_FAILED' },
    )
  }
  const s = start({ ...four, deps: { startLaptop } })
  const before = shapes(s.lambda)
  await expect(s.result).rejects.toMatchObject({
    code: 'DEV_MODE_LOCAL_RUNTIME_FAILED',
  })
  expect(shapes(s.lambda)).toBe(before)
})

test('timers the laptop runtime starts end with the session', async () => {
  const startLaptop = async ({ timers }) => {
    const handle = timers.setInterval(() => {}, 1000)
    return { stop: async () => timers.clearInterval(handle) }
  }
  const s = start({ ...four, deps: { startLaptop } })
  await s.whenReady
  s.proc.emit('SIGINT', 'SIGINT')
  expect(await s.result).toBe(0)
})

test('nothing attached, no laptop runtime', async () => {
  const startLaptop = jest.fn()
  const s = start({
    functions: { report: {} },
    live: { report: { Runtime: 'java21' } },
    deps: { startLaptop },
  })
  await expect(s.result).rejects.toMatchObject({
    code: 'DEV_MODE_NOTHING_TO_ATTACH',
  })
  expect(startLaptop).not.toHaveBeenCalled()
})

test('a function this machine cannot run stays on its deployed code, and the others attach', async () => {
  const s = start({
    ...four,
    deps: {
      detectLocal: async () => ({
        node: LOCAL.node,
        python: { available: false, command: null, version: null },
      }),
    },
  })
  await s.whenReady
  expect(s.logger.text()).toMatch(
    /worker\s+deployed\s+Python not found on this machine \(install Python 3\.13, or create \.venv in the service directory\)/,
  )
  expect(s.lambda.state.get('svc-dev-worker').Layers).toEqual([])
  expect(s.logger.text()).toMatch(/Dev Mode on · 1 of 4 functions/)
  s.proc.emit('SIGINT', 'SIGINT')
  expect(await s.result).toBe(0)
})

describe('MCP server functions and the Node.js on this machine', () => {
  const mcpAndPlain = {
    functions: { api: {}, crm: {} },
    live: { api: {}, crm: {} },
    // The mcp plugin's registry, built by its initialize hook.
    plugins: [{ validated: { servers: [{ name: 'crm' }] } }],
  }
  const nodeAt = (version) => async () => ({
    node: { available: true, command: 'node', version },
  })

  test('on Node.js 18.19 the MCP server stays on its deployed code with a reason, and the plain function attaches', async () => {
    const startLaptop = jest.fn(async () => ({ stop: async () => {} }))
    const s = start({
      ...mcpAndPlain,
      deps: { detectLocal: nodeAt('18.19.0'), startLaptop },
    })
    await s.whenReady
    expect(s.logger.text()).toMatch(
      /crm\s+deployed\s+Node\.js 18\.19\.0 on this machine \(MCP servers need Node\.js 20\.6 or later\)/,
    )
    expect(s.logger.text()).toMatch(/Dev Mode on · 1 of 2 functions/)
    expect(s.lambda.state.get('svc-dev-crm').Layers).toEqual([])
    const [args] = startLaptop.mock.calls[0]
    expect(args.functions.map((f) => f.key)).toEqual(['api'])
    s.proc.emit('SIGINT', 'SIGINT')
    expect(await s.result).toBe(0)
  })

  test('on a stage the session deploys first with Node.js 18.19, the deployment runs and only the plain function reaches this machine', async () => {
    const startLaptop = jest.fn(async () => ({ stop: async () => {} }))
    const s = start({
      ...mcpAndPlain,
      stackExists: false,
      deps: { detectLocal: nodeAt('18.19.0'), startLaptop },
    })
    await s.whenReady
    expect(s.serverless.pluginManager.spawned).toEqual(['deploy'])
    const [args] = startLaptop.mock.calls[0]
    expect(args.functions.map((f) => f.key)).toEqual(['api'])
    expect(s.lambda.state.get('svc-dev-crm').Layers).toEqual([])
    s.proc.emit('SIGINT', 'SIGINT')
    expect(await s.result).toBe(0)
  })

  test('on a stage the session would deploy first, a service of MCP servers only on Node.js 18.19 stops before deploying anything', async () => {
    const startLaptop = jest.fn()
    const s = start({
      functions: { crm: {}, billing: {} },
      plugins: [
        { validated: { servers: [{ name: 'crm' }, { name: 'billing' }] } },
      ],
      stackExists: false,
      deps: { detectLocal: nodeAt('18.19.0'), startLaptop },
    })
    await expect(s.result).rejects.toMatchObject({
      code: 'DEV_MODE_NOTHING_TO_ATTACH',
    })
    expect(s.logger.text()).toMatch(
      /crm\s+deployed\s+Node\.js 18\.19\.0 on this machine \(MCP servers need Node\.js 20\.6 or later\)/,
    )
    expect(s.serverless.pluginManager.spawned).toEqual([])
    expect(updates(s.lambda)).toEqual([])
    expect(startLaptop).not.toHaveBeenCalled()
  })

  test('on Node.js 20.6 or later both attach, as before', async () => {
    const startLaptop = jest.fn(async () => ({ stop: async () => {} }))
    const s = start({
      ...mcpAndPlain,
      deps: { detectLocal: nodeAt('20.6.0'), startLaptop },
    })
    await s.whenReady
    expect(s.logger.text()).toMatch(/Dev Mode on · 2 of 2 functions/)
    const [args] = startLaptop.mock.calls[0]
    expect(args.functions.map((f) => f.key)).toEqual(['api', 'crm'])
    s.proc.emit('SIGINT', 'SIGINT')
    expect(await s.result).toBe(0)
  })
})

test('a different version on this machine gets one warning per deployed runtime', async () => {
  const s = start({
    ...four,
    deps: {
      detectLocal: async () => ({
        node: { available: true, command: 'node', version: '22.11.0' },
        python: LOCAL.python,
      }),
    },
  })
  await s.whenReady
  expect(s.logger.lines).toContainEqual({
    level: 'warning',
    text: 'Node.js on this machine is 22.11.0; api is deployed on nodejs24.x. Results can differ: use Node.js 24 to match.',
  })
  expect(s.logger.text()).not.toContain('Python on this machine')
  s.proc.emit('SIGINT', 'SIGINT')
  expect(await s.result).toBe(0)
})

test('local runtimes are detected once, before any function changes', async () => {
  const seen = []
  const detectLocal = jest.fn(async (args) => {
    seen.push(
      s.lambda.calls.some(([op]) => op === 'updateFunctionConfiguration'),
    )
    return LOCAL
  })
  const s = start({ ...four, deps: { detectLocal } })
  await s.whenReady
  expect(detectLocal).toHaveBeenCalledTimes(1)
  expect(seen).toEqual([false])
  expect(detectLocal.mock.calls[0][0].runtimes).toEqual([
    'nodejs24.x',
    'python3.13',
    'java21',
    'nodejs24.x',
  ])
  s.proc.emit('SIGINT', 'SIGINT')
  expect(await s.result).toBe(0)
})

test('detects resolved runtimes once before the first deployment and reuses them after deploy', async () => {
  const detectLocal = jest.fn(async () => LOCAL)
  const order = []
  const s = start({
    functions: {
      api: { runtime: 'nodejs24.x' },
      worker: { runtime: 'python3.13' },
    },
    live: { api: {}, worker: { Runtime: 'python3.13' } },
    stackExists: false,
    deps: {
      detectLocal,
      startLaptop: async () => {
        order.push('build')
        return { stop: async () => {} }
      },
    },
  })
  s.serverless.pluginManager.spawn = async () => {
    expect(detectLocal).toHaveBeenCalledTimes(1)
    order.push('deploy')
  }
  await s.whenReady
  expect(detectLocal.mock.calls[0][0].runtimes).toEqual([
    'nodejs24.x',
    'python3.13',
  ])
  expect(detectLocal).toHaveBeenCalledTimes(1)
  expect(order).toEqual(['deploy', 'build'])
  s.proc.emit('SIGINT', 'SIGINT')
  expect(await s.result).toBe(0)
})

test('a never-deployed service with no runtime anywhere detects the default Node.js and attaches with it', async () => {
  const detectLocal = jest.fn(detectLocalRuntimes)
  const startLaptop = jest.fn(async () => ({ stop: async () => {} }))
  // The provider's own runtime resolution: function, then provider, then the Framework default.
  const provider = {
    ...fakeProvider(),
    serverless: { service: { provider: {} } },
    getRuntime: AwsProvider.prototype.getRuntime,
    getRuntimeSourceValue: AwsProvider.prototype.getRuntimeSourceValue,
    getValues: AwsProvider.prototype.getValues,
    firstValue: AwsProvider.prototype.firstValue,
  }
  const s = start({
    functions: { api: { handler: 'h.h' } },
    live: { api: { Runtime: 'nodejs20.x' } },
    stackExists: false,
    provider,
    deps: { detectLocal, startLaptop },
  })
  await s.whenReady
  expect(detectLocal).toHaveBeenCalledTimes(1)
  expect(detectLocal.mock.calls[0][0].runtimes).toEqual(['nodejs20.x'])
  const [args] = startLaptop.mock.calls[0]
  expect(args.functions.map((f) => f.key)).toEqual(['api'])
  expect(args.localRuntimes.node).toMatchObject({
    available: true,
    command: process.execPath,
  })
  s.proc.emit('SIGINT', 'SIGINT')
  expect(await s.result).toBe(0)
})

test('a function whose runtime the detection did not cover stays deployed and never reaches the laptop runtime', async () => {
  const startLaptop = jest.fn(async () => ({ stop: async () => {} }))
  const s = start({
    ...four,
    deps: { detectLocal: async () => ({ node: LOCAL.node }), startLaptop },
  })
  await s.whenReady
  expect(s.logger.text()).toMatch(
    /worker\s+deployed\s+Python not found on this machine/,
  )
  const [args] = startLaptop.mock.calls[0]
  expect(args.functions.map((f) => f.key)).toEqual(['api'])
  expect(s.lambda.state.get('svc-dev-worker').Layers).toEqual([])
  s.proc.emit('SIGINT', 'SIGINT')
  expect(await s.result).toBe(0)
})

test('a deployed runtime the pre-deployment detection did not cover is detected after the deployment', async () => {
  const detectLocal = jest.fn(async ({ runtimes }) =>
    runtimes.some((runtime) => runtime.startsWith('python'))
      ? { python: LOCAL.python }
      : { node: LOCAL.node },
  )
  const startLaptop = jest.fn(async () => ({ stop: async () => {} }))
  const s = start({
    functions: { api: {}, worker: {} },
    // Something in the deployment set worker's runtime: the stage now runs it on Python.
    live: { api: { Runtime: 'nodejs20.x' }, worker: { Runtime: 'python3.13' } },
    stackExists: false,
    deps: { detectLocal, startLaptop },
  })
  await s.whenReady
  expect(detectLocal.mock.calls.map(([args]) => args.runtimes)).toEqual([
    ['nodejs20.x', 'nodejs20.x'],
    ['python3.13'],
  ])
  const [args] = startLaptop.mock.calls[0]
  expect(args.functions.map((f) => f.key)).toEqual(['api', 'worker'])
  expect(args.localRuntimes).toEqual({
    node: LOCAL.node,
    python: LOCAL.python,
  })
  s.proc.emit('SIGINT', 'SIGINT')
  expect(await s.result).toBe(0)
})

test('does not deploy when every configured runtime is missing from this machine', async () => {
  const startLaptop = jest.fn()
  const s = start({
    functions: { worker: { runtime: 'python3.13' } },
    stackExists: false,
    deps: {
      detectLocal: async () => ({
        python: { available: false, command: null, version: null },
      }),
      startLaptop,
    },
  })
  await expect(s.result).rejects.toMatchObject({
    code: 'DEV_MODE_NOTHING_TO_ATTACH',
  })
  expect(s.serverless.pluginManager.spawned).toEqual([])
  expect(updates(s.lambda)).toEqual([])
  expect(startLaptop).not.toHaveBeenCalled()
})

test('Ctrl+C during the first dev build restores without showing startup or invocation notices', async () => {
  let releaseBuild
  const startLaptop = jest.fn(async () => {
    await new Promise((resolve) => {
      releaseBuild = resolve
    })
    return { stop: async () => {} }
  })
  const s = start({ ...four, deps: { startLaptop } })
  const before = shapes(s.lambda)
  await until(() => startLaptop.mock.calls.length === 1)
  s.proc.emit('SIGINT', 'SIGINT')
  releaseBuild()
  expect(await s.result).toBe(0)
  expect(shapes(s.lambda)).toBe(before)
  expect(s.logger.text()).not.toContain('Dev Mode on ·')
  expect(s.logger.text()).not.toContain('Press Ctrl+C to restore')
  expect(s.logger.text()).not.toContain('Run serverless deploy after changing')
})

test('a laptop stop error is debug output after restore and preserves the session result', async () => {
  const order = []
  const s = start({
    ...four,
    deps: {
      startLaptop: async () => ({
        stop: async () => {
          order.push('stopped')
          throw new Error('close failed')
        },
      }),
    },
  })
  await s.whenReady
  s.lambda.beforeUpdate = () => order.push('restore')
  s.proc.emit('SIGINT', 'SIGINT')
  expect(await s.result).toBe(0)
  expect(order).toEqual(['restore', 'stopped'])
  expect(s.logger.lines).toContainEqual({
    level: 'debug',
    text: 'Dev Mode could not stop the local runtime cleanly: close failed',
  })
})

/**
 * The session's second read of `api` (the one its attach writes against) returns `change` applied:
 * a deployment that landed between the plan and the attach.
 */
const changeOnAttachRead = (lambda, change) => {
  const read = lambda.getFunction
  let reads = 0
  lambda.getFunction = async (name) => {
    if (name === 'svc-dev-api') {
      reads += 1
      if (reads === 2) lambda.touch(name, change)
    }
    return read(name)
  }
}

test('an architecture change between the plan and the attach gets the layer of the new architecture', async () => {
  const s = start({ ...four, deps: {} })
  // The plan reads arm64 (api) and x86_64 (worker): both layers are resolved.
  changeOnAttachRead(s.lambda, () => ({ Architectures: ['x86_64'] }))
  await s.whenReady
  const write = updates(s.lambda).find(
    (params) => params.FunctionName === 'svc-dev-api',
  )
  expect(write.Layers[0]).toMatch(/:layer:serverless-dev-x86_64:\d+$/)
  s.proc.emit('SIGINT', 'SIGINT')
  expect(await s.result).toBe(0)
})

test('an architecture change to one whose layer the session did not resolve leaves the function unattached', async () => {
  const s = start({
    functions: { api: {} },
    live: { api: {} },
  })
  changeOnAttachRead(s.lambda, () => ({ Architectures: ['x86_64'] }))
  const result = await s.result.catch((error) => error)
  expect(updates(s.lambda)).toEqual([])
  // Nothing could be attached: the session ends as it does when no function is eligible.
  expect(result).toMatchObject({ code: 'DEV_MODE_NOTHING_TO_ATTACH' })
  expect(
    s.state.records.filter((record) => record.type === 'function.mode'),
  ).toEqual([
    expect.objectContaining({
      function: 'api',
      mode: 'deployed',
      reason: 'not_attached',
      why: 'not attached: its architecture changed while the session started (run serverless dev again)',
    }),
  ])
})

test('the local runtime starts from the configuration the attach wrote against', async () => {
  const started = []
  const s = start({
    ...four,
    deps: {
      startLaptop: async (args) => {
        started.push(...args.functions)
        return { stop: async () => {} }
      },
    },
  })
  changeOnAttachRead(s.lambda, () => ({
    Runtime: 'nodejs22.x',
    MemorySize: 512,
  }))
  await s.whenReady
  expect(started.find((fn) => fn.key === 'api').live).toMatchObject({
    Runtime: 'nodejs22.x',
    MemorySize: 512,
  })
  s.proc.emit('SIGINT', 'SIGINT')
  expect(await s.result).toBe(0)
})

test('the deploy and dev build use the same plugin instance with deploy strictly first', async () => {
  const order = []
  const instance = { calls: [] }
  const s = start({
    functions: { api: { handler: 'h.h', runtime: 'nodejs24.x' } },
    live: { api: {} },
    stackExists: false,
    deps: {
      startLaptop: (args) =>
        startLaptopRuntime({
          ...args,
          deps: {
            colors: false,
            createRuntime: () => ({
              start: async () => {},
              stop: async () => {},
            }),
            // Like chokidar, the watcher ends its first scan right after it starts.
            watch: () => {
              const watcher = Object.assign(new EventEmitter(), {
                close: async () => {},
              })
              setImmediate(() => watcher.emit('ready'))
              return watcher
            },
          },
        }),
    },
  })
  s.serverless.serviceDir = path.join(path.sep, 'svc')
  s.serverless.pluginManager.plugins = [instance]
  s.serverless.pluginManager.spawn = async (lifecycle) => {
    expect(s.serverless.pluginManager.plugins[0]).toBe(instance)
    instance.calls.push(lifecycle)
    order.push(lifecycle)
  }
  await s.whenReady
  expect(order).toEqual(['deploy', 'dev-build'])
  expect(instance.calls).toEqual(order)
  s.proc.emit('SIGINT', 'SIGINT')
  expect(await s.result).toBe(0)
})

describe('the dev build after a first deployment', () => {
  // A TypeScript service whose handler reads `assets/data.txt`, a file package.patterns selects.
  // The first deployment packages it with the esbuild plugin's own build and packaging, which set
  // the artifacts in the configuration.
  const tsService = ({ individually }) => {
    const serviceDir = fs.realpathSync(
      fs.mkdtempSync(path.join(os.tmpdir(), 'sls-dev-deploy-first-')),
    )
    fs.mkdirSync(path.join(serviceDir, 'src'))
    fs.mkdirSync(path.join(serviceDir, 'assets'))
    fs.writeFileSync(
      path.join(serviceDir, 'src', 'api.ts'),
      'export const handler = async (): Promise<number> => 1\n',
    )
    fs.writeFileSync(path.join(serviceDir, 'assets', 'data.txt'), 'data\n')
    fs.writeFileSync(
      path.join(serviceDir, 'package.json'),
      '{"name":"svc","private":true}\n',
    )
    const patterns = ['assets/**']
    const functions = {
      api: {
        name: 'svc-dev-api',
        handler: 'src/api.handler',
        events: [],
        ...(individually && { package: { patterns } }),
      },
    }
    const service = {
      service: 'svc',
      provider: { runtime: 'nodejs20.x' },
      package: individually ? { individually: true } : { patterns },
      build: { esbuild: { bundle: true } },
      functions,
      getFunction: (key) => functions[key],
      getAllFunctions: () => Object.keys(functions),
    }
    return { serviceDir, service }
  }

  // What the laptop runtime runs, without handler processes or a file watcher.
  const laptopWithoutProcesses = (args) =>
    startLaptopRuntime({
      ...args,
      deps: {
        colors: false,
        createRuntime: () => ({ start: async () => {}, stop: async () => {} }),
        // Like chokidar, the watcher ends its first scan right after it starts.
        watch: () => {
          const watcher = Object.assign(new EventEmitter(), {
            close: async () => {},
          })
          setImmediate(() => watcher.emit('ready'))
          return watcher
        },
      },
    })

  test.each([
    ['packaged as one artifact', false],
    ['packaged individually, with function-level patterns', true],
  ])(
    'builds every function as without the deployment, %s',
    async (name, individually) => {
      const { serviceDir, service } = tsService({ individually })
      const before = {
        service: structuredClone(service.package),
        api: structuredClone(service.functions.api.package),
      }
      const { default: Esbuild } =
        await import('../../../../../../../lib/plugins/esbuild/index.js')
      const builds = []
      const packaged = []
      try {
        const s = start({
          service,
          serviceDir,
          live: { api: { Runtime: 'nodejs20.x' } },
          stackExists: false,
          deps: { startLaptop: laptopWithoutProcesses },
        })
        s.serverless.config = { serviceDir }
        const plugin = new Esbuild(s.serverless, {})
        s.serverless.pluginManager.plugins = [plugin]
        s.serverless.pluginManager.spawn = async (lifecycle) => {
          if (lifecycle === 'deploy') {
            // What the deployment's `before:package:createDeploymentArtifacts` runs, without the
            // dependency install a service with no dependencies does not need.
            if (await plugin._shouldRun()) {
              await plugin._build()
              await plugin._package()
            }
            packaged.push(
              service.package.artifact ??
                service.functions.api.package.artifact,
            )
          }
          if (lifecycle === 'dev-build') {
            await plugin.hooks['before:dev-build:build']()
            builds.push(s.serverless.devBuildRequest.result())
          }
        }
        await s.whenReady
        expect(packaged).toEqual([expect.stringMatching(/\.zip$/)])
        expect(builds).toEqual([{ covered: ['api'], built: ['api'] }])
        const buildDir = path.join(serviceDir, '.serverless', 'build')
        expect(fs.existsSync(path.join(buildDir, 'src', 'api.js'))).toBe(true)
        expect(
          fs.readFileSync(path.join(buildDir, 'assets', 'data.txt'), 'utf8'),
        ).toBe('data\n')
        // The configuration is as serverless.yml has it again.
        expect(service.package).toEqual(before.service)
        expect(service.functions.api.package).toEqual(before.api)
        s.proc.emit('SIGINT', 'SIGINT')
        expect(await s.result).toBe(0)
      } finally {
        fs.rmSync(serviceDir, { recursive: true, force: true })
      }
    },
    60_000,
  )

  test('a build plugin that reads the configuration afresh builds every function after the deployment', async () => {
    // The configuration packaging leaves, read by a plugin instance that did not take part in the
    // deployment and so has nothing remembered from it.
    const { serviceDir, service } = tsService({ individually: false })
    const { default: Esbuild } =
      await import('../../../../../../../lib/plugins/esbuild/index.js')
    const builds = []
    try {
      const s = start({
        service,
        serviceDir,
        live: { api: { Runtime: 'nodejs20.x' } },
        stackExists: false,
        deps: { startLaptop: laptopWithoutProcesses },
      })
      s.serverless.config = { serviceDir }
      const plugin = new Esbuild(s.serverless, {})
      s.serverless.pluginManager.plugins = [plugin]
      s.serverless.pluginManager.spawn = async (lifecycle) => {
        if (lifecycle === 'deploy') {
          service.package.artifact = path.join(
            serviceDir,
            '.serverless',
            'svc.zip',
          )
          service.functions.api.package = {
            artifact: path.join(serviceDir, '.serverless', 'api.zip'),
          }
        }
        if (lifecycle === 'dev-build') {
          await plugin.hooks['before:dev-build:build']()
          builds.push(s.serverless.devBuildRequest.result())
        }
      }
      await s.whenReady
      expect(builds).toEqual([{ covered: ['api'], built: ['api'] }])
      expect('artifact' in service.package).toBe(false)
      expect('package' in service.functions.api).toBe(false)
      s.proc.emit('SIGINT', 'SIGINT')
      expect(await s.result).toBe(0)
    } finally {
      fs.rmSync(serviceDir, { recursive: true, force: true })
    }
  }, 60_000)
})

describe('the session key and the AWS IoT Core endpoint', () => {
  const KEY = Buffer.alloc(32, 3)
  const variablesOfUpdates = (lambda) =>
    updates(lambda).map((params) => params.Environment.Variables)

  test('every attached function gets the session key and the endpoint AWS IoT Core named', async () => {
    const s = start({ ...four, deps: { sessionKey: KEY } })
    await s.whenReady
    const written = variablesOfUpdates(s.lambda)
    expect(written).toHaveLength(2)
    for (const variables of written) {
      // Compared, never printed: a failing matcher would show the key.
      expect(variables.SLS_DEV_SESSION_KEY === KEY.toString('base64')).toBe(
        true,
      )
      expect(variables.SLS_DEV_IOT_ENDPOINT).toBe(IOT_ENDPOINT)
    }
    s.proc.emit('SIGINT', 'SIGINT')
    expect(await s.result).toBe(0)
    for (const config of s.lambda.state.values()) {
      expect(config.Environment.Variables).not.toHaveProperty(
        'SLS_DEV_SESSION_KEY',
      )
      expect(config.Environment.Variables).not.toHaveProperty(
        'SLS_DEV_IOT_ENDPOINT',
      )
    }
  })

  test('without a key given, each session generates its own', async () => {
    const keyOf = async () => {
      const s = start(four)
      await s.whenReady
      const key = variablesOfUpdates(s.lambda)[0].SLS_DEV_SESSION_KEY
      s.proc.emit('SIGINT', 'SIGINT')
      await s.result
      return key
    }
    const first = await keyOf()
    const second = await keyOf()
    expect(decodeSessionKey(first)).toHaveLength(32)
    expect(decodeSessionKey(second)).toHaveLength(32)
    expect(first === second).toBe(false)
  })

  test('the key is never printed, at any log level', async () => {
    const encoded = KEY.toString('base64')
    const s = start({ ...four, deps: { sessionKey: KEY } })
    await s.whenReady
    s.proc.emit('SIGINT', 'SIGINT')
    expect(await s.result).toBe(0)
    expect(s.logger.lines.length).toBeGreaterThan(0)
    expect(s.logger.text().includes(encoded)).toBe(false)
  })

  test('a function near the 4 KB limit stays on its deployed code once the key and the endpoint are counted', async () => {
    // The undo record without the two relay variables, at the length this session writes.
    const base = buildAttachVariables({
      live: { PAD: '' },
      otherLayerArns: [],
      session: {
        id: testSessionId(1),
        owner: 'alice@mbp',
        attachedAt: 1790000000,
        broker: {
          arn: `arn:aws:iam::${ACCOUNT}:role/serverless-dev-broker-us-east-1`,
          externalId: '0'.repeat(32),
        },
      },
    })
    // 50 bytes short of the limit without them; the two add more than that.
    const pad = 'x'.repeat(4096 - 50 - envSize(base))
    const s = start({
      ...four,
      live: {
        ...four.live,
        api: { Environment: { Variables: { PAD: pad } } },
      },
      deps: { sessionKey: KEY },
    })
    await s.whenReady
    expect(s.logger.text()).toMatch(
      /api\s+deployed\s+its environment variables would exceed the 4 KB limit/,
    )
    expect(updates(s.lambda).map((params) => params.FunctionName)).toEqual([
      'svc-dev-worker',
    ])
    s.proc.emit('SIGINT', 'SIGINT')
    expect(await s.result).toBe(0)
  })
})

describe('the 4 KB boundary and failure messages, with the key and the endpoint written', () => {
  const KEY = Buffer.alloc(32, 3)
  const NOW = 1_790_000_000_000
  // The variables this session writes to `live`, at their real lengths.
  const attachedSize = (live) =>
    envSize(
      buildAttachVariables({
        live,
        otherLayerArns: [],
        session: {
          id: testSessionId(1),
          owner: 'alice@mbp',
          attachedAt: NOW / 1000,
          broker: {
            arn: `arn:aws:iam::${ACCOUNT}:role/serverless-dev-broker-us-east-1`,
            externalId: '0'.repeat(32),
          },
          key: KEY.toString('base64'),
          iotEndpoint: IOT_ENDPOINT,
        },
      }),
    )
  const padTo = (bytes) => {
    const live = { PAD: '' }
    live.PAD = 'x'.repeat(bytes - attachedSize(live))
    return live
  }
  const withApiEnv = (variables) =>
    start({
      ...four,
      live: { ...four.live, api: { Environment: { Variables: variables } } },
      deps: { sessionKey: KEY, now: () => NOW },
    })

  test('a function at exactly 4096 bytes is attached', async () => {
    const s = withApiEnv(padTo(4096))
    await s.whenReady
    const api = updates(s.lambda).find((p) => p.FunctionName === 'svc-dev-api')
    expect(envSize(api.Environment.Variables)).toBe(4096)
    expect(api.Environment.Variables.SLS_DEV_SESSION_KEY).toHaveLength(44)
    s.proc.emit('SIGINT', 'SIGINT')
    expect(await s.result).toBe(0)
  })

  test('one byte more and it is refused with the existing reason, before any update', async () => {
    const s = withApiEnv(padTo(4097))
    await s.whenReady
    expect(s.logger.text()).toMatch(
      /api\s+deployed\s+its environment variables would exceed the 4 KB limit/,
    )
    expect(updates(s.lambda).map((p) => p.FunctionName)).toEqual([
      'svc-dev-worker',
    ])
    s.proc.emit('SIGINT', 'SIGINT')
    expect(await s.result).toBe(0)
  })

  test('an AWS refusal that echoes the environment prints neither the key nor the ExternalId', async () => {
    const s = start({ ...four, deps: { sessionKey: KEY } })
    const real = s.lambda.updateFunctionConfiguration
    let externalId
    s.lambda.updateFunctionConfiguration = async (params) => {
      const variables = params.Environment?.Variables ?? {}
      if (params.FunctionName === 'svc-dev-api' && variables.SLS_DEV_SESSION) {
        externalId = variables.SLS_DEV_BROKER_EXTERNAL_ID
        throw Object.assign(
          new Error(
            `The environment was refused. Measured: ${JSON.stringify(variables)}`,
          ),
          { name: 'InvalidParameterValueException' },
        )
      }
      return real(params)
    }
    await s.whenReady
    const text = s.logger.text()
    // A boolean, so a failure never prints the output that may hold the key.
    expect(/api\s+deployed\s+attach failed: .*<redacted>/.test(text)).toBe(true)
    expect(externalId).toHaveLength(32)
    expect(text.includes(KEY.toString('base64'))).toBe(false)
    expect(text.includes(externalId)).toBe(false)
    s.proc.emit('SIGINT', 'SIGINT')
    // A function that could not be attached makes the session end with 3.
    expect(await s.result).toBe(3)
    expect(s.logger.text().includes(KEY.toString('base64'))).toBe(false)
  })
})

describe('a broker role without its permission policy', () => {
  const NAME = 'serverless-dev-broker-us-east-1'
  // A first session creates the broker and the layers; then the policy goes missing.
  const brokenBroker = async () => {
    const first = start(four)
    await first.whenReady
    first.proc.emit('SIGINT', 'SIGINT')
    await first.result
    first.iam.policies.delete(`${NAME}/serverless-dev-broker`)
    first.iam.calls.length = 0
    first.lambda.calls.length = 0
    return { lambda: first.lambda, iam: first.iam }
  }

  test('is listed in the plan and repaired before attaching', async () => {
    const { lambda, iam } = await brokenBroker()
    const realPut = iam.putRolePolicy
    let updatesBeforeRepair
    iam.putRolePolicy = async (params) => {
      updatesBeforeRepair = updates(lambda).length
      return realPut(params)
    }
    const s = start({ ...four, lambda, iam })
    await s.whenReady
    expect(iam.calls.filter(([op]) => op === 'putRolePolicy')).toEqual([
      ['putRolePolicy', NAME, 'serverless-dev-broker'],
    ])
    expect(updatesBeforeRepair).toBe(0)
    expect(updates(lambda)).toHaveLength(2)
    expect(iam.policies.has(`${NAME}/serverless-dev-broker`)).toBe(true)
    const text = s.logger.text()
    expect(text).toContain('Account setup in us-east-1:')
    expect(text).toContain(
      `  • put back the permission policy serverless-dev-broker of IAM role ${NAME} (it is missing)`,
    )
    expect(iam.calls.filter(([op]) => op === 'createRole')).toEqual([])
    s.proc.emit('SIGINT', 'SIGINT')
    expect(await s.result).toBe(0)
  })

  test('is not repaired when the plan is declined', async () => {
    const { lambda, iam } = await brokenBroker()
    const s = start({
      ...four,
      lambda,
      iam,
      options: { approve: true },
      interactive: true,
      confirmAnswer: false,
    })
    expect(await s.result).toBe(0)
    expect(iam.calls.filter(([op]) => op === 'putRolePolicy')).toEqual([])
    expect(s.shownWhenAsked[0]).toContain(
      'put back the permission policy serverless-dev-broker',
    )
  })

  test('a denied repair attaches nothing and says who can fix it', async () => {
    const { lambda, iam } = await brokenBroker()
    iam.putRolePolicyError = denied('iam:PutRolePolicy')
    const s = start({ ...four, lambda, iam })
    const error = await s.result.catch((e) => e)
    expect(error.code).toBe('DEV_MODE_BROKER_CREATE_DENIED')
    expect(error.message).toContain('serverless dev setup')
    expect(updates(lambda)).toEqual([])
  })

  test('a denied repair of a role under an IAM path names its ARN with the path', async () => {
    const { lambda, iam } = await brokenBroker()
    // As "serverless dev setup --path /serverless/" creates it.
    const arn = `arn:aws:iam::${ACCOUNT}:role/serverless/${NAME}`
    Object.assign(iam.roles.get(NAME), { Path: '/serverless/', Arn: arn })
    iam.putRolePolicyError = denied('iam:PutRolePolicy')
    const s = start({ ...four, lambda, iam })
    const error = await s.result.catch((e) => e)
    expect(error.code).toBe('DEV_MODE_BROKER_CREATE_DENIED')
    expect(error.message).toContain(`on the IAM role ${arn} (`)
  })

  test('when IAM will not say, it is assumed to be in place and nothing is repaired', async () => {
    const { lambda, iam } = await brokenBroker()
    iam.getRolePolicyError = denied('iam:GetRolePolicy')
    const s = start({ ...four, lambda, iam })
    await s.whenReady
    expect(iam.calls.filter(([op]) => op === 'putRolePolicy')).toEqual([])
    expect(updates(lambda)).toHaveLength(2)
    expect(s.logger.text()).not.toContain('Account setup')
    expect(
      s.logger.lines.filter(
        (line) =>
          line.level === 'debug' &&
          line.text.includes(
            `Dev Mode could not read the permission policy of ${NAME} (iam:GetRolePolicy); it is assumed to be in place`,
          ),
      ),
    ).toHaveLength(1)
    s.proc.emit('SIGINT', 'SIGINT')
    expect(await s.result).toBe(0)
  })

  test('rejected credentials while reading it end the session before any change', async () => {
    const { lambda, iam } = await brokenBroker()
    iam.getRolePolicyError = Object.assign(new Error('expired'), {
      name: 'ExpiredTokenException',
    })
    const s = start({ ...four, lambda, iam })
    await expect(s.result).rejects.toMatchObject({
      code: 'DEV_MODE_AWS_CREDENTIALS_INVALID',
    })
    expect(updates(lambda)).toEqual([])
  })

  test('a broker with its policy is only read', async () => {
    const first = start(four)
    await first.whenReady
    first.proc.emit('SIGINT', 'SIGINT')
    await first.result
    first.iam.calls.length = 0
    const s = start({ ...four, lambda: first.lambda, iam: first.iam })
    await s.whenReady
    expect(first.iam.calls).toEqual([
      ['getRole', NAME],
      ['getRolePolicy', NAME, 'serverless-dev-broker'],
    ])
    s.proc.emit('SIGINT', 'SIGINT')
    expect(await s.result).toBe(0)
  })
})

test('a function with a layer named like Dev Mode that Dev Mode did not attach keeps it, and its deployed code', async () => {
  const sameName = `arn:aws:lambda:us-east-1:${ACCOUNT}:layer:serverless-dev-arm64:7`
  const state = memoryState()
  const s = start({
    ...four,
    live: { ...four.live, api: { Layers: [{ Arn: sameName }] } },
    state,
  })
  await s.whenReady
  expect(
    state.records.find(
      (r) => r.type === 'function.mode' && r.function === 'api',
    ),
  ).toMatchObject({
    mode: 'deployed',
    reason: 'layer_name_taken',
    why: "uses a layer named serverless-dev-arm64 without Dev Mode's settings (remove that layer from the function, or publish yours under another name, to use Dev Mode)",
  })
  s.proc.emit('SIGINT', 'SIGINT')
  expect(await s.result).toBe(0)
  expect(
    updates(s.lambda).filter((u) => u.FunctionName === 'svc-dev-api'),
  ).toEqual([])
  expect(s.lambda.state.get('svc-dev-api').Layers).toEqual([{ Arn: sameName }])
})

describe('a layer named serverless-dev-<arch> left on a function without the wrapper or undo record', () => {
  const leftover = `arn:aws:lambda:us-east-1:${ACCOUNT}:layer:serverless-dev-arm64:1`
  // The function has the layer but neither AWS_LAMBDA_EXEC_WRAPPER nor any SLS_DEV_* variable;
  // the layer version carries `description`.
  const leftWith = (description) => {
    const lambda = fakeLambda({
      'svc-dev-api': { Layers: [{ Arn: leftover }] },
      'svc-dev-worker': four.live.worker,
      'svc-dev-report': four.live.report,
      'svc-dev-edge': four.live.edge,
    })
    lambda.layers.set('serverless-dev-arm64', [
      {
        Version: 1,
        LayerVersionArn: leftover,
        Description: description,
        CodeSha256: 'old',
      },
    ])
    const state = memoryState()
    return { s: start({ ...four, lambda, state }), state }
  }
  const apiMode = (state) =>
    state.records.find(
      (r) => r.type === 'function.mode' && r.function === 'api',
    )

  test("with the description Dev Mode publishes, is replaced by the session's layer and the function runs here", async () => {
    // An earlier build of Dev Mode published it.
    const { s, state } = leftWith(layerDescription('0'.repeat(64)))
    await s.whenReady
    expect(apiMode(state)).toMatchObject({ mode: 'dev' })
    expect(apiMode(state).reason).not.toBe('layer_name_taken')
    // The layer this session published for this build, next to the leftover.
    const [published] = s.lambda.layers.get('serverless-dev-arm64')
    expect(published.LayerVersionArn).not.toBe(leftover)
    expect(published.Description).toBe(
      layerDescription(artifact('arm64').sha256),
    )
    const [attach] = updates(s.lambda).filter(
      (u) => u.FunctionName === 'svc-dev-api',
    )
    expect(attach.Layers).toEqual([published.LayerVersionArn])
    const api = s.lambda.state.get('svc-dev-api')
    expect(api.Layers).toEqual([{ Arn: published.LayerVersionArn }])
    expect(api.Environment.Variables.AWS_LAMBDA_EXEC_WRAPPER).toBe(
      '/opt/sls-dev-wrapper',
    )
    s.proc.emit('SIGINT', 'SIGINT')
    expect(await s.result).toBe(0)
    expect(s.lambda.state.get('svc-dev-api').Layers).toEqual([])
  })

  test("with any other description, is someone else's: the function keeps it and its deployed code", async () => {
    const { s, state } = leftWith(
      `${layerDescription('0'.repeat(64))} (patched)`,
    )
    await s.whenReady
    expect(apiMode(state)).toMatchObject({
      mode: 'deployed',
      reason: 'layer_name_taken',
    })
    s.proc.emit('SIGINT', 'SIGINT')
    expect(await s.result).toBe(0)
    expect(
      updates(s.lambda).filter((u) => u.FunctionName === 'svc-dev-api'),
    ).toEqual([])
    expect(s.lambda.state.get('svc-dev-api').Layers).toEqual([
      { Arn: leftover },
    ])
  })
})

describe('a broker role whose permission policy is another version', () => {
  const NAME = 'serverless-dev-broker-us-east-1'
  const AT = {
    identity: { accountId: ACCOUNT, partition: 'aws' },
    region: 'us-east-1',
  }
  const brokerWith = async (doc) => {
    const first = start(four)
    await first.whenReady
    first.proc.emit('SIGINT', 'SIGINT')
    await first.result
    first.iam.policies.set(`${NAME}/serverless-dev-broker`, doc)
    first.iam.calls.length = 0
    first.lambda.calls.length = 0
    return { lambda: first.lambda, iam: first.iam }
  }
  const puts = (iam) => iam.calls.filter(([op]) => op === 'putRolePolicy')

  test('an older version is listed in the plan and overwritten in place before attaching', async () => {
    const { lambda, iam } = await brokerWith(
      buildPermissionPolicy({ ...AT, version: 0 }),
    )
    const realPut = iam.putRolePolicy
    let updatesBeforeRepair
    iam.putRolePolicy = async (params) => {
      updatesBeforeRepair = updates(lambda).length
      return realPut(params)
    }
    const s = start({ ...four, lambda, iam })
    await s.whenReady
    expect(puts(iam)).toEqual([
      ['putRolePolicy', NAME, 'serverless-dev-broker'],
    ])
    expect(updatesBeforeRepair).toBe(0)
    expect(updates(lambda)).toHaveLength(2)
    expect(iam.policies.get(`${NAME}/serverless-dev-broker`)).toEqual(
      buildPermissionPolicy(AT),
    )
    const text = s.logger.text()
    expect(text).toContain('Account setup in us-east-1:')
    expect(text).toContain(
      `  • update the permission policy serverless-dev-broker of IAM role ${NAME} (it differs from the one this version of Dev Mode writes)`,
    )
    expect(text).toContain(`repaired IAM role ${NAME}`)
    s.proc.emit('SIGINT', 'SIGINT')
    expect(await s.result).toBe(0)
  })

  test('a newer version is left as it is, with a debug line', async () => {
    const theirs = buildPermissionPolicy({ ...AT, version: 2 })
    const { lambda, iam } = await brokerWith(theirs)
    const s = start({ ...four, lambda, iam })
    await s.whenReady
    expect(puts(iam)).toEqual([])
    expect(iam.policies.get(`${NAME}/serverless-dev-broker`)).toEqual(theirs)
    expect(updates(lambda)).toHaveLength(2)
    expect(s.logger.text()).not.toContain('Account setup')
    expect(
      s.logger.lines.filter(
        (line) =>
          line.level === 'debug' &&
          line.text ===
            `The permission policy serverless-dev-broker of ${NAME} was written by a newer version of Dev Mode; it is left as it is`,
      ),
    ).toHaveLength(1)
    s.proc.emit('SIGINT', 'SIGINT')
    expect(await s.result).toBe(0)
  })
})

test('newSessionKey is 32 random bytes that the relay decodes', () => {
  const key = newSessionKey()
  expect(key).toHaveLength(32)
  expect(decodeSessionKey(key.toString('base64')).equals(key)).toBe(true)
  const fixed = Buffer.alloc(32, 9)
  expect(newSessionKey(() => fixed)).toBe(fixed)
  expect(newSessionKey().equals(key)).toBe(false)
})

describe('the relay in a session', () => {
  const ATTACHED = { api: 'svc-dev-api', worker: 'svc-dev-worker' }

  /** A session whose relay, side channel and laptop runtime record the order of what they do. */
  const recorded = ({ options = {}, sideChannel, connectRelay } = {}) => {
    const order = []
    const lambda = fakeLambda(
      Object.fromEntries(
        Object.entries(four.live).map(([key, config]) => [
          `svc-dev-${key}`,
          config,
        ]),
      ),
    )
    const real = lambda.updateFunctionConfiguration
    lambda.updateFunctionConfiguration = async (params) => {
      order.push('update')
      return real(params)
    }
    const logger = fakeLog()
    const success = logger.success
    logger.success = (...args) => {
      if (/^Dev Mode off/.test(args[0])) order.push('Dev Mode off')
      if (/^Left \d+ functions? in Dev Mode/.test(args[0])) order.push('kept')
      success(...args)
    }
    const notice = logger.notice
    logger.notice = (...args) => {
      if (/^Left \d+ functions? in Dev Mode/.test(args[0])) order.push('kept')
      notice(...args)
    }
    const connection = fakeRelayConnection(order)
    const startLaptop = jest.fn(async () => ({
      stopAccepting: () => order.push('stopAccepting'),
      drain: async (ms) => order.push(`drain ${ms}`),
      stop: async () => order.push('laptop.stop'),
    }))
    const openSideChannel = jest.fn(
      async () =>
        sideChannel ?? {
          enabled: true,
          sweep: async () => {
            order.push('sweep')
            return 0
          },
        },
    )
    const s = start({
      ...four,
      lambda,
      logger,
      options,
      deps: {
        connectRelay:
          connectRelay ??
          jest.fn(async () => {
            order.push(`connect after ${updates(lambda).length} updates`)
            return connection
          }),
        openSideChannel,
        startLaptop,
      },
    })
    return { s, order, startLaptop, openSideChannel, connection, lambda }
  }

  test('the relay connects before anything is attached, and a refused connection changes nothing', async () => {
    const { s, order } = recorded()
    await s.whenReady
    expect(order[0]).toBe('connect after 0 updates')
    expect(order.filter((step) => step === 'update')).toHaveLength(2)
    s.proc.emit('SIGINT', 'SIGINT')
    expect(await s.result).toBe(0)

    const refused = Object.assign(
      new Error('Dev Mode could not connect to AWS IoT Core in us-east-1'),
      { code: 'DEV_MODE_IOT_CONNECT_DENIED' },
    )
    const denied = start({
      ...four,
      deps: {
        connectRelay: async () => {
          throw refused
        },
      },
    })
    await expect(denied.result).rejects.toBe(refused)
    expect(updates(denied.lambda)).toEqual([])
    expect(denied.lambda.calls.map(([op]) => op)).not.toContain(
      'publishLayerVersion',
    )
  })

  test('the connection is passed what it needs, and closed when the session fails before attaching', async () => {
    const connectRelay = jest.fn(async () => connection)
    const connection = fakeRelayConnection()
    const s = start({ ...four, deps: { connectRelay } })
    s.lambda.publishLayerVersion = async () => {
      throw denied('lambda:PublishLayerVersion')
    }
    await expect(s.result).rejects.toMatchObject({
      code: 'DEV_MODE_LAYER_ACCESS_DENIED',
    })
    const [args] = connectRelay.mock.calls[0]
    expect(args).toMatchObject({
      region: 'us-east-1',
      iotEndpoint: IOT_ENDPOINT,
      sessionId: testSessionId(1),
    })
    expect(Buffer.isBuffer(args.sessionKey)).toBe(true)
    expect(typeof args.resolveCredentials).toBe('function')
    expect(connection.stops).toBe(1)
  })

  test('the laptop gets the relay: deployed names, the session key and the side channel', async () => {
    const { s, startLaptop, openSideChannel, connection } = recorded()
    await s.whenReady
    const [{ relay }] = startLaptop.mock.calls[0]
    expect(relay.connection).toBe(connection)
    expect(relay.sessionId).toBe(testSessionId(1))
    expect([...relay.deployedNames]).toEqual([
      [ATTACHED.api, 'api'],
      [ATTACHED.worker, 'worker'],
    ])
    const written = decodeSessionKey(
      s.lambda.state.get(ATTACHED.api).Environment.Variables
        .SLS_DEV_SESSION_KEY,
    )
    expect(relay.sessionKey.equals(written)).toBe(true)
    expect(relay.sideChannel).toBe(await openSideChannel.mock.results[0].value)
    const [sideChannelArgs] = openSideChannel.mock.calls[0]
    expect(sideChannelArgs).toMatchObject({
      sessionId: testSessionId(1),
      s3: { fake: 's3' },
    })
    expect(sideChannelArgs.key.equals(written)).toBe(true)
    expect(sideChannelArgs.credentials()).toEqual({ accessKeyId: 'AKID' })
    expect(typeof relay.onNotRun).toBe('function')
    s.proc.emit('SIGINT', 'SIGINT')
    expect(await s.result).toBe(0)
  })

  test('a disabled side channel is said once', async () => {
    const { s } = recorded({
      sideChannel: { enabled: false, reason: 'the bucket uses SSE-C' },
    })
    await s.whenReady
    expect(warningsOf(s.logger)).toEqual([
      sideChannelOffLine('the bucket uses SSE-C'),
    ])
    s.proc.emit('SIGINT', 'SIGINT')
    expect(await s.result).toBe(0)
  })

  test('the start-up lines: no relay-not-built notice; the new-role line only on the run that created the broker', async () => {
    const first = start(four)
    await first.whenReady
    const name = 'serverless-dev-broker-us-east-1'
    expect(first.logger.text()).toContain(newBrokerLine(name))
    expect(first.logger.text()).not.toContain(
      'relaying invocations to this machine is not built yet',
    )
    // The line comes after the configuration notice, before the Ctrl+C hint.
    const text = first.logger.text()
    expect(text.indexOf(newBrokerLine(name))).toBeGreaterThan(
      text.indexOf('Dev Mode uses the deployed configuration.'),
    )
    expect(text.indexOf(newBrokerLine(name))).toBeLessThan(
      text.indexOf('Press Ctrl+C'),
    )
    first.proc.emit('SIGINT', 'SIGINT')
    await first.result
    // IAM's creation date of the role, more than 3 minutes before the next session.
    first.iam.roles.get(name).CreateDate = new Date(Date.now() - 4 * 60_000)
    const second = start({ ...four, lambda: first.lambda, iam: first.iam })
    await second.whenReady
    expect(second.logger.text()).not.toContain(newBrokerLine(name))
    expect(second.logger.text()).not.toContain('created IAM role')
    second.proc.emit('SIGINT', 'SIGINT')
    expect(await second.result).toBe(0)
  })

  test('a session that finds the role created less than 3 minutes ago, by a start that ended early, says it uses it, how old it is, and that it can take a while', async () => {
    const first = start(four)
    await first.whenReady
    first.proc.emit('SIGINT', 'SIGINT')
    await first.result
    const name = 'serverless-dev-broker-us-east-1'
    const nowMs = 1_790_000_000_000
    first.iam.roles.get(name).CreateDate = new Date(nowMs - 150_000)
    const second = start({
      ...four,
      lambda: first.lambda,
      iam: first.iam,
      deps: { now: () => nowMs },
    })
    await second.whenReady
    const text = second.logger.text()
    expect(text).toContain(
      `Set up Dev Mode in us-east-1: using IAM role ${name} (created 2 min ago)`,
    )
    expect(text).not.toContain('created IAM role')
    expect(text).toContain(newBrokerLine(name))
    expect(second.iam.calls.filter(([op]) => op === 'createRole')).toHaveLength(
      1,
    )
    second.proc.emit('SIGINT', 'SIGINT')
    expect(await second.result).toBe(0)
  })

  test('on Ctrl+C the relay stops accepting first, accepted invocations finish before "Dev Mode off", then the connection says goodbye and the bucket prefix is swept', async () => {
    const { s, order } = recorded()
    await s.whenReady
    order.length = 0
    s.proc.emit('SIGINT', 'SIGINT')
    expect(await s.result).toBe(0)
    expect(order).toEqual([
      'connection.quiet',
      'stopAccepting',
      'update',
      'update',
      `drain ${DRAIN_MS}`,
      'laptop.stop',
      'Dev Mode off',
      'connection.stop',
      'sweep',
    ])
  })

  test('--on-exit keep stops accepting, drains, says goodbye and sweeps, and restores nothing', async () => {
    const { s, order } = recorded({ options: { 'on-exit': 'keep' } })
    await s.whenReady
    order.length = 0
    s.proc.emit('SIGINT', 'SIGINT')
    expect(await s.result).toBe(0)
    expect(order).toEqual([
      'connection.quiet',
      'stopAccepting',
      `drain ${DRAIN_MS}`,
      'laptop.stop',
      'kept',
      'connection.stop',
      'sweep',
    ])
  })

  test('a hang-up stops in the same order as Ctrl+C', async () => {
    const { s, order } = recorded()
    await s.whenReady
    order.length = 0
    s.proc.emit('SIGHUP', 'SIGHUP')
    expect(await s.result).toBe(0)
    expect(order).toEqual([
      'connection.quiet',
      'stopAccepting',
      'update',
      'update',
      `drain ${DRAIN_MS}`,
      'laptop.stop',
      'Dev Mode off',
      'connection.stop',
      'sweep',
    ])
  })

  test('an error after attaching stops accepting, restores and drains, then closes everything', async () => {
    const { s, order, startLaptop } = recorded()
    startLaptop.mockImplementationOnce(async () => {
      throw Object.assign(new Error('Runtime API failed'), {
        code: 'DEV_MODE_LOCAL_RUNTIME_FAILED',
      })
    })
    await expect(s.result).rejects.toMatchObject({
      code: 'DEV_MODE_LOCAL_RUNTIME_FAILED',
    })
    expect(order.slice(order.indexOf('update', 3))).toEqual([
      'update',
      'update',
      'Dev Mode off',
      'connection.stop',
      'sweep',
    ])
  })

  test('Ctrl+C while connecting attaches nothing, publishes no layer, sets nothing up and closes the connection', async () => {
    const connection = fakeRelayConnection()
    let s
    let callsAtStop
    s = start({
      ...four,
      deps: {
        connectRelay: async () => {
          s.proc.emit('SIGINT', 'SIGINT')
          callsAtStop = {
            lambda: s.lambda.calls.length,
            iam: s.iam.calls.length,
          }
          return connection
        },
      },
    })
    expect(await s.result).toBe(0)
    expect(updates(s.lambda)).toEqual([])
    const after = (calls, from) => calls.slice(from).map(([op]) => op)
    expect(after(s.lambda.calls, callsAtStop.lambda)).not.toContain(
      'publishLayerVersion',
    )
    expect(s.lambda.calls.map(([op]) => op)).not.toContain(
      'publishLayerVersion',
    )
    expect(after(s.iam.calls, callsAtStop.iam)).toEqual([])
    expect(s.logger.text()).toContain('Dev Mode off · no function was changed')
    expect(connection.stops).toBe(1)
  })

  /** The lines a person sees (not --debug), in order. */
  const visible = (logger) =>
    logger.lines
      .filter(({ level }) => level !== 'debug')
      .map(({ text }) => text)

  test('nothing is printed after "Dev Mode off", even when the laptop runtime is slow to stop', async () => {
    const { s, startLaptop } = recorded()
    startLaptop.mockImplementationOnce(async ({ relay }) => ({
      // A request refused just as the stop began: it would arm the throughput warning.
      stopAccepting: () => relay.onNotRun({ id: 'r1', reason: 'expired' }),
      drain: async () => {},
      stop: () => new Promise((resolve) => setTimeout(resolve, 1_500)),
    }))
    await s.whenReady
    s.proc.emit('SIGINT', 'SIGINT')
    expect(await s.result).toBe(0)
    const lines = visible(s.logger)
    const off = lines.findIndex((line) => line.startsWith('Dev Mode off'))
    expect(off).toBeGreaterThan(-1)
    expect(lines.slice(off + 1)).toEqual([])
    expect(lines.join('\n')).not.toContain('ran the deployed code')
  })

  test('a drain that fails still ends the laptop runtime before "Dev Mode off"', async () => {
    const { s, startLaptop } = recorded()
    startLaptop.mockImplementationOnce(async ({ logger }) => ({
      stopAccepting: () => {},
      drain: async () => {
        throw new Error('the drain broke')
      },
      stop: async () =>
        logger.notice('← λ api ✕ Runtime.ExitError: the worker was stopped'),
    }))
    await s.whenReady
    s.proc.emit('SIGINT', 'SIGINT')
    await s.result.catch(() => {})
    const lines = visible(s.logger)
    const ended = lines.indexOf(
      '← λ api ✕ Runtime.ExitError: the worker was stopped',
    )
    const off = lines.findIndex((line) => line.startsWith('Dev Mode off'))
    expect(ended).toBeGreaterThan(-1)
    expect(off).toBeGreaterThan(ended)
  })

  test('an invocation that outlives the drain is ended, and its end line comes before "Dev Mode off"', async () => {
    const { s, startLaptop } = recorded()
    startLaptop.mockImplementationOnce(async ({ logger }) => ({
      stopAccepting: () => {},
      // The drain gave up with the invocation still running.
      drain: async () => {},
      // Stopping the runtime ends its worker; the invocation's end line is printed then.
      stop: async () =>
        logger.notice('← λ api ✕ Runtime.ExitError: the worker was stopped'),
    }))
    await s.whenReady
    s.proc.emit('SIGINT', 'SIGINT')
    expect(await s.result).toBe(0)
    const lines = visible(s.logger)
    expect(lines.slice(-2)).toEqual([
      '← λ api ✕ Runtime.ExitError: the worker was stopped',
      expect.stringMatching(/^Dev Mode off · 2 functions restored/),
    ])
  })
})

describe('functions held by another Dev Mode session', () => {
  const heldBy = (session, owner) => ({
    Environment: {
      Variables: {
        AWS_LAMBDA_EXEC_WRAPPER: '/opt/sls-dev-wrapper',
        SLS_DEV_SESSION: session,
        SLS_DEV_OWNER: owner,
        SLS_DEV_ATTACHED_AT: '1790000000',
      },
    },
    Layers: [
      {
        Arn: 'arn:aws:lambda:us-east-1:123456789012:layer:serverless-dev-arm64:1',
      },
    ],
  })
  /** A session whose liveness check answers `answer(id)` and records when it was asked. */
  const withLiveness = ({ functions, live, answer, options, connectRelay }) => {
    const calls = []
    let s
    const checkSessionsLiveness = async (args) => {
      calls.push({ ...args, updatesBefore: updates(s.lambda).length })
      return new Map(args.sessionIds.map((id) => [id, answer(id)]))
    }
    s = start({
      functions,
      live,
      options,
      deps: {
        checkSessionsLiveness,
        ...(connectRelay && { connectRelay }),
      },
    })
    return { s, calls }
  }
  const sessionOf = (s, key) =>
    s.lambda.state.get(`svc-dev-${key}`).Environment.Variables.SLS_DEV_SESSION

  test('functions of another session are asked about once, before anything changes', async () => {
    const connection = fakeRelayConnection()
    const connectRelay = jest.fn(async () => connection)
    const { s, calls } = withLiveness({
      functions: { api: {}, worker: {}, report: {}, plain: {} },
      live: {
        api: heldBy('s_other', 'alice@mbp'),
        worker: heldBy('s_other', 'alice@mbp'),
        report: heldBy('s_third', 'bob@desk'),
        plain: {},
      },
      answer: () => 'gone',
      connectRelay,
    })
    await s.whenReady
    expect(calls).toHaveLength(1)
    expect([...calls[0].sessionIds].sort()).toEqual(['s_other', 's_third'])
    expect(calls[0]).toMatchObject({
      endpoint: IOT_ENDPOINT,
      region: 'us-east-1',
      updatesBefore: 0,
    })
    expect(calls[0].credentials.accessKeyId).toBe('AKIAEXAMPLE')
    // The connection later reads the same credential cache.
    const [{ credentials }] = connectRelay.mock.calls[0]
    expect(credentials.current()).toBe(calls[0].credentials)
    expect(s.logger.text()).toMatch(
      /report\s+dev\s+taken over from bob@desk, whose session has ended/,
    )
    expect(s.logger.text()).toContain(
      '2 functions still had Dev Mode configuration from an earlier session of yours',
    )
    for (const key of ['api', 'worker', 'report', 'plain']) {
      expect(sessionOf(s, key)).toBe(testSessionId(1))
    }
    s.proc.emit('SIGINT', 'SIGINT')
    expect(await s.result).toBe(0)
  })

  test('nothing is asked when no function carries another session', async () => {
    const { s, calls } = withLiveness({
      ...four,
      answer: () => 'live',
    })
    await s.whenReady
    expect(calls).toEqual([])
    s.proc.emit('SIGINT', 'SIGINT')
    expect(await s.result).toBe(0)
  })

  test.each(['live', 'unknown'])(
    'a %s session of yours keeps its function; the table says so',
    async (state) => {
      const { s } = withLiveness({
        functions: { api: {}, plain: {} },
        live: { api: heldBy('s_other', 'alice@mbp'), plain: {} },
        answer: () => state,
      })
      await s.whenReady
      expect(s.logger.text()).toMatch(
        /api\s+skipped\s+in Dev Mode in another session of yours \(--take-over to take it\)/,
      )
      expect(updates(s.lambda).map((p) => p.FunctionName)).toEqual([
        'svc-dev-plain',
      ])
      s.proc.emit('SIGINT', 'SIGINT')
      expect(await s.result).toBe(0)
      expect(sessionOf(s, 'api')).toBe('s_other')
      expect(s.logger.lines.filter((l) => l.level === 'warning')).toEqual([])
    },
  )

  test('a live session of yours alone leaves nothing to attach', async () => {
    const { s } = withLiveness({
      functions: { api: {} },
      live: { api: heldBy('s_other', 'alice@mbp') },
      answer: () => 'live',
    })
    await expect(s.result).rejects.toMatchObject({
      code: 'DEV_MODE_NOTHING_TO_ATTACH',
    })
    expect(updates(s.lambda)).toEqual([])
  })

  test('--take-over takes it from a live session of yours, with a note', async () => {
    const { s } = withLiveness({
      functions: { api: {} },
      live: { api: heldBy('s_other', 'alice@mbp') },
      answer: () => 'live',
      options: { 'take-over': true },
    })
    await s.whenReady
    expect(s.logger.text()).toMatch(
      /api\s+dev\s+taken over from another session of yours/,
    )
    expect(sessionOf(s, 'api')).toBe(testSessionId(1))
    s.proc.emit('SIGINT', 'SIGINT')
    expect(await s.result).toBe(0)
  })

  test.each([
    ['denied', 'iot:SendDirectMessage was denied'],
    ['failed', 'the check through AWS IoT Core failed'],
  ])(
    'a %s check is said once and the earlier rule applies',
    async (state, reason) => {
      const { s } = withLiveness({
        functions: { api: {}, worker: {}, shared: {} },
        live: {
          api: heldBy('s_other', 'alice@mbp'),
          worker: heldBy('s_old', 'alice@mbp'),
          shared: heldBy('s_bob', 'bob@desk'),
        },
        answer: () => state,
      })
      await s.whenReady
      const warnings = s.logger.lines.filter((l) => l.level === 'warning')
      expect(warnings.map((l) => l.text)).toEqual([livenessDeniedLine(reason)])
      expect(s.logger.text()).toMatch(
        /shared\s+skipped\s+in Dev Mode for bob@desk \(--take-over to take it\)/,
      )
      expect(sessionOf(s, 'api')).toBe(testSessionId(1))
      expect(sessionOf(s, 'worker')).toBe(testSessionId(1))
      expect(sessionOf(s, 'shared')).toBe('s_bob')
      s.proc.emit('SIGINT', 'SIGINT')
      expect(await s.result).toBe(0)
    },
  )

  test('a function taken between the read and the attach by a session answered live is left to it', async () => {
    const { s } = withLiveness({
      functions: { api: {}, shared: {}, plain: {} },
      live: {
        api: heldBy('s_old', 'alice@mbp'),
        shared: heldBy('s_running', 'alice@mbp'),
        plain: {},
      },
      answer: (id) => (id === 's_old' ? 'gone' : 'live'),
    })
    // Just before this session writes api, the running session attaches it again.
    const real = s.lambda.updateFunctionConfiguration
    let raced = false
    s.lambda.updateFunctionConfiguration = async (params) => {
      if (params.FunctionName === 'svc-dev-api' && !raced) {
        raced = true
        s.lambda.touch('svc-dev-api', () => heldBy('s_running', 'alice@mbp'))
      }
      return real(params)
    }
    await s.whenReady
    expect(sessionOf(s, 'api')).toBe('s_running')
    expect(sessionOf(s, 'shared')).toBe('s_running')
    expect(sessionOf(s, 'plain')).toBe(testSessionId(1))
    s.proc.emit('SIGINT', 'SIGINT')
    expect(await s.result).toBe(0)
    expect(sessionOf(s, 'api')).toBe('s_running')
  })
  /** A session whose `api` is attached by `racer` just before this session's first write to it. */
  const racedBy = (racer, owner, answer) => {
    const { s, calls } = withLiveness({
      functions: { api: {}, plain: {} },
      live: { api: {}, plain: {} },
      answer,
    })
    const real = s.lambda.updateFunctionConfiguration
    let raced = false
    s.lambda.updateFunctionConfiguration = async (params) => {
      if (params.FunctionName === 'svc-dev-api' && !raced) {
        raced = true
        s.lambda.touch('svc-dev-api', () => heldBy(racer, owner))
      }
      return real(params)
    }
    return { s, calls }
  }

  test('a session of yours that attaches between the check and the write keeps the function', async () => {
    const { s, calls } = racedBy('s_new', 'alice@mbp', () => 'live')
    await s.whenReady
    // Nothing carried another session when this one looked; the newcomer is asked about.
    expect(calls.map((call) => call.sessionIds)).toEqual([['s_new']])
    expect(sessionOf(s, 'api')).toBe('s_new')
    expect(s.logger.text()).toMatch(
      /api\s+skipped\s+in Dev Mode in another session of yours \(--take-over to take it\)/,
    )
    expect(s.logger.lines.filter((l) => l.level === 'warning')).toEqual([])
    s.proc.emit('SIGINT', 'SIGINT')
    expect(await s.result).toBe(0)
    expect(sessionOf(s, 'api')).toBe('s_new')
  })

  test('a newcomer that cannot be asked about still keeps the function, and the session says so', async () => {
    const { s } = racedBy('s_new', 'alice@mbp', () => 'failed')
    await s.whenReady
    expect(sessionOf(s, 'api')).toBe('s_new')
    expect(
      s.logger.lines.filter((l) => l.level === 'warning').map((l) => l.text),
    ).toEqual([livenessUnansweredLine('the check through AWS IoT Core failed')])
    s.proc.emit('SIGINT', 'SIGINT')
    expect(await s.result).toBe(0)
    expect(sessionOf(s, 'api')).toBe('s_new')
  })

  test('a newcomer whose session has ended already is attached', async () => {
    const { s } = racedBy('s_new', 'alice@mbp', () => 'gone')
    await s.whenReady
    expect(sessionOf(s, 'api')).toBe(testSessionId(1))
    s.proc.emit('SIGINT', 'SIGINT')
    expect(await s.result).toBe(0)
  })
})

describe('the session record', () => {
  const typesOf = (state) => state.records.map((record) => record.type)
  const tempDirs = []
  afterAll(() => {
    for (const dir of tempDirs) fs.rmSync(dir, { recursive: true, force: true })
  })
  const tempServiceDir = () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sls-dev-t-'))
    tempDirs.push(dir)
    return dir
  }
  test('records the start, each final mode, ready, the stop and the end, last', async () => {
    const state = memoryState()
    const s = start({ ...four, state })
    await s.whenReady
    s.proc.emit('SIGINT', 'SIGINT')
    expect(await s.result).toBe(0)
    expect(typesOf(state)).toEqual([
      'session.starting',
      'function.mode',
      'function.mode',
      'function.mode',
      'function.mode',
      'session.ready',
      'session.stopping',
      'session.ended',
    ])
    expect(state.records[0]).toEqual({
      type: 'session.starting',
      service: 'svc',
      stage: 'dev',
      region: 'us-east-1',
      owner: 'alice@mbp',
      pid: process.pid,
      detached: false,
      selection: { only: [], skip: [] },
    })
    expect(state.records.filter((r) => r.type === 'function.mode')).toEqual([
      {
        type: 'function.mode',
        function: 'api',
        mode: 'dev',
        reason: undefined,
        why: undefined,
        notes: undefined,
      },
      {
        type: 'function.mode',
        function: 'worker',
        mode: 'dev',
        reason: undefined,
        why: undefined,
        notes: undefined,
      },
      expect.objectContaining({
        function: 'report',
        mode: 'deployed',
        reason: 'runtime_not_supported',
      }),
      expect.objectContaining({
        function: 'edge',
        mode: 'deployed',
        reason: 'edge_function',
      }),
    ])
    expect(state.records[5]).toEqual({
      type: 'session.ready',
      functions: { dev: 2, deployed: 2, skipped: 0 },
      ready_ms: expect.any(Number),
      attach_ms: expect.any(Number),
    })
    expect(state.records[6]).toEqual({
      type: 'session.stopping',
      trigger: 'signal',
      signal: 'SIGINT',
    })
    expect(state.records[7]).toEqual({
      type: 'session.ended',
      exit_code: 0,
      restore: { restored: 2, unchanged: 0, skipped: 0, missing: 0, failed: 0 },
      kept: false,
    })
    expect(state.updates).toEqual([
      { state: 'on', ready_at: expect.any(String) },
      { state: 'stopping' },
    ])
    expect(state.closed).toBe(true)
    expect(state.released).toBe(true)
  })

  test('a start that fails before it is ready records why, then its end', async () => {
    const state = memoryState()
    const s = start({
      functions: { report: {} },
      live: { report: { Runtime: 'java21' } },
      state,
    })
    await expect(s.result).rejects.toMatchObject({
      code: 'DEV_MODE_NOTHING_TO_ATTACH',
    })
    expect(typesOf(state)).toEqual([
      'session.starting',
      'function.mode',
      'session.failed',
      'session.ended',
    ])
    expect(state.records[2]).toEqual({
      type: 'session.failed',
      reason: 'nothing_to_attach',
      message:
        'No function in this service can run in Dev Mode. The table above says why for each one.',
      exit_code: 1,
    })
    expect(state.records[3]).toMatchObject({ exit_code: 1, kept: false })
  })

  test('--on-exit keep records the stop, then an end that kept the functions', async () => {
    const state = memoryState()
    const s = start({ ...four, state, options: { 'on-exit': 'keep' } })
    await s.whenReady
    s.proc.emit('SIGINT', 'SIGINT')
    expect(await s.result).toBe(0)
    expect(typesOf(state).slice(-3)).toEqual([
      'session.ready',
      'session.stopping',
      'session.ended',
    ])
    expect(state.records.at(-1)).toMatchObject({
      exit_code: 0,
      kept: true,
      restore: { restored: 0, unchanged: 0, skipped: 0, missing: 0, failed: 0 },
    })
  })

  test('--on-exit remove records its end last, after the restore and the removal', async () => {
    const state = memoryState()
    const s = start({
      ...four,
      state,
      interactive: true,
      options: { 'on-exit': 'remove' },
    })
    await s.whenReady
    s.proc.emit('SIGINT', 'SIGINT')
    expect(await s.result).toBe(0)
    expect(s.serverless.pluginManager.spawned).toEqual(['remove'])
    expect(typesOf(state).slice(-3)).toEqual([
      'session.ready',
      'session.stopping',
      'session.ended',
    ])
    expect(state.records.at(-1)).toMatchObject({
      exit_code: 0,
      kept: false,
      restore: { restored: 2, failed: 0 },
    })
  })

  test('an error after ready records a stop for the error, then the end', async () => {
    const state = memoryState()
    const s = start({
      ...four,
      state,
      deps: {
        onReady: () => {
          throw new Error('the session broke')
        },
      },
    })
    await expect(s.result).rejects.toThrow('the session broke')
    expect(typesOf(state).slice(-3)).toEqual([
      'session.ready',
      'session.stopping',
      'session.ended',
    ])
    expect(state.records.at(-2)).toEqual({
      type: 'session.stopping',
      trigger: 'error',
    })
    expect(state.records.at(-1)).toMatchObject({
      restore: { restored: 2, failed: 0 },
      kept: false,
    })
  })

  test('a start denied iam:GetRole on the broker role records permission_denied, as the dry run says', async () => {
    const state = memoryState()
    const iam = fakeIam()
    iam.getRoleError = denied('iam:GetRole')
    const s = start({ ...four, iam, state })
    await expect(s.result).rejects.toMatchObject({
      code: 'DEV_MODE_BROKER_READ_DENIED',
    })
    expect(
      state.records.find((record) => record.type === 'session.failed'),
    ).toMatchObject({ reason: 'permission_denied', exit_code: 1 })
  })

  test('a protected stage writes nothing', async () => {
    const openState = jest.fn()
    const s = start({
      ...four,
      stage: 'prod',
      state: null,
      deps: { openState },
    })
    await expect(s.result).rejects.toMatchObject({
      code: 'DEV_MODE_STAGE_PROTECTED',
    })
    expect(openState).not.toHaveBeenCalled()
  })

  test('a session already on here for the same stage and functions is reported, and nothing else runs', async () => {
    const existing = {
      session_id: 's_00000000000f',
      pid: 4123,
      stage: 'dev',
      region: 'us-east-1',
      selection: { only: [], skip: ['report'] },
    }
    const s = start({
      ...four,
      options: { 'skip-function': 'report' },
      state: null,
      deps: { openState: async () => ({ claimed: false, existing }) },
    })
    expect(await s.result).toBe(0)
    expect(s.logger.text()).toContain(
      'Dev Mode is already on here (session s_00000000000f, pid 4123, stage dev).',
    )
    expect(s.lambda.calls).toEqual([])
  })

  test('a session already on here, joined with --take-over or --on-exit, says it keeps its own settings', async () => {
    const existing = {
      session_id: 's_00000000000f',
      pid: 4123,
      state: 'on',
      stage: 'dev',
      region: 'us-east-1',
      selection: { only: [], skip: [] },
    }
    const s = start({
      ...four,
      options: { 'take-over': true, 'on-exit': 'keep' },
      state: null,
      deps: { openState: async () => ({ claimed: false, existing }) },
    })
    expect(await s.result).toBe(0)
    expect(s.logger.text()).toContain(
      'The running session keeps the settings it started with: --take-over and --on-exit keep apply only to a new one. Run "serverless dev stop", then start again to use them.',
    )
    expect(s.lambda.calls).toEqual([])
  })

  test('a session already on here that started with the same --take-over and --on-exit adds no line', async () => {
    const existing = {
      session_id: 's_00000000000f',
      pid: 4123,
      state: 'on',
      stage: 'dev',
      region: 'us-east-1',
      selection: { only: [], skip: [] },
      take_over: true,
      on_exit: 'keep',
    }
    const s = start({
      ...four,
      options: { 'take-over': true, 'on-exit': 'keep' },
      state: null,
      deps: { openState: async () => ({ claimed: false, existing }) },
    })
    expect(await s.result).toBe(0)
    expect(s.logger.text()).toContain('Dev Mode is already on here')
    expect(s.logger.text()).not.toContain('keeps the settings')
  })

  test('a session of the same scope that is stopping is session_running: nothing starts, run again once it ends', async () => {
    const existing = {
      session_id: 's_00000000000f',
      pid: 4123,
      state: 'stopping',
      stage: 'dev',
      region: 'us-east-1',
      selection: { only: [], skip: [] },
    }
    const s = start({
      ...four,
      state: null,
      deps: { openState: async () => ({ claimed: false, existing }) },
    })
    await expect(s.result).rejects.toMatchObject({
      code: 'DEV_MODE_SESSION_RUNNING',
      message:
        'The Dev Mode session here (session s_00000000000f, pid 4123, stage dev) is stopping. Run the command again once it has ended.',
      next: [
        {
          command: 'serverless dev wait --for ended',
          when: 'to wait until it has ended',
        },
      ],
    })
    expect(s.lambda.calls).toEqual([])
  })

  test('a running session whose control endpoint could not open is never replaced: session_running, saying how to stop it', async () => {
    const existing = {
      session_id: 's_00000000000f',
      pid: 4123,
      state: 'on',
      stage: 'dev',
      region: 'us-east-1',
      selection: { only: [], skip: [] },
      control: null,
      control_unavailable: true,
    }
    const s = start({
      ...four,
      state: null,
      deps: { openState: async () => ({ claimed: false, existing }) },
    })
    const error = await s.result.catch((e) => e)
    expect(error).toMatchObject({ code: 'DEV_MODE_SESSION_RUNNING' })
    expect(error.message).toContain('Ctrl+C')
    expect(error.message).toContain(
      'run "serverless dev restore --stage dev --region us-east-1"',
    )
    expect(error.next).toEqual([
      {
        command: 'serverless dev restore --stage dev --region us-east-1',
        when: 'after stopping that session with Ctrl+C in its terminal',
      },
    ])
    expect(s.lambda.calls).toEqual([])
  })

  test('a session of the same scope still starting is reported as starting, and nothing else runs', async () => {
    const existing = {
      session_id: 's_00000000000f',
      pid: 4123,
      state: 'starting',
      stage: 'dev',
      region: 'us-east-1',
      selection: { only: [], skip: [] },
    }
    const s = start({
      ...four,
      state: null,
      deps: { openState: async () => ({ claimed: false, existing }) },
    })
    expect(await s.result).toBe(0)
    expect(s.logger.text()).toContain(
      'Dev Mode is starting here (session s_00000000000f, pid 4123, stage dev).',
    )
    expect(s.lambda.calls).toEqual([])
  })

  test('a session of another stage or selection here is an error that names dev stop', async () => {
    const existing = {
      session_id: 's_00000000000f',
      pid: 4123,
      stage: 'other',
      region: 'us-east-1',
      selection: { only: [], skip: [] },
    }
    const s = start({
      ...four,
      state: null,
      deps: { openState: async () => ({ claimed: false, existing }) },
    })
    await expect(s.result).rejects.toMatchObject({
      code: 'DEV_MODE_SESSION_RUNNING',
      message:
        'Another Dev Mode session is running here (stage other, pid 4123). Stop it first with "serverless dev stop".',
      next: [
        { command: 'serverless dev stop', when: 'to end the running session' },
      ],
    })
    expect(s.lambda.calls).toEqual([])
  })

  test('a session file that cannot be written leaves a warning and the session going', async () => {
    const s = start({
      ...four,
      state: null,
      deps: {
        openState: async () => {
          throw Object.assign(new Error('EACCES: permission denied'), {
            code: 'EACCES',
          })
        },
      },
    })
    await s.whenReady
    s.proc.emit('SIGINT', 'SIGINT')
    expect(await s.result).toBe(0)
    expect(s.logger.text()).toContain(
      'Dev Mode could not write its session record in .serverless/dev (EACCES: permission denied)',
    )
  })

  test('a session started with --detach that cannot write its record ends its start: nothing changes', async () => {
    const s = start({
      ...four,
      state: null,
      options: { 'session-process': true },
      deps: {
        openState: async () => {
          throw Object.assign(new Error('EACCES: permission denied'), {
            code: 'EACCES',
          })
        },
      },
    })
    const error = await s.result.catch((e) => e)
    expect(error).toMatchObject({
      code: 'DEV_MODE_RECORD_UNAVAILABLE',
      message: expect.stringContaining(
        'Dev Mode could not write its session record in .serverless/dev (EACCES: permission denied).',
      ),
    })
    expect(s.lambda.calls).toEqual([])
  })

  test('a .serverless/dev that is a link leaves a warning and the session going without a record', async () => {
    const s = start({
      ...four,
      state: null,
      deps: {
        openState: async () => {
          throw Object.assign(
            new Error(
              '/srv/orders/.serverless/dev is a link or a file, not a directory',
            ),
            { code: 'EDEVLINK' },
          )
        },
      },
    })
    await s.whenReady
    s.proc.emit('SIGINT', 'SIGINT')
    expect(await s.result).toBe(0)
    expect(s.logger.text()).toContain(
      'Dev Mode could not write its session record in .serverless/dev (/srv/orders/.serverless/dev is a link or a file, not a directory)',
    )
  })

  test('a claim that other starts keep taking fails the start: never two sessions in one directory', async () => {
    const s = start({
      ...four,
      state: null,
      deps: {
        openState: async () => {
          throw Object.assign(
            new Error(
              'Dev Mode could not claim .serverless/dev/session.json: another start keeps replacing it.',
            ),
            { reason: 'session_running' },
          )
        },
      },
    })
    await expect(s.result).rejects.toMatchObject({
      code: 'DEV_MODE_SESSION_RUNNING',
      next: [
        { command: 'serverless dev stop', when: 'to end the running session' },
      ],
    })
    expect(s.lambda.calls).toEqual([])
  })

  test('a forced exit writes the end first, with what is still attached', async () => {
    const state = memoryState()
    const s = start({ ...four, state, deps: { restoreTimeoutMs: 20 } })
    await s.whenReady
    s.lambda.updateFunctionConfiguration = () => new Promise(() => {})
    // Whether the last record was written when the process was told to exit.
    const endedAtExit = []
    s.proc.exit = (code) => {
      endedAtExit.push(
        state.records.some((record) => record.type === 'session.ended'),
      )
      s.proc.exits.push(code)
    }
    s.proc.emit('SIGINT', 'SIGINT')
    expect(await s.result).toBe(3)
    expect(s.proc.exits).toEqual([3])
    expect(endedAtExit).toEqual([true])
    const ended = state.records.filter(
      (record) => record.type === 'session.ended',
    )
    expect(ended).toEqual([
      {
        type: 'session.ended',
        exit_code: 3,
        restore: {
          restored: 0,
          unchanged: 0,
          skipped: 0,
          missing: 0,
          failed: 2,
        },
        kept: false,
      },
    ])
    expect(typesOf(state).at(-1)).toBe('session.ended')
  })

  test('a function that leaves Dev Mode during the session is recorded', async () => {
    const state = memoryState()
    const s = start({
      functions: { api: {} },
      live: { api: {} },
      watchIntervalMs: 5,
      state,
    })
    await s.whenReady
    s.lambda.state.delete('svc-dev-api')
    await until(() =>
      state.records.some((record) => record.type === 'function.lost'),
    )
    expect(
      state.records.find((record) => record.type === 'function.lost'),
    ).toEqual({
      type: 'function.lost',
      function: 'api',
      state: 'function_deleted',
    })
    s.proc.emit('SIGINT', 'SIGINT')
    await s.result
  })

  test('a function the session loses is no longer reported as running here, in dev status', async () => {
    const serviceDir = tempServiceDir()
    const s = start({
      functions: { api: {}, worker: {} },
      live: { api: {}, worker: {} },
      watchIntervalMs: 5,
      state: null,
      serviceDir,
    })
    await s.whenReady
    s.lambda.state.delete('svc-dev-api')
    await until(() =>
      s.logger
        .text()
        .includes('api left Dev Mode: the function no longer exists.'),
    )
    const { result, human } = await runDevStatus({ serviceDir })
    expect(result.functions).toEqual([
      {
        name: 'api',
        mode: 'deployed',
        reason: 'function_deleted',
        why: 'the function no longer exists',
      },
      { name: 'worker', mode: 'dev' },
    ])
    expect(humanText(human)).toContain(
      'api       deployed  the function no longer exists',
    )
    s.proc.emit('SIGINT', 'SIGINT')
    expect(await s.result).toBe(0)
  })

  test('the relay connection and run write their records to the event log', async () => {
    const state = memoryState()
    let connectionRecord
    let runRecord
    const s = start({
      ...four,
      state,
      deps: {
        connectRelay: async (options) => {
          connectionRecord = options.record
          return {
            transport: { publish: async () => true },
            credentials: { current: () => ({}) },
            setReceiver() {},
            onReconnected() {},
            quiet() {},
            async stop() {},
          }
        },
        startLaptop: async (options) => {
          runRecord = options.relay
          return { stop: async () => {} }
        },
      },
    })
    await s.whenReady
    connectionRecord('connection.lost', { reason: 'x' })
    expect(state.records.at(-1)).toEqual({
      type: 'connection.lost',
      reason: 'x',
    })
    expect(typeof runRecord.onNotRun).toBe('function')
    s.proc.emit('SIGINT', 'SIGINT')
    await s.result
  })
  test('with a record on disk, the session writes its log there and deletes its file when it ends', async () => {
    const serviceDir = tempServiceDir()
    const dir = path.join(serviceDir, '.serverless', 'dev')
    let laptopOptions
    const s = start({
      ...four,
      state: null,
      serviceDir,
      deps: {
        startLaptop: async (options) => {
          laptopOptions = options
          return { stop: async () => {} }
        },
      },
    })
    await s.whenReady
    expect(
      JSON.parse(fs.readFileSync(path.join(dir, 'session.json'), 'utf8')),
    ).toMatchObject({
      v: 1,
      session_id: testSessionId(1),
      pid: process.pid,
      state: 'on',
      stage: 'dev',
      region: 'us-east-1',
      ready_at: expect.any(String),
    })
    laptopOptions.events.emit('reload.start', { files: 1, functions: ['api'] })
    s.proc.emit('SIGINT', 'SIGINT')
    expect(await s.result).toBe(0)
    const lines = fs
      .readFileSync(path.join(dir, 'session.ndjson'), 'utf8')
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line))
    expect(lines.map((line) => line.seq)).toEqual(lines.map((_, i) => i + 1))
    expect(lines.every((line) => line.session_id === testSessionId(1))).toBe(
      true,
    )
    expect(lines.map((line) => line.type)).toContain('reload.start')
    expect(lines.at(-1).type).toBe('session.ended')
    expect(fs.existsSync(path.join(dir, 'session.json'))).toBe(false)
  })
  test('with a record on disk, an invocation through the session recorder gets its file and records', async () => {
    const serviceDir = tempServiceDir()
    let laptopOptions
    const s = start({
      ...four,
      state: null,
      serviceDir,
      deps: {
        startLaptop: async (options) => {
          laptopOptions = options
          return { stop: async () => {} }
        },
      },
    })
    await s.whenReady
    // One invocation, reported to the session's recorder as the laptop runtime reports it.
    const { recorder } = laptopOptions
    const requestId = '3f2a9c1e-0000-4000-8000-0000000000aa'
    const event = { headers: { authorization: 'Bearer sk-test-session' } }
    const eventBytes = Buffer.from(JSON.stringify(event))
    recorder.start({
      functionKey: 'api',
      requestId,
      event,
      eventBytes,
      newWorker: true,
      source: 'caller',
    })
    recorder.end({
      functionKey: 'api',
      requestId,
      event,
      eventBytes,
      reply: { kind: 'response', body: Buffer.from('{"statusCode":201}') },
      durationMs: 4,
    })
    expect(recorder.counts()).toEqual({ total: 1, errors: 0 })
    laptopOptions.events.emit('reload.start', { files: 1, functions: ['api'] })
    s.proc.emit('SIGINT', 'SIGINT')
    expect(await s.result).toBe(0)
    const lines = fs
      .readFileSync(
        path.join(serviceDir, '.serverless', 'dev', 'session.ndjson'),
        'utf8',
      )
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line))
    const end = lines.find((line) => line.type === 'invocation.end')
    expect(end).toMatchObject({
      function: 'api',
      request_id: requestId,
      outcome: 'ok',
      status_code: 201,
    })
    const file = JSON.parse(
      fs.readFileSync(path.join(serviceDir, ...end.file.split('/')), 'utf8'),
    )
    expect(file).toMatchObject({
      request_id: requestId,
      function: 'api',
      context: { function_name: 'svc-dev-api' },
      redacted: ['event.headers.authorization'],
    })
    expect(JSON.stringify(file)).not.toContain('sk-test-session')
    expect(lines.map((line) => line.type)).toEqual(
      expect.arrayContaining([
        'invocation.start',
        'invocation.end',
        'reload.start',
      ]),
    )
    expect(lines.at(-1).type).toBe('session.ended')
    expect(
      fs.existsSync(
        path.join(serviceDir, '.serverless', 'dev', 'session.json'),
      ),
    ).toBe(false)
    expect(
      fs.existsSync(
        path.join(serviceDir, '.serverless', 'dev', 'control.token'),
      ),
    ).toBe(false)
  })
  test('dev status reaches a running session through its control endpoint', async () => {
    const serviceDir = tempServiceDir()
    const s = start({ ...four, state: null, serviceDir })
    await s.whenReady
    const session = await connectToSession({ serviceDir })
    const { status, body } = await session.status()
    expect(status).toBe(200)
    expect(body).toMatchObject({
      state: 'on',
      session_id: testSessionId(1),
      stage: 'dev',
      owner: 'alice@mbp',
      invocations: { total: 0, errors: 0 },
      functions: [
        { name: 'api', mode: 'dev' },
        { name: 'worker', mode: 'dev' },
        expect.objectContaining({
          name: 'report',
          mode: 'deployed',
          reason: 'runtime_not_supported',
        }),
        expect.objectContaining({
          name: 'edge',
          mode: 'deployed',
          reason: 'edge_function',
        }),
      ],
      endpoints: [],
      cursor: `${testSessionId(1)}:6`,
    })
    // Without a laptop runtime (this harness starts none) the session refuses a replay with a
    // reason, not a server error.
    expect(await session.replay('3f2a9c1e')).toMatchObject({
      status: 409,
      body: { reason: 'error' },
    })
    s.proc.emit('SIGINT', 'SIGINT')
    expect(await s.result).toBe(0)
    expect(await connectToSession({ serviceDir })).toBeNull()
  })

  test('the relay is told where the credentials come from, as the CLI found it for the run', async () => {
    const source = { source: 'profile', profile: 'ops', resolver: 'awsOps' }
    let told
    const s = start({
      ...four,
      provider: {
        ...fakeProvider(),
        getProfile: () => 'dev',
        serverless: { awsCredentialSource: source },
      },
      deps: {
        connectRelay: async (args) => {
          told = args.credentialSource
          return fakeRelayConnection()
        },
      },
    })
    await s.whenReady
    expect(told).toBe(source)
    s.proc.emit('SIGINT', 'SIGINT')
    expect(await s.result).toBe(0)
  })

  const REST = 'https://abc.execute-api.us-east-1.amazonaws.com/dev'
  // The stack check as the real one runs it: describeStacks through the provider. `deployed()`
  // says whether the stack exists yet.
  const stackProvider = (
    deployed = () => true,
    outputs = [{ OutputKey: 'ServiceEndpoint', OutputValue: REST }],
  ) => {
    const provider = fakeProvider()
    return {
      ...provider,
      naming: {
        ...provider.naming,
        getLambdaFunctionUrlOutputLogicalId: (key) => `${key}LambdaFunctionUrl`,
      },
      request: async (service, method) => {
        if (`${service}.${method}` !== 'CloudFormation.describeStacks') {
          throw new Error(`unexpected ${service}.${method}`)
        }
        if (!deployed()) throw new Error('Stack with id svc-dev does not exist')
        return { Stacks: [{ Outputs: outputs }] }
      },
    }
  }
  const httpAndMcp = {
    functions: {
      api: { events: [{ http: 'GET items' }] },
      crm: { events: [] },
    },
    // The mcp plugin's registry, built by its initialize hook.
    plugins: [{ validated: { servers: [{ name: 'crm' }] } }],
  }

  test('the start names the endpoints and the MCP servers right after the ready line, and dev status lists both', async () => {
    const serviceDir = tempServiceDir()
    const s = start({
      ...httpAndMcp,
      live: { api: {}, crm: {} },
      provider: stackProvider(),
      state: null,
      serviceDir,
      deps: { stackExists: undefined },
    })
    await s.whenReady
    const lines = s.logger.lines.map((line) => line.text)
    const ready = lines.findIndex((text) => text.startsWith('Dev Mode on ·'))
    expect(ready).toBeGreaterThan(-1)
    expect(lines.slice(ready + 1, ready + 3)).toEqual([
      `endpoint: GET - ${REST}/items`,
      `mcp: crm → ${REST}/crm/mcp`,
    ])
    const session = await connectToSession({ serviceDir })
    const { body } = await session.status()
    expect(body.endpoints).toEqual([
      { method: 'GET', url: `${REST}/items`, function: 'api' },
      { method: 'ANY', url: `${REST}/crm/mcp`, function: 'crm', mcp: true },
    ])
    s.proc.emit('SIGINT', 'SIGINT')
    expect(await s.result).toBe(0)
  })

  test('on a stage the session deploys first, the endpoints come from the stack it deployed', async () => {
    let deployed = false
    const s = start({
      ...httpAndMcp,
      live: { api: {}, crm: {} },
      provider: stackProvider(() => deployed),
      deps: { stackExists: undefined },
    })
    s.serverless.pluginManager.spawn = async (name) => {
      s.serverless.pluginManager.spawned.push(name)
      deployed = true
    }
    await s.whenReady
    expect(s.serverless.pluginManager.spawned).toEqual(['deploy'])
    expect(s.logger.text()).toContain(
      `endpoint: GET - ${REST}/items\nmcp: crm → ${REST}/crm/mcp`,
    )
    s.proc.emit('SIGINT', 'SIGINT')
    expect(await s.result).toBe(0)
  })

  test('a REST API root and a function URL read as serverless info prints them, at the start and in dev status', async () => {
    const FUNCTION_URL = 'https://xyz.lambda-url.us-east-1.on.aws/'
    const serviceDir = tempServiceDir()
    const s = start({
      functions: {
        api: { events: [{ http: 'GET /' }] },
        web: { url: true, events: [] },
      },
      live: { api: {}, web: {} },
      provider: stackProvider(undefined, [
        { OutputKey: 'ServiceEndpoint', OutputValue: REST },
        { OutputKey: 'webLambdaFunctionUrl', OutputValue: FUNCTION_URL },
      ]),
      state: null,
      serviceDir,
      deps: { stackExists: undefined },
    })
    await s.whenReady
    const block = `endpoints:\n  GET - ${REST}\n  web: ${FUNCTION_URL}`
    expect(s.logger.text()).toContain(block)
    const { result, human } = await runDevStatus({ serviceDir })
    expect(humanText(human)).toContain(block)
    // The --json entries keep their shape.
    expect(result.endpoints).toEqual([
      { method: 'GET', url: `${REST}/`, function: 'api' },
      { method: 'ANY', url: FUNCTION_URL, function: 'web' },
    ])
    expect(Object.keys(result)).not.toContain('endpoint_text')
    s.proc.emit('SIGINT', 'SIGINT')
    expect(await s.result).toBe(0)
  })

  describe.each([
    ['a plain id', 'ext789'],
    ['an Fn::ImportValue', { 'Fn::ImportValue': 'shared-http-api-id' }],
  ])('an HTTP API that provider.httpApi.id names (%s)', (name, id) => {
    const EXTERNAL = 'https://ext789.execute-api.us-east-1.amazonaws.com'
    // The stack has no output for it; AWS gives its URL, as `serverless info` reads it.
    const externalProvider = (getApi) => {
      const provider = stackProvider(undefined, [])
      return {
        ...provider,
        request: async (service, method, params) => {
          if (`${service}.${method}` === 'CloudFormation.listExports') {
            return {
              Exports: [{ Name: 'shared-http-api-id', Value: 'ext789' }],
            }
          }
          if (`${service}.${method}` === 'ApiGatewayV2.getApi') {
            return getApi(params)
          }
          return provider.request(service, method, params)
        },
      }
    }
    const orders = {
      functions: { orders: { events: [{ httpApi: 'GET /orders' }] } },
      live: { orders: {} },
      serviceProvider: { httpApi: { id } },
      state: null,
      deps: { stackExists: undefined },
    }

    test('its routes are listed at the start, in dev status and in dev status --json', async () => {
      const serviceDir = tempServiceDir()
      const asked = []
      const s = start({
        ...orders,
        serviceDir,
        provider: externalProvider(async (params) => {
          asked.push(params)
          return { ApiEndpoint: EXTERNAL }
        }),
      })
      await s.whenReady
      expect(asked).toEqual([{ ApiId: 'ext789' }])
      const block = `endpoint: GET - ${EXTERNAL}/orders`
      expect(s.logger.text()).toContain(block)
      const { result, human } = await runDevStatus({ serviceDir })
      expect(humanText(human)).toContain(block)
      expect(result.endpoints).toEqual([
        { method: 'GET', url: `${EXTERNAL}/orders`, function: 'orders' },
      ])
      s.proc.emit('SIGINT', 'SIGINT')
      expect(await s.result).toBe(0)
    })

    test('a failed lookup leaves them out and the session runs', async () => {
      const serviceDir = tempServiceDir()
      const s = start({
        ...orders,
        serviceDir,
        provider: externalProvider(async () => {
          throw new Error('Not Found')
        }),
      })
      await s.whenReady
      expect(s.logger.text()).not.toMatch(/endpoints?:/)
      expect(s.logger.lines).toContainEqual({
        level: 'debug',
        text: 'Dev Mode could not look up the HTTP API that provider.httpApi.id names, so its endpoints are not listed: Not Found',
      })
      const { result } = await runDevStatus({ serviceDir })
      expect(result.endpoints).toEqual([])
      s.proc.emit('SIGINT', 'SIGINT')
      expect(await s.result).toBe(0)
    })
  })

  test('a service with no endpoint prints no endpoint lines', async () => {
    const s = start({ ...four, provider: stackProvider() })
    await s.whenReady
    expect(s.logger.text()).not.toMatch(/endpoints?:/)
    expect(s.logger.text()).not.toContain('mcp:')
    s.proc.emit('SIGINT', 'SIGINT')
    expect(await s.result).toBe(0)
  })

  test.each(['SIGINT', 'SIGTERM', 'SIGHUP'])(
    'a %s before the first change ends the session at once: session.ended with nothing restored, no record left',
    async (signal) => {
      const serviceDir = tempServiceDir()
      let checking
      const checked = new Promise((resolve) => {
        checking = resolve
      })
      let release
      const s = start({
        ...four,
        state: null,
        serviceDir,
        deps: {
          // The session is still checking AWS when the signal comes.
          stackExists: () => {
            checking()
            return new Promise((resolve) => {
              release = resolve
            })
          },
        },
      })
      await checked
      s.proc.emit(signal, signal)
      expect(s.proc.exits).toEqual([0])
      const dir = path.join(serviceDir, '.serverless', 'dev')
      expect(fs.existsSync(path.join(dir, 'session.json'))).toBe(false)
      expect(fs.existsSync(path.join(dir, 'control.token'))).toBe(false)
      const records = fs
        .readFileSync(path.join(dir, 'session.ndjson'), 'utf8')
        .trim()
        .split('\n')
        .map((line) => JSON.parse(line))
      expect(records.at(-1)).toMatchObject({
        type: 'session.ended',
        exit_code: 0,
        restore: {
          restored: 0,
          unchanged: 0,
          skipped: 0,
          missing: 0,
          failed: 0,
        },
      })
      // Where a process exit does not end it (here), the session changes nothing after that.
      release(true)
      expect(await s.result).toBe(0)
      expect(
        s.lambda.calls.filter(
          ([name]) => name === 'updateFunctionConfiguration',
        ),
      ).toEqual([])
    },
  )

  test('a session started with --detach whose control endpoint cannot open fails its start: nothing changes, its record goes', async () => {
    const serviceDir = tempServiceDir()
    const s = start({
      ...four,
      state: null,
      serviceDir,
      options: { 'session-process': true },
      deps: {
        openControl: async () => {
          throw Object.assign(new Error('listen EPERM'), { code: 'EPERM' })
        },
      },
    })
    const error = await s.result.catch((e) => e)
    expect(error).toMatchObject({ code: 'DEV_MODE_CONTROL_UNAVAILABLE' })
    expect(s.lambda.calls).toEqual([])
    const dir = path.join(serviceDir, '.serverless', 'dev')
    expect(fs.existsSync(path.join(dir, 'session.json'))).toBe(false)
    const records = fs
      .readFileSync(path.join(dir, 'session.ndjson'), 'utf8')
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line))
    expect(records.at(-2)).toMatchObject({
      type: 'session.failed',
      reason: 'control_unavailable',
      exit_code: 1,
    })
    expect(records.at(-1)).toMatchObject({
      type: 'session.ended',
      exit_code: 1,
    })
  })

  test('a control endpoint that cannot open is recorded, so the record never looks like a starting session', async () => {
    const serviceDir = tempServiceDir()
    const s = start({
      ...four,
      state: null,
      serviceDir,
      deps: {
        openControl: async () => {
          throw Object.assign(new Error('listen EPERM'), { code: 'EPERM' })
        },
      },
    })
    await s.whenReady
    const record = JSON.parse(
      fs.readFileSync(
        path.join(serviceDir, '.serverless', 'dev', 'session.json'),
        'utf8',
      ),
    )
    expect(record).toMatchObject({ control: null, control_unavailable: true })
    expect(s.logger.text()).toContain(
      'Dev Mode could not open its local control endpoint (listen EPERM)',
    )
    s.proc.emit('SIGINT', 'SIGINT')
    expect(await s.result).toBe(0)
  })

  test('stop goes through the control endpoint, the same way as Ctrl+C', async () => {
    const serviceDir = tempServiceDir()
    const s = start({ ...four, state: null, serviceDir })
    const before = shapes(s.lambda)
    await s.whenReady
    const session = await connectToSession({ serviceDir })
    expect(await session.stop()).toEqual({
      status: 202,
      body: { stopping: true },
    })
    expect(await s.result).toBe(0)
    expect(
      s.progress
        .texts('main')
        .filter((line) =>
          line.startsWith('Restoring 2 functions · press Ctrl+C again'),
        ),
    ).toHaveLength(1)
    expect(shapes(s.lambda)).toBe(before)
    const lines = fs
      .readFileSync(
        path.join(serviceDir, '.serverless', 'dev', 'session.ndjson'),
        'utf8',
      )
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line))
    expect(
      lines.find((line) => line.type === 'session.stopping'),
    ).toMatchObject({ trigger: 'stop_command' })
    expect(
      lines.find((line) => line.type === 'session.stopping').signal,
    ).toBeUndefined()
  })

  test('stop with keep leaves the functions in Dev Mode', async () => {
    const serviceDir = tempServiceDir()
    const s = start({ ...four, state: null, serviceDir })
    await s.whenReady
    const attached = shapes(s.lambda)
    await (await connectToSession({ serviceDir })).stop({ keep: true })
    expect(await s.result).toBe(0)
    expect(shapes(s.lambda)).toBe(attached)
    const ended = fs
      .readFileSync(
        path.join(serviceDir, '.serverless', 'dev', 'session.ndjson'),
        'utf8',
      )
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line))
      .at(-1)
    expect(ended).toMatchObject({
      type: 'session.ended',
      kept: true,
      exit_code: 0,
    })
  })

  test('a stop that comes while the session checks AWS changes nothing', async () => {
    const serviceDir = tempServiceDir()
    const s = start({
      ...four,
      state: null,
      serviceDir,
      deps: {
        stackExists: async () => {
          await (await connectToSession({ serviceDir })).stop()
          return true
        },
      },
    })
    expect(await s.result).toBe(0)
    expect(updates(s.lambda)).toEqual([])
    expect(s.logger.text()).toContain('Dev Mode off · no function was changed')
  })

  test('a stop that comes while the session checks AWS deploys nothing on a new stage', async () => {
    const serviceDir = tempServiceDir()
    const s = start({
      ...four,
      state: null,
      serviceDir,
      deps: {
        stackExists: async () => {
          await (await connectToSession({ serviceDir })).stop()
          return false
        },
      },
    })
    expect(await s.result).toBe(0)
    expect(s.serverless.pluginManager.spawned).toEqual([])
    expect(updates(s.lambda)).toEqual([])
    expect(s.logger.text()).toContain('Dev Mode off · no function was changed')
  })

  test.each([
    ['an existing stage', true],
    ['a new stage', false],
  ])(
    'a stop that comes before the --approve question skips the question (%s)',
    async (_, exists) => {
      const serviceDir = tempServiceDir()
      const s = start({
        ...four,
        state: null,
        serviceDir,
        interactive: true,
        options: { approve: true },
        deps: {
          stackExists: async () => {
            await (await connectToSession({ serviceDir })).stop()
            return exists
          },
        },
      })
      expect(await s.result).toBe(0)
      expect(s.asked).toEqual([])
      expect(s.serverless.pluginManager.spawned).toEqual([])
      expect(updates(s.lambda)).toEqual([])
      expect(s.logger.text()).toContain(
        'Dev Mode off · no function was changed',
      )
    },
  )
})

describe('replay through the control endpoint', () => {
  const tempDirs = []
  afterAll(() => {
    for (const dir of tempDirs) fs.rmSync(dir, { recursive: true, force: true })
  })
  const tempServiceDir = () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sls-dev-t-'))
    tempDirs.push(dir)
    return dir
  }
  const FIRST = 'aaaaaaaa-0000-4000-8000-00000000000b'
  const SECOND = 'aaaaaaaa-0000-4000-8000-00000000000c'
  const recordsOf = (serviceDir) =>
    fs
      .readFileSync(
        path.join(serviceDir, '.serverless', 'dev', 'session.ndjson'),
        'utf8',
      )
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line))
  /**
   * A laptop whose start waits for `release()`, and whose runtime runs an invocation by feeding
   * the session's recorder the way dispatch does. With `drainGate`, its drain waits for it.
   */
  const replayLaptop = ({ drainGate } = {}) => {
    const laptop = { options: null, release: null, draining: false }
    const gate = new Promise((resolve) => (laptop.release = resolve))
    const run = (request) => {
      const details = {
        functionKey: request.functionKey,
        requestId: request.headers['lambda-runtime-aws-request-id'],
        event: JSON.parse(request.event.toString()),
        eventBytes: request.event,
        environmentId: request.environmentId,
        headers: request.headers,
        source: request.source ?? 'caller',
        newWorker: false,
      }
      const reply = {
        kind: 'response',
        contentType: 'application/json',
        body: Buffer.from('{"ok":true}'),
      }
      laptop.options.recorder.start(details)
      laptop.options.recorder.end({
        ...details,
        reply,
        durationMs: 5,
        timeoutSeconds: 6,
      })
      return reply
    }
    laptop.runtime = {
      has: (key) => key === 'api',
      latestEnvironment: (key) =>
        key === 'api' ? { AWS_ACCESS_KEY_ID: 'ASIAEXAMPLE' } : null,
      invoke: jest.fn(async (request) => run(request)),
    }
    laptop.startLaptop = async (options) => {
      laptop.options = options
      await gate
      return {
        runtime: laptop.runtime,
        stop: async () => {},
        drain: async () => {
          laptop.draining = true
          await drainGate
        },
      }
    }
    // One invocation of api from a caller, as dispatch would record it.
    laptop.callerInvocation = (requestId) =>
      run({
        functionKey: 'api',
        environmentId: 'env-1',
        source: 'caller',
        event: Buffer.from('{"headers":{"authorization":"Bearer real"}}'),
        headers: { 'lambda-runtime-aws-request-id': requestId },
      })
    return laptop
  }

  test('a replay before the session is ready is refused, and nothing runs', async () => {
    const serviceDir = tempServiceDir()
    const laptop = replayLaptop()
    const s = start({
      ...four,
      state: null,
      serviceDir,
      deps: { startLaptop: laptop.startLaptop },
    })
    // The laptop is starting.
    await until(() => laptop.options !== null)
    const session = await connectToSession({ serviceDir })
    expect(await session.replay('aaaaaaaa', { timeoutMs: 5_000 })).toEqual({
      status: 409,
      body: {
        reason: 'error',
        message:
          'Dev Mode is still starting; replay once "serverless dev wait --for ready" returns.',
      },
    })
    expect(laptop.runtime.invoke).not.toHaveBeenCalled()
    laptop.release()
    await s.whenReady
    s.proc.emit('SIGINT', 'SIGINT')
    expect(await s.result).toBe(0)
  })

  test('a replay of a recorded invocation runs through the laptop runtime, with the raw event', async () => {
    const serviceDir = tempServiceDir()
    const laptop = replayLaptop()
    laptop.release()
    const s = start({
      ...four,
      state: null,
      serviceDir,
      deps: { startLaptop: laptop.startLaptop },
    })
    await s.whenReady
    laptop.callerInvocation(FIRST)
    const session = await connectToSession({ serviceDir })
    const { status, body } = await session.replay('aaaaaaaa', {
      timeoutMs: 5_000,
    })
    expect(status).toBe(200)
    expect(body).toMatchObject({
      replay_of: FIRST,
      function: 'api',
      outcome: 'ok',
      file: expect.stringMatching(/^\.serverless\/dev\/invocations\/api\//),
    })
    expect(body).not.toHaveProperty('note')
    expect(body.request_id).not.toBe(FIRST)
    expect(laptop.runtime.invoke).toHaveBeenCalledTimes(1)
    const [request] = laptop.runtime.invoke.mock.calls[0]
    expect(request).toMatchObject({
      functionKey: 'api',
      environmentId: 'dev-replay',
      source: 'replay',
    })
    expect(request.event.toString()).toContain('Bearer real')
    expect(
      JSON.parse(
        fs.readFileSync(path.join(serviceDir, ...body.file.split('/')), 'utf8'),
      ),
    ).toMatchObject({
      request_id: body.request_id,
      source: 'replay',
      replay_of: FIRST,
    })
    s.proc.emit('SIGINT', 'SIGINT')
    expect(await s.result).toBe(0)
    expect(
      recordsOf(serviceDir).find(
        (record) =>
          record.type === 'invocation.end' &&
          record.request_id === body.request_id,
      ),
    ).toMatchObject({ source: 'replay', outcome: 'ok', file: body.file })
  })

  test('an unknown id is 404 and an ambiguous one 409', async () => {
    const serviceDir = tempServiceDir()
    const laptop = replayLaptop()
    laptop.release()
    const s = start({
      ...four,
      state: null,
      serviceDir,
      deps: { startLaptop: laptop.startLaptop },
    })
    await s.whenReady
    laptop.callerInvocation(FIRST)
    laptop.callerInvocation(SECOND)
    const session = await connectToSession({ serviceDir })
    expect(
      await session.replay('ffffffff', { timeoutMs: 5_000 }),
    ).toMatchObject({
      status: 404,
      body: { reason: 'invocation_not_found' },
    })
    expect(
      await session.replay('aaaaaaaa', { timeoutMs: 5_000 }),
    ).toMatchObject({
      status: 409,
      body: { reason: 'ambiguous_request_id' },
    })
    expect(laptop.runtime.invoke).not.toHaveBeenCalled()
    s.proc.emit('SIGINT', 'SIGINT')
    expect(await s.result).toBe(0)
  })

  test('a replay the runtime refuses without recording it answers 409 at once', async () => {
    const serviceDir = tempServiceDir()
    const laptop = replayLaptop()
    laptop.release()
    const s = start({
      ...four,
      state: null,
      serviceDir,
      deps: { startLaptop: laptop.startLaptop },
    })
    await s.whenReady
    laptop.callerInvocation(FIRST)
    // As dispatch answers when the local worker cannot start: an error, and no record.
    laptop.runtime.invoke.mockImplementationOnce(async () => ({
      kind: 'error',
      errorType: 'Runtime.Unknown',
      body: Buffer.from(
        JSON.stringify({
          errorType: 'Runtime.Unknown',
          errorMessage:
            'Dev Mode could not start the local worker for api: boom',
        }),
      ),
    }))
    const session = await connectToSession({ serviceDir })
    expect(await session.replay(FIRST, { timeoutMs: 5_000 })).toEqual({
      status: 409,
      body: {
        reason: 'error',
        message: 'Dev Mode could not start the local worker for api: boom',
      },
    })
    s.proc.emit('SIGINT', 'SIGINT')
    expect(await s.result).toBe(0)
  })

  test('after the stop began a replay is refused', async () => {
    const serviceDir = tempServiceDir()
    let releaseDrain
    const drainGate = new Promise((resolve) => (releaseDrain = resolve))
    const laptop = replayLaptop({ drainGate })
    laptop.release()
    const s = start({
      ...four,
      state: null,
      serviceDir,
      deps: { startLaptop: laptop.startLaptop },
    })
    await s.whenReady
    laptop.callerInvocation(FIRST)
    const session = await connectToSession({ serviceDir })
    s.proc.emit('SIGINT', 'SIGINT')
    await until(() => laptop.draining)
    expect(await session.replay(FIRST, { timeoutMs: 5_000 })).toEqual({
      status: 409,
      body: {
        reason: 'error',
        message: 'Dev Mode is stopping; nothing more runs on this machine.',
      },
    })
    expect(laptop.runtime.invoke).not.toHaveBeenCalled()
    releaseDrain()
    expect(await s.result).toBe(0)
  })
})

describe('a detached session process', () => {
  const tempDirs = []
  afterAll(() => {
    for (const dir of tempDirs) fs.rmSync(dir, { recursive: true, force: true })
  })
  const tempServiceDir = () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sls-dev-t-'))
    tempDirs.push(dir)
    return dir
  }
  const devDir = (serviceDir) => path.join(serviceDir, '.serverless', 'dev')
  const recordsOf = (serviceDir) =>
    fs
      .readFileSync(path.join(devDir(serviceDir), 'session.ndjson'), 'utf8')
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line))
  const sessionFileOf = (serviceDir) =>
    JSON.parse(
      fs.readFileSync(path.join(devDir(serviceDir), 'session.json'), 'utf8'),
    )
  /** An idle timer that records what the session gives it and how it is used. */
  const capturingIdle = () => {
    const seen = { created: null, touches: 0, started: 0, stopped: 0 }
    const createIdle = (args) => {
      seen.created = args
      return {
        start: () => (seen.started += 1),
        touch: () => (seen.touches += 1),
        stop: () => (seen.stopped += 1),
      }
    }
    return { seen, createIdle }
  }
  const DETACHED = { 'session-process': true, 'idle-timeout': '60s' }

  test('the idle timeout stops and restores a detached session', async () => {
    const serviceDir = tempServiceDir()
    const { seen, createIdle } = capturingIdle()
    const s = start({
      ...four,
      state: null,
      serviceDir,
      options: { ...DETACHED },
      deps: { createIdle },
    })
    const before = shapes(s.lambda)
    await s.whenReady
    expect(seen.created.timeoutMs).toBe(60_000)
    expect(seen.started).toBe(1)
    seen.created.onIdle()
    expect(await s.result).toBe(0)
    expect(shapes(s.lambda)).toBe(before)
    expect(s.logger.text()).toContain(
      'No activity for 1m: Dev Mode stops and restores your functions (--idle-timeout).',
    )
    const stopping = recordsOf(serviceDir).filter(
      (record) => record.type === 'session.stopping',
    )
    expect(stopping).toEqual([
      expect.objectContaining({ trigger: 'idle_timeout' }),
    ])
    expect(seen.stopped).toBeGreaterThanOrEqual(1)
  })

  test('the idle timer of a session process fires on its own and leaves no timer', async () => {
    const serviceDir = tempServiceDir()
    // The real idle timer, on a clock the test moves.
    const clock = manualClock(0)
    const s = start({
      ...four,
      state: null,
      serviceDir,
      options: { 'session-process': true, 'idle-timeout': '1m' },
      deps: {
        createIdle: (args) =>
          createIdleTimer({ ...args, timers: clock.timers, now: clock.now }),
      },
    })
    await s.whenReady
    const stoppings = () =>
      recordsOf(serviceDir).filter(
        (record) => record.type === 'session.stopping',
      )
    await clock.advance(59_999)
    expect(stoppings()).toEqual([])
    // Nothing touched the session for a minute: it stops and restores.
    await clock.advance(1)
    expect(await s.result).toBe(0)
    expect(stoppings()).toEqual([
      expect.objectContaining({ trigger: 'idle_timeout' }),
    ])
    expect(s.logger.text()).toContain(
      'No activity for 1m: Dev Mode stops and restores your functions (--idle-timeout).',
    )
    expect(clock.live()).toBe(0)
  })

  test('agent commands keep it alive', async () => {
    const serviceDir = tempServiceDir()
    const { seen, createIdle } = capturingIdle()
    let laptopOptions = null
    const s = start({
      ...four,
      state: null,
      serviceDir,
      options: { ...DETACHED },
      deps: {
        createIdle,
        startLaptop: async (options) => {
          laptopOptions = options
          return { stop: async () => {} }
        },
      },
    })
    await s.whenReady
    const session = await connectToSession({ serviceDir })
    const before = seen.touches
    await session.status()
    await session.touch()
    await session.replay('ffffffff', { timeoutMs: 5_000 })
    // Each control request is one touch, and the handlers add none of their own.
    expect(seen.touches - before).toBe(3)
    laptopOptions.events.emit('invocation.start', {
      function: 'api',
      request_id: 'aaaaaaaa-0000-4000-8000-0000000000a1',
    })
    laptopOptions.events.emit('invocation.end', {
      function: 'api',
      request_id: 'aaaaaaaa-0000-4000-8000-0000000000a1',
    })
    expect(seen.touches - before).toBe(5)
    expect(
      recordsOf(serviceDir).filter((record) =>
        record.type.startsWith('invocation.'),
      ),
    ).toHaveLength(2)
    s.proc.emit('SIGINT', 'SIGINT')
    expect(await s.result).toBe(0)
  })

  test('a running invocation keeps it from being idle', async () => {
    const serviceDir = tempServiceDir()
    const { seen, createIdle } = capturingIdle()
    let busy = true
    const s = start({
      ...four,
      state: null,
      serviceDir,
      options: { ...DETACHED },
      deps: {
        createIdle,
        startLaptop: async () => ({
          runtime: {
            workers: () => [{ functionKey: 'api', pid: 4242, busy }],
          },
          stop: async () => {},
        }),
      },
    })
    await s.whenReady
    expect(seen.created.isBusy()).toBe(true)
    busy = false
    expect(seen.created.isBusy()).toBe(false)
    s.proc.emit('SIGINT', 'SIGINT')
    expect(await s.result).toBe(0)
  })

  test('a relayed invocation still being handled keeps it from being idle', async () => {
    const serviceDir = tempServiceDir()
    const { seen, createIdle } = capturingIdle()
    let inFlight = 1
    const s = start({
      ...four,
      state: null,
      serviceDir,
      options: { ...DETACHED },
      deps: {
        createIdle,
        startLaptop: async () => ({
          runtime: { workers: () => [] },
          relay: { inFlight: () => inFlight },
          stop: async () => {},
        }),
      },
    })
    await s.whenReady
    expect(seen.created.isBusy()).toBe(true)
    inFlight = 0
    expect(seen.created.isBusy()).toBe(false)
    s.proc.emit('SIGINT', 'SIGINT')
    expect(await s.result).toBe(0)
  })

  test('a session in a terminal has no idle timeout', async () => {
    const serviceDir = tempServiceDir()
    const { seen, createIdle } = capturingIdle()
    const s = start({
      ...four,
      state: null,
      serviceDir,
      options: {},
      deps: { createIdle },
    })
    await s.whenReady
    expect(seen.created).toBeNull()
    s.proc.emit('SIGINT', 'SIGINT')
    expect(await s.result).toBe(0)
  })

  test('--on-exit keep is honoured at the idle timeout', async () => {
    const serviceDir = tempServiceDir()
    const { seen, createIdle } = capturingIdle()
    const s = start({
      ...four,
      state: null,
      serviceDir,
      options: { 'session-process': true, 'on-exit': 'keep' },
      deps: { createIdle },
    })
    await s.whenReady
    const attachUpdates = updates(s.lambda).length
    seen.created.onIdle()
    expect(await s.result).toBe(0)
    expect(updates(s.lambda)).toHaveLength(attachUpdates)
    expect(s.logger.text()).toContain(
      'Left 2 functions in Dev Mode (--on-exit keep).',
    )
    const records = recordsOf(serviceDir)
    expect(records.at(-1)).toMatchObject({
      type: 'session.ended',
      kept: true,
    })
  })

  test('the session file says the session was started with --take-over and --on-exit', async () => {
    const serviceDir = tempServiceDir()
    const s = start({
      ...four,
      state: null,
      serviceDir,
      options: {
        'session-process': true,
        'take-over': true,
        'on-exit': 'keep',
      },
      deps: { createIdle: capturingIdle().createIdle },
    })
    await s.whenReady
    expect(sessionFileOf(serviceDir)).toMatchObject({
      take_over: true,
      on_exit: 'keep',
    })
    s.proc.emit('SIGINT', 'SIGINT')
    expect(await s.result).toBe(0)
  })

  test('the session file says it is detached', async () => {
    const off = tempServiceDir()
    const s = start({
      ...four,
      state: null,
      serviceDir: off,
      options: { 'session-process': true, 'idle-timeout': '0' },
    })
    await s.whenReady
    expect(sessionFileOf(off)).toMatchObject({
      detached: true,
      idle_timeout_s: null,
      log_file: 'session.log',
    })
    expect(recordsOf(off)[0]).toMatchObject({
      type: 'session.starting',
      detached: true,
    })
    s.proc.emit('SIGINT', 'SIGINT')
    expect(await s.result).toBe(0)

    const byDefault = tempServiceDir()
    const t = start({
      ...four,
      state: null,
      serviceDir: byDefault,
      options: { 'session-process': true },
      deps: { createIdle: capturingIdle().createIdle },
    })
    await t.whenReady
    expect(sessionFileOf(byDefault)).toMatchObject({
      detached: true,
      idle_timeout_s: 3600,
      log_file: 'session.log',
    })
    t.proc.emit('SIGINT', 'SIGINT')
    expect(await t.result).toBe(0)

    // The log the launcher started it with becomes session.log once it holds the directory, and
    // its name leaves this process's environment: no handler worker or other child sees it.
    const launched = tempServiceDir()
    const devDir = path.join(launched, '.serverless', 'dev')
    fs.mkdirSync(devDir, { recursive: true })
    fs.writeFileSync(path.join(devDir, 'session.log.4242.tmp'), 'its output\n')
    process.env.SLS_DEV_SESSION_LOG = 'session.log.4242.tmp'
    try {
      const v = start({
        ...four,
        state: null,
        serviceDir: launched,
        options: { 'session-process': true },
        deps: { createIdle: capturingIdle().createIdle },
      })
      await v.whenReady
      expect(fs.readFileSync(path.join(devDir, 'session.log'), 'utf8')).toBe(
        'its output\n',
      )
      expect(fs.existsSync(path.join(devDir, 'session.log.4242.tmp'))).toBe(
        false,
      )
      expect(process.env).not.toHaveProperty('SLS_DEV_SESSION_LOG')
      expect(
        handlerEnvironment({
          machine: process.env,
          credentials: { uri: 'http://127.0.0.1:4567/c', token: 't' },
          configFiles: { config: 'c', credentials: 'k', boto: 'b' },
          runtimeApi: '127.0.0.1:9999/lambda/w1',
          taskRoot: launched,
          handler: 'handler.handler',
        }).env,
      ).not.toHaveProperty('SLS_DEV_SESSION_LOG')
      v.proc.emit('SIGINT', 'SIGINT')
      expect(await v.result).toBe(0)
    } finally {
      delete process.env.SLS_DEV_SESSION_LOG
    }

    const foreground = tempServiceDir()
    const u = start({ ...four, state: null, serviceDir: foreground })
    await u.whenReady
    expect(sessionFileOf(foreground)).toMatchObject({
      detached: false,
      idle_timeout_s: null,
      log_file: null,
    })
    expect(recordsOf(foreground)[0]).toMatchObject({
      type: 'session.starting',
      detached: false,
    })
    u.proc.emit('SIGINT', 'SIGINT')
    expect(await u.result).toBe(0)
  })
})

describe('keys at a terminal', () => {
  const tempDirs = []
  afterAll(() => {
    for (const dir of tempDirs) fs.rmSync(dir, { recursive: true, force: true })
  })
  const tempServiceDir = () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sls-dev-t-'))
    tempDirs.push(dir)
    return dir
  }
  const stoppingRecords = (serviceDir) =>
    fs
      .readFileSync(
        path.join(serviceDir, '.serverless', 'dev', 'session.ndjson'),
        'utf8',
      )
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line))
      .filter((record) => record.type === 'session.stopping')

  test('a person at a terminal gets the keys hint; --no-keys or a terminal that is not interactive the Ctrl+C hint', async () => {
    const s = start({ ...four, tty: true })
    await s.whenReady
    expect(s.logger.text()).toContain(KEYS_HINT)
    expect(s.logger.text()).not.toContain(STOP_HINT)
    expect(s.proc.stdin.isRaw).toBe(true)
    s.proc.emit('SIGINT', 'SIGINT')
    expect(await s.result).toBe(0)
    expect(s.proc.stdin.isRaw).toBe(false)

    // --no-keys, and a logger that is not interactive (CI, an AI agent without
    // SLS_INTERACTIVE_SETUP_ENABLE).
    for (const variant of [
      { options: { keys: false } },
      { interactive: false },
    ]) {
      const t = start({ ...four, tty: true, ...variant })
      await t.whenReady
      expect(t.logger.text()).toContain(STOP_HINT)
      expect(t.logger.text()).not.toContain(KEYS_HINT)
      expect(t.proc.stdin.isRaw).toBe(false)
      expect(t.proc.stdin.modes).toEqual([])
      t.proc.emit('SIGINT', 'SIGINT')
      expect(await t.result).toBe(0)
    }

    // A person taken for an AI agent who set SLS_INTERACTIVE_SETUP_ENABLE: the logger is
    // interactive, and the keys follow it.
    const u = start({ ...four, tty: true, deps: { isAgent: () => true } })
    await u.whenReady
    expect(u.logger.text()).toContain(KEYS_HINT)
    expect(u.proc.stdin.isRaw).toBe(true)
    u.proc.emit('SIGINT', 'SIGINT')
    expect(await u.result).toBe(0)
  })

  test('q restores and exits like the first Ctrl+C, as a hotkey stop', async () => {
    const serviceDir = tempServiceDir()
    const s = start({ ...four, tty: true, state: null, serviceDir })
    const before = shapes(s.lambda)
    await s.whenReady
    s.proc.stdin.write('s')
    await until(() => s.logger.text().includes('warm:'))
    expect(s.logger.text()).toContain(
      'Dev Mode on · svc · dev · 2 of 4 functions · 0 invocations, no errors',
    )
    s.proc.stdin.write('q')
    expect(await s.result).toBe(0)
    expect(shapes(s.lambda)).toBe(before)
    expect(s.progress.texts('main')).toContain(
      'Restoring 2 functions · press Ctrl+C again to exit without waiting',
    )
    const stopping = stoppingRecords(serviceDir)
    expect(stopping).toHaveLength(1)
    expect(stopping[0]).toMatchObject({ trigger: 'hotkey' })
    expect(stopping[0].signal).toBeUndefined()
    expect(s.proc.stdin.modes.at(-1)).toBe(false)
    expect(s.proc.exits).toEqual([])
  })

  test('Ctrl+C in raw mode is the same stop as SIGINT, and the next one after 500 ms forces', async () => {
    const serviceDir = tempServiceDir()
    const clock = handClock()
    const s = start({
      ...four,
      tty: true,
      state: null,
      serviceDir,
      deps: { now: clock.now, elapsed: clock.now },
    })
    await s.whenReady
    const restoring = []
    const update = s.lambda.updateFunctionConfiguration
    s.lambda.updateFunctionConfiguration = (params) => {
      restoring.push(params.FunctionName)
      // The terminal is back in its normal mode before the restore sends anything: a Ctrl+C now
      // is a real signal, and one more than half a second after the first forces the exit.
      if (restoring.length === 1) {
        expect(s.proc.stdin.modes.at(-1)).toBe(false)
        clock.advance(501)
        s.proc.emit('SIGINT', 'SIGINT')
      }
      return update(params)
    }
    s.proc.stdin.write('\x03')
    expect(await s.result).toBe(3)
    expect(s.proc.exits).toEqual([3])
    expect(s.progress.texts('main')).toContain(
      'Restoring 2 functions · press Ctrl+C again to exit without waiting',
    )
    const stopping = stoppingRecords(serviceDir)
    expect(stopping).toHaveLength(1)
    expect(stopping[0]).toMatchObject({ trigger: 'signal', signal: 'SIGINT' })
  })

  test('q, then a Ctrl+C more than 500 ms later, forces the exit', async () => {
    const serviceDir = tempServiceDir()
    const clock = handClock()
    const s = start({
      ...four,
      tty: true,
      state: null,
      serviceDir,
      deps: { now: clock.now, elapsed: clock.now },
    })
    await s.whenReady
    const restoring = []
    const update = s.lambda.updateFunctionConfiguration
    s.lambda.updateFunctionConfiguration = (params) => {
      restoring.push(params.FunctionName)
      if (restoring.length === 1) {
        clock.advance(501)
        s.proc.emit('SIGINT', 'SIGINT')
      }
      return update(params)
    }
    s.proc.stdin.write('q')
    expect(await s.result).toBe(3)
    expect(s.proc.exits).toEqual([3])
    const stopping = stoppingRecords(serviceDir)
    expect(stopping).toHaveLength(1)
    expect(stopping[0]).toMatchObject({ trigger: 'hotkey' })
  })

  test('--on-exit remove asks with the terminal back in its normal mode', async () => {
    const rawWhenAsked = []
    const s = start({
      ...four,
      tty: true,
      interactive: true,
      options: { 'on-exit': 'remove' },
      deps: {
        confirm: async () => {
          rawWhenAsked.push(s.proc.stdin.isRaw)
          return true
        },
      },
    })
    await s.whenReady
    expect(s.proc.stdin.isRaw).toBe(true)
    s.proc.stdin.write('q')
    expect(await s.result).toBe(0)
    expect(rawWhenAsked).toEqual([false])
    expect(s.serverless.pluginManager.spawned).toEqual(['remove'])
  })

  test('a Ctrl+C key restores like SIGINT when no second one comes', async () => {
    const serviceDir = tempServiceDir()
    const s = start({ ...four, tty: true, state: null, serviceDir })
    const before = shapes(s.lambda)
    await s.whenReady
    s.proc.stdin.write('\x03')
    expect(await s.result).toBe(0)
    expect(shapes(s.lambda)).toBe(before)
    expect(s.proc.exits).toEqual([])
    expect(stoppingRecords(serviceDir)).toEqual([
      expect.objectContaining({ trigger: 'signal', signal: 'SIGINT' }),
    ])
  })

  test('h, v, r and s reach their actions', async () => {
    const s = start({ ...four, tty: true })
    await s.whenReady
    for (const key of ['h', 'V', 'r', 's']) s.proc.stdin.write(key)
    await until(() => s.logger.text().includes('warm: api'))
    expect(s.logger.text()).toContain(KEY_HELP)
    expect(s.logger.text()).toContain(DETAILED_ON)
    expect(s.laptop.reloadNow).toHaveBeenCalledTimes(1)
    expect(s.laptop.toggleDetailed).toHaveBeenCalledTimes(1)
    // The in-memory record holds no stage, so the status line has none; two functions do not
    // run here, so the table follows.
    expect(s.logger.text()).toContain(
      'Dev Mode on · 2 of 4 functions · 0 invocations, no errors\n  warm: api · last: none yet\nFunction',
    )
    s.proc.emit('SIGINT', 'SIGINT')
    expect(await s.result).toBe(0)
  })

  test('s shows the status of a session that could not write its record', async () => {
    const s = start({ ...four, tty: true, state: noSessionState() })
    await s.whenReady
    s.proc.stdin.write('s')
    await until(() => s.logger.text().includes('warm:'))
    expect(s.logger.text()).toContain(
      'Dev Mode on · 2 of 4 functions · 0 invocations, no errors',
    )
    // The key ran: no debug line says it could not.
    expect(
      s.logger.lines.filter(
        (line) => line.level === 'debug' && /could not run/.test(line.text),
      ),
    ).toEqual([])
    s.proc.emit('SIGINT', 'SIGINT')
    expect(await s.result).toBe(0)
  })

  test('after a reload spinner left the terminal in its normal mode, the keys take it back', async () => {
    let laptopArgs
    const s = start({
      ...four,
      tty: true,
      deps: {
        isAgent: () => false,
        startLaptop: async (args) => {
          laptopArgs = args
          return s.laptop
        },
      },
    })
    await s.whenReady
    // What the spinner does when it stops.
    s.proc.stdin.setRawMode(false)
    s.proc.stdin.pause()
    laptopArgs.onSpinnerDone()
    expect(s.proc.stdin.isRaw).toBe(true)
    expect(s.proc.stdin.isPaused()).toBe(false)
    s.proc.emit('SIGINT', 'SIGINT')
    expect(await s.result).toBe(0)
    // Once the keys are closed, nothing takes the terminal again.
    laptopArgs.onSpinnerDone()
    expect(s.proc.stdin.isRaw).toBe(false)
  })

  test('the terminal is put back when the session ends on an error', async () => {
    const s = start({ ...four, tty: true })
    s.laptop.drain = async () => {
      throw new Error('drain failed')
    }
    await s.whenReady
    s.proc.emit('SIGINT', 'SIGINT')
    await s.result.catch(() => {})
    expect(s.proc.stdin.modes.at(-1)).toBe(false)
  })
})
