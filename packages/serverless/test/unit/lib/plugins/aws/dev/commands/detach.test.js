import { afterEach, describe, expect, jest, test } from '@jest/globals'
import { spawn as realSpawn } from 'child_process'
import { EventEmitter } from 'events'
import fs from 'fs'
import os from 'os'
import path from 'path'
import {
  runDetach,
  sessionProcessArgs,
} from '../../../../../../../lib/plugins/aws/dev/commands/detach.js'
import { exitCodeOf } from '../../../../../../../lib/plugins/aws/dev/commands/envelope.js'
import { openEventLog } from '../../../../../../../lib/plugins/aws/dev/state/events.js'
import { devDirOf } from '../../../../../../../lib/plugins/aws/dev/state/paths.js'
import {
  countingTimers,
  fakeLog,
  fakeProvider,
  humanText,
} from '../attach/fakes.js'
import { runWithoutColor } from '../without-color.js'
import {
  resetCliNames,
  setCliNames,
} from '../../../../../../../lib/plugins/aws/dev/commands/cli-names.js'

// Its tests read the plain text of styled lines.
runWithoutColor()

const SESSION = 's_3f2a9c1e0b4d'
const CHILD_PID = 50123
const FUNCTIONS = [
  { name: 'createOrder', mode: 'dev' },
  {
    name: 'report',
    mode: 'deployed',
    reason: 'runtime_not_supported',
    why: 'Java runs only on AWS',
  },
]
const dirs = []
const logs = []
afterEach(() => {
  for (const log of logs.splice(0)) {
    try {
      log.close()
    } catch {
      // Closed by the test already.
    }
  }
  for (const dir of dirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

const sessionRecord = (fields = {}) => ({
  v: 1,
  session_id: SESSION,
  pid: CHILD_PID,
  state: 'starting',
  service: 'orders',
  stage: 'dev',
  region: 'us-east-1',
  owner: 'ana@laptop',
  selection: { only: [], skip: [] },
  detached: true,
  idle_timeout_s: 3600,
  // Claimed now: a record still starting counts only shortly after its start.
  started_at: new Date().toISOString(),
  ready_at: null,
  cli_version: '4.44.0',
  events_file: 'session.ndjson',
  log_file: 'session.log',
  control: { url: 'http://127.0.0.1:53121', token_file: 'control.token' },
  ...fields,
})
/** A control client of a running session, as `connectToSession` returns it. */
const clientOf = (record, body) => ({
  record,
  status: async () => ({ status: 200, body }),
})
const until = async (condition) => {
  while (!condition()) await new Promise((resolve) => setImmediate(resolve))
}
const STARTING = {
  service: 'orders',
  stage: 'dev',
  region: 'us-east-1',
  owner: 'ana@laptop',
  pid: CHILD_PID,
  detached: true,
  selection: { only: [], skip: [] },
}
const openLog = (service) => {
  const log = openEventLog({
    dir: devDirOf(service),
    sessionId: SESSION,
    now: () => Date.parse('2026-10-05T10:40:03Z'),
    fs,
  })
  logs.push(log)
  return log
}

/** The log file of this start's session process before it holds the directory. */
const isOwnLog = (name) => /^session\.log\..+\.tmp$/.test(name)
const ownLogOf = (service) =>
  path.join(devDirOf(service), fs.readdirSync(devDirOf(service)).find(isOwnLog))

const launch = ({
  options = {},
  interactive = false,
  deps = {},
  child = Object.assign(new EventEmitter(), {
    pid: CHILD_PID,
    unref: jest.fn(),
  }),
  service = (() => {
    const made = fs.mkdtempSync(path.join(os.tmpdir(), 'sls-dev-t-'))
    dirs.push(made)
    return made
  })(),
} = {}) => {
  const spawn = jest.fn(() => child)
  const timers = countingTimers()
  const logger = fakeLog({ interactive })
  // The session as the control endpoint shows it, once there is one.
  const live = { client: null }
  const promise = runDetach({
    serverless: { serviceDir: service, service: { service: 'orders' } },
    provider: fakeProvider(),
    options: { detach: true, json: true, ...options },
    logger,
    deps: {
      spawn,
      timers,
      connect: async () => live.client,
      isAlive: () => true,
      execPath: '/usr/local/bin/node',
      execArgv: ['--no-warnings', '--inspect=9229'],
      argv: [
        '/usr/local/bin/node',
        '/opt/sf-core.js',
        'dev',
        '--detach',
        '--json',
        '--stage',
        'dev',
        '--approve',
      ],
      cwd: service,
      env: { PATH: '/usr/bin' },
      presenceMs: 25,
      waitMs: 10_000,
      ...deps,
    },
  }).then((outcome) => ({ ...outcome, timersLeft: timers.live() }))
  /** Plays the session process: its session file, then its records. */
  const sessionProcess = {
    started: async (fields) => {
      await until(() => spawn.mock.calls.length > 0)
      fs.writeFileSync(
        path.join(devDirOf(service), 'session.json'),
        JSON.stringify(sessionRecord(fields)),
      )
      const log = openLog(service)
      log.emit('session.starting', STARTING)
      return log
    },
    ready: (log) => {
      live.client = clientOf(sessionRecord({ state: 'on' }), {
        state: 'on',
        functions: FUNCTIONS,
        cursor: `${SESSION}:2`,
      })
      return log.emit('session.ready', {
        functions: { dev: 1, deployed: 1, skipped: 0 },
        ready_ms: 9000,
        attach_ms: 2000,
      })
    },
  }
  return {
    service,
    child,
    spawn,
    logger,
    live,
    promise,
    session: sessionProcess,
  }
}

describe('serverless dev --detach', () => {
  test('starts this CLI again in the background, without --detach, --json, --approve or --inspect', async () => {
    const { service, child, spawn, promise } = launch()
    await until(() => spawn.mock.calls.length > 0)
    child.emit('exit', 1, null)
    await promise
    expect(spawn).toHaveBeenCalledWith(
      '/usr/local/bin/node',
      [
        '--no-warnings',
        '/opt/sf-core.js',
        'dev',
        '--stage',
        'dev',
        '--session-process',
      ],
      {
        cwd: service,
        // The session process takes this log over as session.log once it holds the directory.
        env: {
          PATH: '/usr/bin',
          SLS_DEV_SESSION_LOG: `session.log.${process.pid}.tmp`,
        },
        detached: true,
        windowsHide: true,
        stdio: ['ignore', expect.any(Number), expect.any(Number)],
      },
    )
    expect(child.unref).toHaveBeenCalledTimes(1)
    // It ended before it held the directory: its output stays in its own log.
    const logFile = ownLogOf(service)
    expect(fs.existsSync(logFile)).toBe(true)
    if (process.platform !== 'win32') {
      expect(fs.statSync(logFile).mode & 0o777).toBe(0o600)
    }
  })

  test('returns once the session is ready, with its functions and files', async () => {
    const { session, promise } = launch()
    const log = await session.started()
    session.ready(log)
    const { result, human, timersLeft } = await promise
    expect(result).toEqual({
      v: 1,
      status: 'ok',
      session_id: SESSION,
      pid: CHILD_PID,
      state: 'on',
      log_file: '.serverless/dev/session.log',
      events_file: '.serverless/dev/session.ndjson',
      cursor: `${SESSION}:2`,
      functions: FUNCTIONS,
    })
    expect(exitCodeOf(result)).toBe(0)
    // The outcome is a success line; the session and pid are secondary.
    expect(human[0]).toEqual([
      'success',
      `Dev Mode on in the background · 1 of 2 functions (session ${SESSION}, pid ${CHILD_PID})`,
    ])
    // One function does not run here: the table says why.
    expect(humanText(human)).toMatch(/Function\s+Mode\s+Why/)
    expect(human).toContainEqual([
      'aside',
      'Next: "serverless dev wait --for invocation" waits for an invocation; "serverless dev stop" restores your functions and ends the session.',
    ])
    expect(timersLeft).toBe(0)
  })

  test('from a Compose root, the lines and next commands name the service and its folder', async () => {
    const service = fs.mkdtempSync(path.join(os.tmpdir(), 'sls-dev-t-'))
    dirs.push(service)
    setCliNames({
      serverless: {
        serviceDir: service,
        compose: { isWithinCompose: true, serviceName: 'consumer' },
      },
      cwd: path.dirname(service),
    })
    try {
      const { session, promise } = launch({ service })
      const log = await session.started()
      session.ready(log)
      const { result, human } = await promise
      const folder = path.basename(service)
      // The result's paths are relative to where the command ran, as its next commands are.
      expect(result).toMatchObject({
        log_file: `${folder}/.serverless/dev/session.log`,
        events_file: `${folder}/.serverless/dev/session.ndjson`,
      })
      expect(human).toContainEqual([
        'aside',
        `Events: ${folder}/.serverless/dev/session.ndjson · output: ${folder}/.serverless/dev/session.log`,
      ])
      expect(human).toContainEqual([
        'aside',
        'Next: "serverless consumer dev wait --for invocation" waits for an invocation; "serverless consumer dev stop" restores your functions and ends the session.',
      ])
    } finally {
      resetCliNames()
    }
  })

  test('the endpoints a session names add nothing to the --json envelope or the background line', async () => {
    const { session, promise, live, logger } = launch()
    const log = await session.started()
    session.ready(log)
    live.client = clientOf(sessionRecord({ state: 'on' }), {
      state: 'on',
      functions: FUNCTIONS,
      cursor: `${SESSION}:2`,
      endpoints: [
        { method: 'GET', url: 'https://x/items', function: 'api' },
        { method: 'ANY', url: 'https://x/crm/mcp', function: 'crm', mcp: true },
      ],
    })
    const { result, human } = await promise
    expect(Object.keys(result).sort()).toEqual([
      'cursor',
      'events_file',
      'functions',
      'log_file',
      'pid',
      'session_id',
      'state',
      'status',
      'v',
    ])
    expect(humanText(human)).not.toContain('https://x/')
    expect(logger.text()).not.toContain('https://x/')
  })

  test('--detach twice returns already_running and starts nothing', async () => {
    const running = launch({
      deps: {
        connect: async () =>
          clientOf(sessionRecord({ state: 'on' }), {
            state: 'on',
            functions: FUNCTIONS,
            cursor: `${SESSION}:9`,
          }),
      },
    })
    const { result, human } = await running.promise
    expect(result).toMatchObject({
      status: 'ok',
      already_running: true,
      session_id: SESSION,
      pid: CHILD_PID,
      state: 'on',
      cursor: `${SESSION}:9`,
      log_file: '.serverless/dev/session.log',
      functions: FUNCTIONS,
    })
    expect(human[0]).toEqual([
      'notice',
      `Dev Mode is already on here (session ${SESSION}, pid ${CHILD_PID}, stage dev).`,
    ])
    expect(running.spawn).not.toHaveBeenCalled()
  })

  test('--detach again with other settings says the running session keeps its own', async () => {
    const running = launch({
      options: { 'idle-timeout': '2h', 'take-over': true },
      deps: {
        connect: async () =>
          clientOf(sessionRecord({ state: 'on' }), {
            state: 'on',
            functions: FUNCTIONS,
            cursor: `${SESSION}:9`,
          }),
      },
    })
    const { result, human } = await running.promise
    const line =
      'The running session keeps the settings it started with: --idle-timeout 2h and --take-over apply only to a new one. Run "serverless dev stop", then start again to use them.'
    expect(result).toMatchObject({
      status: 'ok',
      already_running: true,
      message: line,
    })
    expect(human).toContainEqual(['notice', line])
    expect(running.spawn).not.toHaveBeenCalled()
  })

  test('--detach again with the settings the session runs with adds nothing', async () => {
    const running = launch({
      options: { 'idle-timeout': '60m' },
      deps: {
        connect: async () =>
          clientOf(sessionRecord({ state: 'on' }), {
            state: 'on',
            functions: FUNCTIONS,
          }),
      },
    })
    const { result } = await running.promise
    expect(result.already_running).toBe(true)
    expect(result.message).toBeUndefined()
  })

  test('a running foreground session is already_running with no log file', async () => {
    const running = launch({
      deps: {
        connect: async () =>
          clientOf(
            sessionRecord({ state: 'on', detached: false, log_file: null }),
            { state: 'on', functions: FUNCTIONS, cursor: `${SESSION}:9` },
          ),
      },
    })
    const { result } = await running.promise
    expect(result).toMatchObject({
      status: 'ok',
      already_running: true,
      log_file: null,
    })
    expect(running.spawn).not.toHaveBeenCalled()
  })

  test('a second --detach while the first session is still starting waits for it and starts nothing', async () => {
    // The control endpoint does not listen yet (control: null); the live pid makes it a starting session.
    const { service, spawn, live, promise } = launch()
    fs.mkdirSync(devDirOf(service), { recursive: true })
    fs.writeFileSync(
      path.join(devDirOf(service), 'session.json'),
      JSON.stringify(sessionRecord({ control: null })),
    )
    const log = openLog(service)
    log.emit('session.starting', STARTING)
    // Let the launcher find the starting session and begin to wait for it.
    await new Promise((resolve) => setImmediate(resolve))
    live.client = clientOf(sessionRecord({ state: 'on' }), {
      state: 'on',
      functions: FUNCTIONS,
      cursor: `${SESSION}:2`,
    })
    log.emit('session.ready', {
      functions: { dev: 1, deployed: 1, skipped: 0 },
      ready_ms: 9000,
      attach_ms: 2000,
    })
    const { result, timersLeft } = await promise
    expect(result).toMatchObject({
      status: 'ok',
      already_running: true,
      session_id: SESSION,
      state: 'on',
    })
    expect(spawn).not.toHaveBeenCalled()
    expect(timersLeft).toBe(0)
  })

  test('a stale session file (its process is gone) does not stop a new start', async () => {
    const run = launch({ deps: { isAlive: (pid) => pid !== 4242 } })
    fs.mkdirSync(devDirOf(run.service), { recursive: true })
    fs.writeFileSync(
      path.join(devDirOf(run.service), 'session.json'),
      JSON.stringify(sessionRecord({ pid: 4242, control: null })),
    )
    await until(() => run.spawn.mock.calls.length > 0)
    run.child.emit('exit', 1, null)
    expect((await run.promise).result).toMatchObject({
      reason: 'detach_failed',
    })
  })

  test('a session of the same scope that is stopping is session_running: run again once it ends', async () => {
    const { spawn, promise } = launch({
      deps: {
        connect: async () =>
          clientOf(sessionRecord({ state: 'stopping' }), {
            state: 'stopping',
          }),
      },
    })
    const { result } = await promise
    expect(spawn).not.toHaveBeenCalled()
    expect(result).toMatchObject({
      status: 'error',
      reason: 'session_running',
      state: 'stopping',
      message: `The Dev Mode session here (session ${SESSION}, pid ${CHILD_PID}, stage dev) is stopping. Run the command again once it has ended.`,
      next: [
        {
          command: 'serverless dev wait --for ended',
          when: 'to wait until it has ended',
        },
      ],
    })
  })

  test('a session here for another stage or other functions is session_running', async () => {
    for (const fields of [
      { stage: 'qa' },
      { selection: { only: ['createOrder'], skip: [] } },
    ]) {
      const run = launch({
        deps: {
          connect: async () =>
            clientOf(sessionRecord({ state: 'on', ...fields }), {}),
        },
      })
      const { result, human } = await run.promise
      expect(result).toMatchObject({
        status: 'error',
        reason: 'session_running',
        next: [{ command: 'serverless dev stop' }],
      })
      expect(human).toContain('Another Dev Mode session is running here')
      expect(exitCodeOf(result)).toBe(1)
      expect(run.spawn).not.toHaveBeenCalled()
    }
  })

  test("a session here that no command can reach: the restore after Ctrl+C names that session's stage and region", async () => {
    const run = launch({
      deps: {
        connect: async () =>
          clientOf(
            sessionRecord({
              state: 'on',
              stage: 'alice',
              region: 'eu-west-1',
              control: null,
              control_unavailable: true,
            }),
            {},
          ),
      },
    })
    const { result } = await run.promise
    expect(result).toMatchObject({
      status: 'error',
      reason: 'session_running',
      next: [
        {
          command: 'serverless dev restore --stage alice --region eu-west-1',
          when: 'after stopping that session with Ctrl+C in its terminal',
        },
      ],
    })
    expect(result.message).toContain(
      'then run "serverless dev restore --stage alice --region eu-west-1" if it left functions in Dev Mode',
    )
    expect(run.spawn).not.toHaveBeenCalled()
  })

  test('a start that fails reports the session reason, with the status that reason has', async () => {
    const { session, promise } = launch()
    const log = await session.started()
    log.emit('session.failed', {
      reason: 'attach_incomplete',
      message: 'No function could be attached.',
      exit_code: 3,
    })
    const { result, timersLeft } = await promise
    expect(result).toMatchObject({
      status: 'error',
      reason: 'attach_incomplete',
      message: 'No function could be attached.',
      session_id: SESSION,
      state: 'failed',
      cursor: `${SESSION}:2`,
    })
    expect(exitCodeOf(result)).toBe(3)
    expect(timersLeft).toBe(0)

    const denied = launch()
    const deniedLog = await denied.session.started()
    deniedLog.emit('session.failed', {
      reason: 'permission_denied',
      message: 'Dev Mode needs permission to call iot:DescribeEndpoint.',
      exit_code: 1,
    })
    expect((await denied.promise).result).toMatchObject({
      status: 'action_required',
      reason: 'permission_denied',
      user_action_required: true,
    })
  })

  test('a session process that could not open its control endpoint is detach_failed, with the end of its log', async () => {
    const { service, session, promise } = launch()
    const log = await session.started()
    fs.writeFileSync(
      path.join(devDirOf(service), 'session.log'),
      'Dev Mode · orders · stage dev · us-east-1\n',
    )
    log.emit('session.failed', {
      reason: 'control_unavailable',
      message:
        'Dev Mode could not open its local control endpoint (listen EPERM).',
      exit_code: 1,
    })
    log.emit('session.ended', {
      exit_code: 1,
      restore: {
        restored: 0,
        unchanged: 0,
        skipped: 0,
        missing: 0,
        failed: 0,
      },
      kept: false,
    })
    const { result, human } = await promise
    expect(result).toMatchObject({
      status: 'error',
      reason: 'detach_failed',
      message: expect.stringContaining(
        'Dev Mode could not open its local control endpoint (listen EPERM).',
      ),
      session_id: SESSION,
      pid: CHILD_PID,
      state: 'failed',
      cursor: `${SESSION}:2`,
      log_file: '.serverless/dev/session.log',
    })
    expect(exitCodeOf(result)).toBe(1)
    expect(human).toContain('Dev Mode · orders · stage dev · us-east-1')
  })

  test('a session process that could not open its control endpoint and left between two looks is still detach_failed, with its log', async () => {
    const { service, child, spawn, promise } = launch()
    await until(() => spawn.mock.calls.length > 0)
    // Between two looks of the launcher, the process holds the directory (its log becomes
    // session.log), cannot open its endpoint, ends, releases its session file and exits.
    const dir = devDirOf(service)
    fs.appendFileSync(ownLogOf(service), 'Dev Mode · orders · stage dev\n')
    fs.renameSync(ownLogOf(service), path.join(dir, 'session.log'))
    fs.writeFileSync(
      path.join(dir, 'session.json'),
      JSON.stringify(sessionRecord({ control: null })),
    )
    const log = openLog(service)
    log.emit('session.starting', STARTING)
    log.emit('session.failed', {
      reason: 'control_unavailable',
      message:
        'Dev Mode could not open its local control endpoint (listen EPERM).',
      exit_code: 1,
    })
    log.emit('session.ended', {
      exit_code: 1,
      restore: { restored: 0, unchanged: 0, skipped: 0, missing: 0, failed: 0 },
      kept: false,
    })
    log.close()
    fs.rmSync(path.join(dir, 'session.json'))
    child.emit('exit', 1, null)
    const { result, human, timersLeft } = await promise
    expect(result).toMatchObject({
      status: 'error',
      reason: 'detach_failed',
      message: expect.stringContaining(
        'Dev Mode could not open its local control endpoint (listen EPERM).',
      ),
      session_id: SESSION,
      pid: CHILD_PID,
      state: 'failed',
      cursor: `${SESSION}:2`,
      log_file: '.serverless/dev/session.log',
    })
    expect(fs.existsSync(path.join(service, result.log_file))).toBe(true)
    expect(human).toContain('Dev Mode · orders · stage dev')
    expect(timersLeft).toBe(0)
  })

  test('a session process that held the directory and ended with no record names session.log', async () => {
    const { service, child, spawn, promise } = launch()
    await until(() => spawn.mock.calls.length > 0)
    const dir = devDirOf(service)
    fs.appendFileSync(ownLogOf(service), 'Dev Mode · orders · stage dev\n')
    fs.renameSync(ownLogOf(service), path.join(dir, 'session.log'))
    child.emit('exit', 1, null)
    const { result, human } = await promise
    expect(result).toMatchObject({
      status: 'error',
      reason: 'detach_failed',
      message:
        'The Dev Mode session process ended before it was ready (exit code 1). Its output is in .serverless/dev/session.log.',
      log_file: '.serverless/dev/session.log',
    })
    expect(human).toContain('Dev Mode · orders · stage dev')
  })

  test('a failed start that left a function attached says so, as dev wait reports that end', async () => {
    const { session, promise } = launch()
    const log = await session.started()
    log.emit('session.failed', {
      reason: 'error',
      message: 'The connection to AWS IoT Core dropped.',
      exit_code: 3,
    })
    log.emit('session.ended', {
      exit_code: 3,
      restore: { restored: 0, unchanged: 0, skipped: 0, missing: 0, failed: 1 },
      kept: false,
    })
    const { result, human } = await promise
    expect(result).toMatchObject({
      status: 'error',
      reason: 'restore_incomplete',
      session_id: SESSION,
      state: 'failed',
      next: [
        { command: 'serverless dev restore --stage dev --region us-east-1' },
      ],
    })
    expect(exitCodeOf(result)).toBe(3)
    expect(human).toContain(
      'Run "serverless dev restore --stage dev --region us-east-1"',
    )
  })

  test('a session process that ends first is detach_failed, with the end of its log', async () => {
    const { service, child, spawn, promise } = launch()
    await until(() => spawn.mock.calls.length > 0)
    // What the process wrote, to its own log file until it would have held the directory.
    fs.appendFileSync(
      ownLogOf(service),
      'Dev Mode · orders · stage dev · us-east-1\r\nYou must sign in or use a license key\n',
    )
    child.emit('exit', 1, null)
    const { result, human } = await promise
    expect(result).toMatchObject({
      status: 'error',
      reason: 'detach_failed',
      message: `The Dev Mode session process ended before it was ready (exit code 1). Its output is in .serverless/dev/session.log.${process.pid}.tmp.`,
      log_file: `.serverless/dev/session.log.${process.pid}.tmp`,
    })
    expect(result).not.toHaveProperty('session_id')
    expect(human).toContain('You must sign in or use a license key')
    expect(human).not.toContain('\r')
  })

  test('a session process that cannot write its record is detach_failed, with the end of its log', async () => {
    const { service, child, spawn, promise } = launch()
    await until(() => spawn.mock.calls.length > 0)
    fs.appendFileSync(
      ownLogOf(service),
      'Dev Mode could not write its session record in .serverless/dev (ENOSPC: no space left on device).\n',
    )
    child.emit('exit', 1, null)
    const { result, human } = await promise
    expect(result).toMatchObject({
      status: 'error',
      reason: 'detach_failed',
      log_file: `.serverless/dev/session.log.${process.pid}.tmp`,
    })
    expect(exitCodeOf(result)).toBe(1)
    expect(human).toContain(
      'Dev Mode could not write its session record in .serverless/dev (ENOSPC: no space left on device).',
    )
  })

  test('a session process that cannot be started is detach_failed', async () => {
    const { child, spawn, promise } = launch()
    await until(() => spawn.mock.calls.length > 0)
    child.emit('error', new Error('spawn ENOENT'))
    expect((await promise).result).toMatchObject({
      status: 'error',
      reason: 'detach_failed',
      message: 'Dev Mode could not start its session process (spawn ENOENT).',
    })
  })

  test('a spawn that fails (no pid, then an error) is detach_failed at once, with no timer left', async () => {
    // As Node.js reports a bad cwd, EAGAIN or ENOENT: no pid, and 'error' on the next tick.
    const child = Object.assign(new EventEmitter(), { unref: jest.fn() })
    const run = launch({
      child,
      deps: {
        spawn: jest.fn(() => {
          process.nextTick(() =>
            child.emit('error', new Error('spawn /usr/local/bin/node ENOENT')),
          )
          return child
        }),
      },
    })
    const started = Date.now()
    const { result, timersLeft } = await run.promise
    expect(result).toMatchObject({
      status: 'error',
      reason: 'detach_failed',
      message:
        'Dev Mode could not start its session process (spawn /usr/local/bin/node ENOENT).',
    })
    expect(result).not.toHaveProperty('session_id')
    expect(Date.now() - started).toBeLessThan(2_000)
    expect(timersLeft).toBe(0)
  })

  test('a real spawn into a directory that does not exist is detach_failed at once', async () => {
    const run = launch({
      deps: {
        spawn: realSpawn,
        execPath: process.execPath,
        cwd: path.join(os.tmpdir(), `sls-dev-t-missing-${process.pid}-x`),
      },
    })
    const started = Date.now()
    const { result, timersLeft } = await run.promise
    expect(result).toMatchObject({
      status: 'error',
      reason: 'detach_failed',
      message: expect.stringMatching(
        /^Dev Mode could not start its session process \(.*ENOENT.*\)\.$/,
      ),
    })
    expect(Date.now() - started).toBeLessThan(2_000)
    expect(timersLeft).toBe(0)
  })

  test('a spawn that throws is detach_failed', async () => {
    const run = launch({
      deps: {
        spawn: () => {
          throw new Error('spawn EAGAIN')
        },
      },
    })
    const { result, timersLeft } = await run.promise
    expect(result).toMatchObject({
      status: 'error',
      reason: 'detach_failed',
      message: 'Dev Mode could not start its session process (spawn EAGAIN).',
    })
    expect(exitCodeOf(result)).toBe(1)
    expect(timersLeft).toBe(0)
    // Nothing ran: no log is kept, and none is named.
    expect(result).not.toHaveProperty('log_file')
    expect(fs.readdirSync(devDirOf(run.service)).filter(isOwnLog)).toEqual([])
  })

  test('a spawn that fails on the next tick keeps no log and names none', async () => {
    const child = Object.assign(new EventEmitter(), { unref: jest.fn() })
    const run = launch({
      child,
      deps: {
        spawn: jest.fn(() => {
          process.nextTick(() => child.emit('error', new Error('spawn ENOENT')))
          return child
        }),
      },
    })
    const { result } = await run.promise
    expect(result).toMatchObject({ reason: 'detach_failed' })
    expect(result).not.toHaveProperty('log_file')
    expect(fs.readdirSync(devDirOf(run.service)).filter(isOwnLog)).toEqual([])
  })

  test('a start that times out before its process holds the directory keeps its own log and names it', async () => {
    const run = launch({ deps: { waitMs: 300 } })
    await until(() => fs.existsSync(devDirOf(run.service)))
    const logFile = path.join(devDirOf(run.service), 'session.log')
    fs.writeFileSync(logFile, 'the last session\n')
    fs.appendFileSync(ownLogOf(run.service), 'still starting\n')
    const { result } = await run.promise
    expect(result).toMatchObject({
      status: 'timeout',
      log_file: `.serverless/dev/session.log.${process.pid}.tmp`,
    })
    expect(fs.readFileSync(logFile, 'utf8')).toBe('the last session\n')
    expect(fs.readFileSync(ownLogOf(run.service), 'utf8')).toBe(
      'still starting\n',
    )
  })

  test('a .serverless/dev that is a link is refused: nothing starts and nothing is written through it', async () => {
    const service = fs.mkdtempSync(path.join(os.tmpdir(), 'sls-dev-t-'))
    const target = fs.mkdtempSync(path.join(os.tmpdir(), 'sls-dev-t-'))
    dirs.push(service, target)
    fs.mkdirSync(path.join(service, '.serverless'))
    fs.symlinkSync(target, devDirOf(service), 'junction')
    const { spawn, promise } = launch({ service })
    const { result } = await promise
    expect(result).toMatchObject({ status: 'error' })
    expect(result.message).toContain('not a directory')
    expect(spawn).not.toHaveBeenCalled()
    expect(fs.readdirSync(target)).toEqual([])
  })

  test('a start removes the own logs of starts whose process is gone, never of one that runs', async () => {
    const DEAD = 999_991
    const LIVE = 999_992
    const service = fs.mkdtempSync(path.join(os.tmpdir(), 'sls-dev-t-'))
    dirs.push(service)
    fs.mkdirSync(devDirOf(service), { recursive: true })
    for (const pid of [DEAD, LIVE]) {
      fs.writeFileSync(
        path.join(devDirOf(service), `session.log.${pid}.tmp`),
        'x',
      )
    }
    const run = launch({
      service,
      deps: { isAlive: (pid) => pid !== DEAD },
    })
    await until(() => run.spawn.mock.calls.length > 0)
    run.child.emit('exit', 1, null)
    await run.promise
    const left = fs.readdirSync(devDirOf(service)).filter(isOwnLog).sort()
    expect(left).toEqual(
      [`session.log.${LIVE}.tmp`, `session.log.${process.pid}.tmp`].sort(),
    )
  })

  test('a session whose endpoint answers health but not status is checked again, not reported as running', async () => {
    const run = launch({
      deps: {
        connect: async () => ({
          record: sessionRecord({ state: 'on' }),
          status: async () => ({ status: 500, body: { error: 'internal' } }),
        }),
      },
    })
    // Nothing here is live once health-checked again: a new session process starts.
    await until(() => run.spawn.mock.calls.length > 0)
    run.child.emit('exit', 1, null)
    expect((await run.promise).result).toMatchObject({
      reason: 'detach_failed',
    })
  })

  test('the session process gets no debugger flag, from its arguments or NODE_OPTIONS', async () => {
    const run = launch({
      deps: {
        execArgv: [
          '--inspect-brk-node',
          '--inspect-port',
          '9230',
          '--inspect-wait=0',
          '--no-warnings',
        ],
        env: {
          PATH: '/usr/bin',
          NODE_OPTIONS:
            '--max-old-space-size=4096 --inspect=9229 --inspect-port 9231',
        },
      },
    })
    await until(() => run.spawn.mock.calls.length > 0)
    run.child.emit('exit', 1, null)
    await run.promise
    const [, args, spawnOptions] = run.spawn.mock.calls[0]
    expect(args.slice(0, 2)).toEqual(['--no-warnings', '/opt/sf-core.js'])
    expect(spawnOptions.env).toEqual({
      PATH: '/usr/bin',
      NODE_OPTIONS: '--max-old-space-size=4096',
      SLS_DEV_SESSION_LOG: `session.log.${process.pid}.tmp`,
    })

    const only = launch({
      deps: { env: { PATH: '/usr/bin', NODE_OPTIONS: '--inspect' } },
    })
    await until(() => only.spawn.mock.calls.length > 0)
    only.child.emit('exit', 1, null)
    await only.promise
    expect(only.spawn.mock.calls[0][2].env).toEqual({
      PATH: '/usr/bin',
      SLS_DEV_SESSION_LOG: `session.log.${process.pid}.tmp`,
    })
  })

  test('a start that lost a race to another one leaves that session its log', async () => {
    const { service, child, spawn, live, promise } = launch()
    await until(() => spawn.mock.calls.length > 0)
    const logFile = path.join(devDirOf(service), 'session.log')
    // The other start's process holds the directory and writes its log.
    fs.writeFileSync(logFile, 'the session that holds this directory\n')
    fs.appendFileSync(ownLogOf(service), 'Dev Mode is already on here\n')
    live.client = clientOf(
      sessionRecord({ state: 'on', session_id: 's_aaaaaaaaaaaa', pid: 777 }),
      { state: 'on', functions: FUNCTIONS },
    )
    child.emit('exit', 0, null)
    expect((await promise).result).toMatchObject({ already_running: true })
    expect(fs.readFileSync(logFile, 'utf8')).toBe(
      'the session that holds this directory\n',
    )
    expect(fs.readdirSync(devDirOf(service)).filter(isOwnLog)).toEqual([])
  })

  test('once the session process holds the directory, its log is session.log', async () => {
    const { session, promise } = launch({ deps: { waitMs: 1_000 } })
    await session.started()
    const { result } = await promise
    expect(result).toMatchObject({
      status: 'timeout',
      session_id: SESSION,
      log_file: '.serverless/dev/session.log',
    })
  })

  test('a session process that found another start in the meantime gives already_running', async () => {
    const { child, spawn, live, promise } = launch()
    await until(() => spawn.mock.calls.length > 0)
    live.client = clientOf(
      sessionRecord({ state: 'on', session_id: 's_aaaaaaaaaaaa', pid: 777 }),
      {
        state: 'on',
        functions: FUNCTIONS,
      },
    )
    child.emit('exit', 0, null)
    expect((await promise).result).toMatchObject({
      already_running: true,
      session_id: 's_aaaaaaaaaaaa',
    })
  })

  test('no ready within the wait is a timeout (124); the session goes on starting', async () => {
    const { session, promise } = launch({ deps: { waitMs: 1_000 } })
    await session.started()
    const { result, human, timersLeft } = await promise
    expect(result).toMatchObject({
      status: 'timeout',
      reason: 'timeout',
      session_id: SESSION,
      pid: CHILD_PID,
      state: 'starting',
      next: [
        { command: 'serverless dev wait --for ready' },
        { command: 'serverless dev stop' },
      ],
    })
    expect(exitCodeOf(result)).toBe(124)
    // Where its output goes, which says why it is still starting.
    expect(human).toEqual([
      [
        'notice',
        'Dev Mode is still starting after 1s; it goes on in the background.',
      ],
      ['blankLine'],
      [
        'aside',
        'Events: .serverless/dev/session.ndjson · output: .serverless/dev/session.log',
      ],
      [
        'aside',
        'Next: "serverless dev wait --for ready" waits until it is ready; "serverless dev stop" restores your functions and ends the session.',
      ],
    ])
    expect(timersLeft).toBe(0)
  })

  test('--approve without a terminal is approval_needs_terminal; nothing is planned or started', async () => {
    const plan = jest.fn()
    const run = launch({ options: { approve: true }, deps: { plan } })
    const { result } = await run.promise
    expect(result).toMatchObject({
      status: 'action_required',
      reason: 'approval_needs_terminal',
      user_action_required: true,
    })
    expect(exitCodeOf(result)).toBe(1)
    expect(plan).not.toHaveBeenCalled()
    expect(run.spawn).not.toHaveBeenCalled()
  })

  test('--approve on a terminal shows the plan and asks; no starts nothing, yes starts it without --approve', async () => {
    const planned = {
      service: 'orders',
      stage: 'dev',
      region: 'us-east-1',
      plan: null,
      rows: [],
      preflight: [
        { check: 'stage', ok: true, message: 'stage "dev" can use Dev Mode' },
      ],
    }
    const declined = launch({
      options: { approve: true },
      interactive: true,
      deps: { plan: async () => planned, confirm: async () => false },
    })
    const { result: declinedResult } = await declined.promise
    expect(declinedResult).toEqual({
      v: 1,
      status: 'ok',
      state: 'off',
      message: 'Nothing was changed.',
    })
    expect(declined.logger.text()).toContain(
      'Dev Mode dry run for "orders" on stage "dev"',
    )
    expect(declined.spawn).not.toHaveBeenCalled()

    const approved = launch({
      options: { approve: true },
      interactive: true,
      deps: { plan: async () => planned, confirm: async () => true },
    })
    await until(() => approved.spawn.mock.calls.length > 0)
    expect(approved.spawn.mock.calls[0][1]).not.toContain('--approve')
    approved.child.emit('exit', 1, null)
    await approved.promise
  })

  test('--approve with a failing check does not ask', async () => {
    const confirm = jest.fn()
    const run = launch({
      options: { approve: true },
      interactive: true,
      deps: {
        confirm,
        plan: async () => ({
          service: 'orders',
          stage: 'prod',
          region: 'us-east-1',
          plan: null,
          rows: [],
          preflight: [
            {
              check: 'stage',
              ok: false,
              reason: 'stage_protected',
              message: 'no',
            },
          ],
        }),
      },
    })
    expect((await run.promise).result).toMatchObject({
      status: 'error',
      reason: 'stage_protected',
    })
    expect(confirm).not.toHaveBeenCalled()
    expect(run.spawn).not.toHaveBeenCalled()
  })

  test('an unexpected error is an error result with exit 1, never ok', async () => {
    const run = launch({
      deps: {
        connect: async () => {
          throw new Error('the disk is gone')
        },
      },
    })
    const { result } = await run.promise
    expect(result).toMatchObject({
      status: 'error',
      reason: 'error',
      message: 'the disk is gone',
    })
    expect(exitCodeOf(result)).toBe(1)
  })
})

describe('the session process arguments', () => {
  test('drop --detach, --json and --approve in every form, and add --session-process once', () => {
    expect(
      sessionProcessArgs([
        'dev',
        '--detach',
        '--json=true',
        '--approve',
        '--stage',
        'dev',
        '--function',
        'api',
        '--idle-timeout',
        '30m',
        '--session-process',
        '--detach=true',
      ]),
    ).toEqual([
      'dev',
      '--stage',
      'dev',
      '--function',
      'api',
      '--idle-timeout',
      '30m',
      '--session-process',
    ])
  })

  test('drop an explicit true or false given after --json, --detach or --approve', () => {
    expect(
      sessionProcessArgs([
        'dev',
        '--json',
        'true',
        '--detach',
        'false',
        '--approve',
        'true',
        '--session-process',
        'true',
        '--stage',
        'dev',
      ]),
    ).toEqual(['dev', '--stage', 'dev', '--session-process'])
  })
})
