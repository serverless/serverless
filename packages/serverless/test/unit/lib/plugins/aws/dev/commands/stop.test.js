import { afterEach, describe, expect, test } from '@jest/globals'
import fs from 'fs'
import net from 'net'
import os from 'os'
import path from 'path'
import {
  STOP_WAIT_MS,
  runDevStop,
} from '../../../../../../../lib/plugins/aws/dev/commands/stop.js'
import {
  jsonRequested,
  printResult,
} from '../../../../../../../lib/plugins/aws/dev/commands/envelope.js'
import { openEventLog } from '../../../../../../../lib/plugins/aws/dev/state/events.js'
import {
  claimSession,
  writeToken,
} from '../../../../../../../lib/plugins/aws/dev/state/session-file.js'
import { openSessionControl } from '../../../../../../../lib/plugins/aws/dev/control/server.js'
import { runnable } from './runnable.js'
import {
  countingTimers,
  fakeLog,
  recordingProgress,
  testSessionId,
} from '../attach/fakes.js'

const dirs = []
const cleanups = []
afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup()
  for (const dir of dirs.splice(0))
    fs.rmSync(dir, { recursive: true, force: true })
})
const serviceDir = () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sls-dev-t-'))
  dirs.push(dir)
  return dir
}
const devDir = (dir) => path.join(dir, '.serverless', 'dev')
const SESSION = testSessionId(1)
/** The restore that names the stand-in session's stage and region. */
const RESTORE = 'serverless dev restore --stage alice --region eu-west-1'
/** A loopback port nothing listens on: bound once, then closed. */
const closedPort = async () => {
  const server = net.createServer()
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address()
  await new Promise((resolve) => server.close(resolve))
  return port
}
const stdout = () => ({
  written: [],
  write(text) {
    this.written.push(text)
  },
})

/**
 * A stand-in session: its session file, event log and control endpoint. `endpoint` is 'open' (it
 * answers), 'stale' (the file names an address nothing listens on) or 'none' (a session still
 * starting: `control: null` until `open()`). Its pid is a process that runs and is not this one.
 * `onStop({ log, claim, keep })` runs when a stop arrives (by the endpoint, or by `signal()`).
 */
const fakeSession = async (
  dir,
  {
    endpoint = 'open',
    onStop,
    pid = process.ppid,
    state = endpoint === 'none' ? 'starting' : 'on',
    startedAt = new Date().toISOString(),
    extra = {},
  } = {},
) => {
  const claim = await claimSession({
    dir: devDir(dir),
    record: {
      v: 1,
      session_id: SESSION,
      pid,
      state,
      // A personal stage in another region: what `dev restore` must be told, it does not assume.
      stage: 'alice',
      region: 'eu-west-1',
      started_at: startedAt,
      control: null,
      ...extra,
    },
  })
  const log = openEventLog({ dir: devDir(dir), sessionId: SESSION })
  log.emit('session.starting', {})
  if (endpoint !== 'none') log.emit('session.ready', {})
  const stops = []
  const stop = (body) => {
    stops.push(body)
    setImmediate(() => onStop?.({ log, claim, keep: body.keep }))
  }
  const open = async () => {
    const server = await openSessionControl({
      dir: devDir(dir),
      sessionFile: claim,
      sessionId: SESSION,
      handlers: {
        health: () => ({ state: 'on' }),
        status: () => ({}),
        stop,
        replay: () => ({}),
        touch() {},
      },
    })
    cleanups.push(() => server.close())
  }
  if (endpoint === 'open') await open()
  if (endpoint === 'stale') {
    // An endpoint that does not answer: its address is a port nothing listens on.
    writeToken({ dir: devDir(dir), token: 'e'.repeat(64) })
    claim.update({
      control: {
        url: `http://127.0.0.1:${await closedPort()}`,
        token_file: 'control.token',
      },
    })
  }
  cleanups.push(() => log.close())
  return { claim, log, stops, open, signal: (keep = false) => stop({ keep }) }
}
const ends =
  ({
    restore = { restored: 2 },
    webApps,
    kept = false,
    exitCode = 0,
    failed,
  } = {}) =>
  ({ log, claim }) => {
    if (failed) log.emit('session.failed', { ...failed, exit_code: exitCode })
    log.emit('session.stopping', { trigger: 'stop_command' })
    log.emit('session.ended', {
      exit_code: exitCode,
      restore: {
        restored: 0,
        unchanged: 0,
        skipped: 0,
        missing: 0,
        failed: 0,
        ...restore,
      },
      ...(webApps && { web_apps: webApps }),
      kept,
    })
    log.close()
    claim.release()
  }
/** Runs the command and prints its result as the finite-command helper of index.js does. */
const run = async (dir, { options = { json: true }, deps = {} } = {}) => {
  const out = stdout()
  const logger = fakeLog()
  const timers = countingTimers()
  const kills = []
  const { result, human } = await runDevStop({
    serviceDir: dir,
    options,
    logger,
    deps: {
      timers,
      pollMs: 10,
      kill: (pid, signal) => kills.push([pid, signal]),
      // What it waits for is the spinner's text, kept in the logger's lines.
      progress: recordingProgress(logger),
      ...deps,
    },
  })
  const code = printResult({
    json: jsonRequested(options),
    result,
    human,
    logger,
    stdout: out,
  })
  return {
    code,
    result: out.written.length ? JSON.parse(out.written.join('')) : null,
    text: logger.text(),
    kills,
    timers,
  }
}

describe('dev stop', () => {
  test('stop goes through the control endpoint and returns after the restore', async () => {
    const dir = serviceDir()
    const session = await fakeSession(dir, { onStop: ends() })
    const { code, result, text, kills, timers } = await run(dir)
    expect(code).toBe(0)
    expect(session.stops).toEqual([{ keep: false }])
    expect(kills).toEqual([])
    expect(result).toEqual({
      v: 1,
      status: 'ok',
      message: 'Dev Mode off · 2 functions restored.',
      cursor: `${SESSION}:4`,
      restore: { restored: 2, unchanged: 0, skipped: 0, missing: 0, failed: 0 },
      kept: false,
      exit_code: 0,
    })
    // The session's own line; the --json message keeps its text.
    expect(text).toContain('Dev Mode off · 2 functions restored')
    expect(text).not.toContain('restored.')
    expect(timers.live()).toBe(0)
  })

  test('web apps a session restored are named as web apps, not counted as functions', async () => {
    const dir = serviceDir()
    // `restore` counts the functions and the web apps; `web_apps` the web apps alone.
    await fakeSession(dir, {
      onStop: ends({
        restore: { restored: 3 },
        webApps: {
          restored: 2,
          unchanged: 0,
          skipped: 0,
          missing: 0,
          failed: 0,
        },
      }),
    })
    const { code, result, text } = await run(dir)
    expect(code).toBe(0)
    expect(result).toMatchObject({
      status: 'ok',
      message: 'Dev Mode off · 1 function and 2 web apps restored.',
      restore: { restored: 3 },
      web_apps: { restored: 2, failed: 0 },
    })
    expect(text).toContain('Dev Mode off · 1 function and 2 web apps restored')
    expect(text).not.toContain('3 functions')
  })

  test('a web app that could not be restored is named as a web app', async () => {
    const dir = serviceDir()
    await fakeSession(dir, {
      onStop: ends({
        restore: { restored: 1, failed: 1 },
        webApps: {
          restored: 0,
          unchanged: 0,
          skipped: 0,
          missing: 0,
          failed: 1,
        },
        exitCode: 3,
      }),
    })
    const { result } = await run(dir)
    expect(result).toMatchObject({
      status: 'error',
      reason: 'restore_incomplete',
      message: 'Dev Mode stopped, but 1 web app could not be restored.',
    })
  })

  test('a session that had nothing to restore ends with the line the session prints', async () => {
    const dir = serviceDir()
    await fakeSession(dir, { onStop: ends({ restore: { restored: 0 } }) })
    const { result, text } = await run(dir)
    expect(result).toMatchObject({
      status: 'ok',
      message: 'Dev Mode off · 0 functions restored.',
    })
    expect(text).toContain('Dev Mode off · nothing to restore')
    expect(text).not.toContain('0 functions')
  })

  test('--keep asks the session to leave its functions in Dev Mode', async () => {
    const dir = serviceDir()
    const session = await fakeSession(dir, {
      onStop: ends({ restore: {}, kept: true }),
    })
    const { code, result, text } = await run(dir, {
      options: { json: true, keep: true },
    })
    expect(session.stops).toEqual([{ keep: true }])
    expect(code).toBe(0)
    expect(result).toMatchObject({
      kept: true,
      message: 'Dev Mode stopped and left its functions in Dev Mode.',
    })
    expect(text).toContain('Stopping Dev Mode (functions stay in Dev Mode)')
    expect(text).not.toMatch(/restor/i)
  })

  test('--keep of a session of web apps alone names its web apps', async () => {
    const dir = serviceDir()
    const session = await fakeSession(dir, {
      onStop: ends({ restore: {}, webApps: {}, kept: true }),
    })
    session.log.emit('web_app.mode', { web_app: 'web', mode: 'dev' })
    const { result, text } = await run(dir, {
      options: { json: true, keep: true },
    })
    expect(result).toMatchObject({
      kept: true,
      message: 'Dev Mode stopped and left its web apps in Dev Mode.',
    })
    expect(text).toContain('Stopping Dev Mode (web apps stay in Dev Mode)')
  })

  test('how the session ended decides the result', async () => {
    const endsWith = async (ending, options) => {
      const dir = serviceDir()
      await fakeSession(dir, { onStop: ends(ending) })
      return run(dir, { options })
    }
    // Ended with an error after its start failed: the reason of its failure.
    const expired = await endsWith({
      restore: {},
      exitCode: 1,
      failed: {
        reason: 'credentials_expired',
        message: 'Your AWS credentials have expired.',
      },
    })
    expect(expired.code).toBe(1)
    expect(expired.result).toMatchObject({
      status: 'action_required',
      reason: 'credentials_expired',
      message: 'Your AWS credentials have expired.',
      user_action_required: true,
      exit_code: 1,
    })
    // Ended with an error and no recorded failure.
    const plain = await endsWith({ restore: { restored: 2 }, exitCode: 1 })
    expect(plain.code).toBe(1)
    expect(plain.result).toMatchObject({
      status: 'error',
      reason: 'error',
      exit_code: 1,
    })
    // Kept, with a function that could not be attached at the start: nothing was restored.
    const keptIncomplete = await endsWith(
      { restore: {}, kept: true, exitCode: 3 },
      { json: true, keep: true },
    )
    expect(keptIncomplete.code).toBe(3)
    expect(keptIncomplete.result).toMatchObject({
      reason: 'attach_incomplete',
      kept: true,
    })
    expect(keptIncomplete.result.message).not.toMatch(/restored/)
  })

  test('an incomplete restore exits 3 with restore as next', async () => {
    const dir = serviceDir()
    await fakeSession(dir, {
      onStop: ends({ restore: { restored: 1, failed: 1 }, exitCode: 3 }),
    })
    const { code, result } = await run(dir)
    expect(code).toBe(3)
    expect(result).toMatchObject({
      status: 'error',
      reason: 'restore_incomplete',
      exit_code: 3,
      next: [{ command: RESTORE, when: expect.any(String) }],
    })
    // An agent runs a next step with --json added: the restore takes it too.
    expect(runnable(`${result.next[0].command} --json`)).toEqual({
      command: 'dev restore',
      options: { stage: 'alice', region: 'eu-west-1', json: true },
    })
  })

  test('a session started with --aws-profile: the restore it suggests uses that profile', async () => {
    const dir = serviceDir()
    await fakeSession(dir, {
      endpoint: 'stale',
      extra: { aws_profile: 'sandbox' },
    })
    const { code, result } = await run(dir, { deps: { isAlive: () => false } })
    expect(code).toBe(3)
    expect(result.next).toEqual([
      {
        command: `${RESTORE} --aws-profile sandbox`,
        when: expect.any(String),
      },
    ])
  })

  test('without a session it exits 0: state off, with the last record of the last session', async () => {
    const empty = await run(serviceDir())
    expect(empty.code).toBe(0)
    expect(empty.result).toEqual({
      v: 1,
      status: 'ok',
      message: 'Dev Mode is not running here.',
      state: 'off',
      restore: { restored: 0, unchanged: 0, skipped: 0, missing: 0, failed: 0 },
      kept: false,
      exit_code: 0,
    })
    // After a session ended here: its log stays, its session file is gone.
    const dir = serviceDir()
    const session = await fakeSession(dir)
    ends()(session)
    const after = await run(dir)
    expect(after.code).toBe(0)
    expect(after.result).toMatchObject({
      state: 'off',
      message: 'Dev Mode is not running here.',
      cursor: `${SESSION}:4`,
    })
  })

  test('a session file whose process is gone without ending: exit 3, restore next', async () => {
    const dir = serviceDir()
    await fakeSession(dir, { endpoint: 'stale' })
    const { code, result } = await run(dir, { deps: { isAlive: () => false } })
    expect(code).toBe(3)
    expect(result).toMatchObject({
      reason: 'restore_incomplete',
      cursor: `${SESSION}:2`,
      next: [{ command: RESTORE }],
    })
  })

  test('a session process that dies without session.ended: exit 3, restore next', async () => {
    const dir = serviceDir()
    let alive = true
    await fakeSession(dir, {
      onStop: () => {
        alive = false
      },
    })
    const { code, result, timers } = await run(dir, {
      deps: { isAlive: () => alive },
    })
    expect(code).toBe(3)
    expect(result).toMatchObject({
      reason: 'restore_incomplete',
      next: [{ command: RESTORE }],
    })
    expect(timers.live()).toBe(0)
  })

  test('a session still stopping when the wait ends: exit 124', async () => {
    const dir = serviceDir()
    await fakeSession(dir)
    const { code, result, timers } = await run(dir, { deps: { waitMs: 100 } })
    expect(code).toBe(124)
    expect(result).toMatchObject({
      status: 'timeout',
      reason: 'timeout',
      cursor: `${SESSION}:2`,
    })
    expect(timers.live()).toBe(0)
    expect(STOP_WAIT_MS).toBe(7 * 60_000)
  })

  test('a session file whose endpoint does not answer is stale: exit 3, restore next, nothing signalled', async () => {
    const dir = serviceDir()
    await fakeSession(dir, { endpoint: 'stale' })
    const { code, result, kills } = await run(dir, {
      deps: { platform: 'linux' },
    })
    expect(kills).toEqual([])
    expect(code).toBe(3)
    expect(result).toMatchObject({
      status: 'error',
      reason: 'restore_incomplete',
      exit_code: null,
      next: [{ command: RESTORE }],
      cursor: `${SESSION}:2`,
      message: `The Dev Mode session here (pid ${process.ppid}) does not answer on its control endpoint: it is no longer running. Nothing was signalled. Run "${RESTORE}" to restore any function it left in Dev Mode.`,
    })
  })

  test('a session still starting is stopped through its endpoint once it opens', async () => {
    const dir = serviceDir()
    const session = await fakeSession(dir, { endpoint: 'none', onStop: ends() })
    // The session opens its endpoint while `dev stop` looks at its file: at the third read.
    let reads = 0
    let opened = null
    const watched = {
      ...fs,
      readFileSync(file, ...rest) {
        if (String(file).endsWith('session.json') && ++reads === 3) {
          opened = session.open()
        }
        return fs.readFileSync(file, ...rest)
      },
    }
    const { code, result, kills, timers } = await run(dir, {
      deps: { platform: 'linux', startWaitMs: 60_000, fs: watched },
    })
    await opened
    expect(opened).not.toBeNull()
    expect(kills).toEqual([])
    expect(session.stops).toEqual([{ keep: false }])
    expect(code).toBe(0)
    expect(result).toMatchObject({ status: 'ok', exit_code: 0 })
    expect(timers.live()).toBe(0)
  })

  test('a session still starting that never opens its endpoint: SIGTERM on Linux and macOS, never on Windows', async () => {
    const dir = serviceDir()
    const session = await fakeSession(dir, { endpoint: 'none' })
    const signalled = []
    const posix = await run(dir, {
      deps: {
        platform: 'linux',
        startWaitMs: 30,
        kill: (pid, signal) => {
          signalled.push([pid, signal])
          ends()(session)
        },
      },
    })
    expect(signalled).toEqual([[process.ppid, 'SIGTERM']])
    expect(posix.code).toBe(0)
    expect(posix.timers.live()).toBe(0)
    const other = serviceDir()
    await fakeSession(other, { endpoint: 'none' })
    const windows = await run(other, {
      deps: { platform: 'win32', startWaitMs: 30 },
    })
    expect(windows.kills).toEqual([])
    expect(windows.code).toBe(1)
    expect(windows.result).toMatchObject({
      reason: 'stop_failed',
      exit_code: null,
      next: [{ command: RESTORE }],
    })
    expect(windows.result.message).toContain(`and run "${RESTORE}".`)
    const keep = await run(other, {
      options: { json: true, keep: true },
      deps: { platform: 'linux', startWaitMs: 30 },
    })
    expect(keep.kills).toEqual([])
    expect(keep.result).toMatchObject({ reason: 'stop_failed' })
  })

  test.each([
    [
      'claimed long ago, still marked starting',
      { startedAt: new Date(Date.now() - 6 * 3_600_000).toISOString() },
    ],
    ['on, with no endpoint', { state: 'on' }],
  ])(
    'a record without an endpoint that is not starting (%s) is never signalled: exit 3, restore next',
    async (_, fields) => {
      const dir = serviceDir()
      await fakeSession(dir, { endpoint: 'none', ...fields })
      const { code, result, kills, timers } = await run(dir, {
        deps: { platform: 'linux', startWaitMs: 30 },
      })
      expect(kills).toEqual([])
      expect(code).toBe(3)
      expect(result).toMatchObject({
        status: 'error',
        reason: 'restore_incomplete',
        exit_code: null,
        next: [{ command: RESTORE }],
      })
      expect(result.message).toContain('Nothing was signalled')
      expect(timers.live()).toBe(0)
    },
  )

  test('a running session whose control endpoint could not open is never signalled: stop it where it runs', async () => {
    const dir = serviceDir()
    await fakeSession(dir, {
      endpoint: 'none',
      state: 'on',
      extra: { control_unavailable: true },
    })
    const { code, result, kills } = await run(dir, {
      deps: { platform: 'linux', startWaitMs: 30 },
    })
    expect(kills).toEqual([])
    expect(code).toBe(1)
    expect(result).toMatchObject({
      status: 'error',
      reason: 'stop_failed',
      next: [
        {
          command: RESTORE,
          when: 'after stopping that session with Ctrl+C in its terminal',
        },
      ],
    })
    expect(result.message).toContain('Ctrl+C')
    expect(result.message).toContain('Nothing was signalled')
    expect(runnable(`${result.next[0].command} --json`).options.json).toBe(true)
  })

  test('a session that stops counting as starting during the wait for its endpoint is not signalled', async () => {
    const dir = serviceDir()
    const startedAt = Date.parse('2026-10-05T10:40:00.000Z')
    const session = await fakeSession(dir, {
      endpoint: 'none',
      startedAt: new Date(startedAt).toISOString(),
    })
    // The first look is inside the start grace; by the time the wait for its endpoint ends, the
    // grace has passed.
    const looks = []
    const now = () => {
      looks.push(looks.length)
      return looks.length === 1 ? startedAt + 1_000 : startedAt + 61_000
    }
    const { code, result, kills } = await run(dir, {
      deps: { platform: 'linux', startWaitMs: 30, now },
    })
    expect(looks.length).toBeGreaterThanOrEqual(2)
    expect(kills).toEqual([])
    expect(code).toBe(3)
    expect(result).toMatchObject({ reason: 'restore_incomplete' })
    session.claim.release()
  })

  test.each(['1s', '1'])(
    '--timeout %p bounds the wait for a session still starting: exit 124, nothing signalled',
    async (timeout) => {
      const dir = serviceDir()
      await fakeSession(dir, { endpoint: 'none' })
      const { code, result, kills, timers } = await run(dir, {
        options: { json: true, timeout },
        deps: { platform: 'linux' },
      })
      expect(code).toBe(124)
      expect(kills).toEqual([])
      expect(result).toMatchObject({
        status: 'timeout',
        reason: 'timeout',
        message: `The Dev Mode session here (pid ${process.ppid}) is still starting after 1s; nothing was asked of it yet.`,
        exit_code: null,
        next: [{ command: 'serverless dev status' }],
      })
      expect(timers.live()).toBe(0)
    },
  )

  test('this process is never taken for the session: not signalled, not running', async () => {
    const dir = serviceDir()
    await fakeSession(dir, { endpoint: 'none', pid: process.pid })
    const { code, result, kills } = await run(dir, {
      deps: { platform: 'linux', startWaitMs: 30 },
    })
    expect(kills).toEqual([])
    expect(code).toBe(3)
    expect(result).toMatchObject({ reason: 'restore_incomplete' })
  })

  test('a session that ended cleanly while dev stop connected is reported as ended', async () => {
    const dir = serviceDir()
    const session = await fakeSession(dir)
    const { code, result, kills } = await run(dir, {
      deps: {
        platform: 'linux',
        // Between the first read of the session file and the connection, the session ends
        // (its last record written, its file removed): nothing answers any more.
        connect: async () => {
          ends()(session)
          return null
        },
      },
    })
    expect(kills).toEqual([])
    expect(code).toBe(0)
    expect(result).toMatchObject({
      status: 'ok',
      message: 'Dev Mode off · 2 functions restored.',
      exit_code: 0,
      cursor: `${SESSION}:4`,
    })
  })

  test('a session that wrote its end but not yet removed its file while dev stop connected is reported as ended', async () => {
    const dir = serviceDir()
    const session = await fakeSession(dir)
    const { code, result } = await run(dir, {
      deps: {
        platform: 'linux',
        connect: async () => {
          session.log.emit('session.stopping', { trigger: 'signal' })
          session.log.emit('session.ended', {
            exit_code: 0,
            restore: { restored: 2 },
            kept: false,
          })
          return null
        },
      },
    })
    expect(fs.existsSync(path.join(devDir(dir), 'session.json'))).toBe(true)
    expect(code).toBe(0)
    expect(result).toMatchObject({ status: 'ok', exit_code: 0 })
  })

  test('another session in the place once nothing answers is not stopped', async () => {
    const dir = serviceDir()
    const session = await fakeSession(dir)
    const file = path.join(devDir(dir), 'session.json')
    const { code, result, kills } = await run(dir, {
      deps: {
        platform: 'linux',
        connect: async () => {
          // The session ended and another one claimed the place before it wrote its end here.
          const record = JSON.parse(fs.readFileSync(file, 'utf8'))
          fs.writeFileSync(
            file,
            JSON.stringify({ ...record, session_id: 's_00000000000b' }),
          )
          return null
        },
      },
    })
    expect(kills).toEqual([])
    expect(code).toBe(1)
    expect(result).toMatchObject({
      status: 'error',
      reason: 'stop_failed',
      message: expect.stringContaining(
        `Another Dev Mode session (s_00000000000b) took the place of session ${SESSION}`,
      ),
    })
    expect(session.stops).toEqual([])
  })

  test('another session taking the place during the wait for a starting session is not stopped', async () => {
    const dir = serviceDir()
    await fakeSession(dir, { endpoint: 'none' })
    const file = path.join(devDir(dir), 'session.json')
    // At the third read, the file names another session (still starting too).
    let reads = 0
    const replaced = {
      ...fs,
      readFileSync(name, ...rest) {
        if (String(name) === file && ++reads === 3) {
          fs.writeFileSync(
            file,
            JSON.stringify({
              v: 1,
              session_id: testSessionId(2),
              pid: process.ppid,
              state: 'starting',
              stage: 'dev',
              region: 'us-east-1',
              control: null,
            }),
          )
        }
        return fs.readFileSync(name, ...rest)
      },
    }
    const { code, result, kills, timers } = await run(dir, {
      deps: { platform: 'linux', startWaitMs: 60_000, fs: replaced },
    })
    expect(reads).toBeGreaterThanOrEqual(3)
    expect(kills).toEqual([])
    expect(code).toBe(1)
    expect(result).toMatchObject({
      reason: 'stop_failed',
      exit_code: null,
      message: expect.stringContaining(testSessionId(2)),
    })
    expect(timers.live()).toBe(0)
  })

  test('another session answering than the one in the file is not stopped', async () => {
    const dir = serviceDir()
    await fakeSession(dir, { endpoint: 'stale' })
    let stopped = false
    const { code, result, kills } = await run(dir, {
      deps: {
        platform: 'linux',
        connect: async () => ({
          record: { session_id: testSessionId(2) },
          stop: async () => {
            stopped = true
            return { status: 202, body: { stopping: true } }
          },
        }),
      },
    })
    expect(stopped).toBe(false)
    expect(kills).toEqual([])
    expect(code).toBe(1)
    expect(result).toMatchObject({
      reason: 'stop_failed',
      message: expect.stringContaining(testSessionId(2)),
    })
  })

  test('a failure becomes an error result, exit 1', async () => {
    const dir = serviceDir()
    await fakeSession(dir)
    const { code, result } = await run(dir, {
      deps: {
        connect: async () => {
          throw new Error('boom')
        },
      },
    })
    expect(code).toBe(1)
    expect(result).toMatchObject({
      status: 'error',
      reason: 'error',
      message: 'boom',
    })
  })

  test('a malformed --timeout exits 1', async () => {
    const { code, result } = await run(serviceDir(), {
      options: { json: true, timeout: 'soon' },
    })
    expect(code).toBe(1)
    expect(result).toMatchObject({
      status: 'error',
      reason: 'invalid_option_value',
    })
  })
})
