import { afterEach, describe, expect, jest, test } from '@jest/globals'
import fs from 'fs'
import os from 'os'
import path from 'path'
import {
  TOUCH_INTERVAL_MS,
  WAIT_DEFAULT_MS,
  runDevWait,
} from '../../../../../../../lib/plugins/aws/dev/commands/wait.js'
import { exitCodeOf } from '../../../../../../../lib/plugins/aws/dev/commands/envelope.js'
import { openEventLog } from '../../../../../../../lib/plugins/aws/dev/state/events.js'
import { devDirOf } from '../../../../../../../lib/plugins/aws/dev/state/paths.js'
import { followRecords } from '../../../../../../../lib/plugins/aws/dev/state/read.js'
import { countingTimers, fakeLog, recordingProgress } from '../attach/fakes.js'
import { manualClock } from '../relay/manual-clock.js'
import { runnable } from './runnable.js'
import {
  resetCliNames,
  setCliNames,
} from '../../../../../../../lib/plugins/aws/dev/commands/cli-names.js'

const SESSION = 's_3f2a9c1e0b4d'
/**
 * The restore that names the session's stage and region (a personal stage in another region: what
 * `dev restore` must be told, it does not assume), and the line a person reads after an answer
 * whose next step it is.
 */
const RESTORE_COMMAND =
  'serverless dev restore --stage alice --region eu-west-1'
const RESTORE_LINE = `Run "${RESTORE_COMMAND}" to restore any function it left in Dev Mode.`
const OLD_SESSION = 's_000000aaaaaa'
const REQUEST = '3f2a9c1e-0000-4000-8000-000000000001'
const FILE = `.serverless/dev/invocations/createOrder/1759661067-${REQUEST}.json`

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
  for (const dir of dirs.splice(0))
    fs.rmSync(dir, { recursive: true, force: true })
})

const serviceDir = () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sls-dev-t-'))
  dirs.push(dir)
  return dir
}
const writeSession = (service, fields = {}) => {
  const dir = devDirOf(service)
  fs.mkdirSync(dir, { recursive: true })
  const record = {
    v: 1,
    session_id: SESSION,
    pid: 41234,
    state: 'on',
    service: 'orders',
    stage: 'alice',
    region: 'eu-west-1',
    owner: 'ana@laptop',
    selection: { only: [], skip: [] },
    detached: true,
    idle_timeout_s: 3600,
    // Claimed now: a record still starting counts only shortly after its start.
    started_at: new Date().toISOString(),
    ready_at: '2026-10-05T10:40:14.000Z',
    cli_version: '4.44.0',
    events_file: 'session.ndjson',
    log_file: 'session.log',
    control: { url: 'http://127.0.0.1:53121', token_file: 'control.token' },
    ...fields,
  }
  fs.writeFileSync(path.join(dir, 'session.json'), JSON.stringify(record))
  return record
}
const eventLog = (service, sessionId = SESSION) => {
  const log = openEventLog({
    dir: devDirOf(service),
    sessionId,
    now: () => Date.parse('2026-10-05T10:41:00.000Z'),
    fs,
  })
  logs.push(log)
  return log
}
const starting = (log) =>
  log.emit('session.starting', {
    service: 'orders',
    stage: 'alice',
    region: 'eu-west-1',
    owner: 'ana@laptop',
    pid: 41234,
    detached: true,
    selection: { only: [], skip: [] },
  })
const ready = (log) =>
  log.emit('session.ready', {
    functions: { dev: 2, deployed: 1, skipped: 0 },
    ready_ms: 12_000,
    attach_ms: 3_000,
  })
const invocationEnd = (log, fields = {}) =>
  log.emit('invocation.end', {
    function: 'createOrder',
    request_id: REQUEST,
    source: 'caller',
    outcome: 'ok',
    status_code: 200,
    duration_ms: 38,
    file: FILE,
    ...fields,
  })
const ended = (log) => {
  log.emit('session.stopping', { trigger: 'stop_command' })
  return log.emit('session.ended', {
    exit_code: 0,
    restore: { restored: 2, unchanged: 0, skipped: 0, missing: 0, failed: 0 },
    kept: false,
  })
}
const liveClient = (record) => ({
  record,
  touch: jest.fn(async () => {}),
})

/** One wait on counting timers; `timersLeft` is read when it settles. */
const wait = (service, options, deps = {}) => {
  const timers = countingTimers()
  const logger = fakeLog()
  const promise = runDevWait({
    serviceDir: service,
    options,
    logger,
    deps: {
      timers,
      isAlive: () => true,
      presenceMs: 25,
      // The waiting line is the spinner's: kept in the logger's lines.
      progress: recordingProgress(logger),
      ...deps,
    },
  })
  return {
    logger,
    promise: promise.then((outcome) => ({
      ...outcome,
      timersLeft: timers.live(),
    })),
  }
}
/** Resolves once the wait printed that it is waiting (its start position is fixed). */
const waiting = async (logger) => {
  while (!logger.text().includes('Waiting for')) {
    await new Promise((resolve) => setImmediate(resolve))
  }
}

describe('dev wait --for ready', () => {
  test('ready already reached returns at once', async () => {
    const service = serviceDir()
    const record = writeSession(service)
    const log = eventLog(service)
    starting(log)
    const { cursor } = ready(log)
    const follow = jest.fn()
    const { promise } = wait(
      service,
      { for: 'ready' },
      {
        follow,
        connect: async () => liveClient(record),
      },
    )
    const { result, human, timersLeft } = await promise
    expect(result).toMatchObject({
      v: 1,
      status: 'ok',
      cursor,
      event: { type: 'session.ready', session_id: SESSION, seq: 2 },
    })
    expect(exitCodeOf(result)).toBe(0)
    expect(human).toBe(
      `Dev Mode is on: 2 of 3 functions run on this machine (session ${SESSION}).`,
    )
    expect(follow).not.toHaveBeenCalled()
    expect(timersLeft).toBe(0)
  })

  test('a starting session is followed until it is ready, through the injected file system', async () => {
    const service = serviceDir()
    const record = writeSession(service, { state: 'starting', ready_at: null })
    const log = eventLog(service)
    starting(log)
    const follow = jest.fn((args) => followRecords(args))
    const { logger, promise } = wait(
      service,
      { for: 'ready' },
      {
        follow,
        fs,
        connect: async () => liveClient(record),
      },
    )
    await waiting(logger)
    const { cursor } = ready(log)
    const { result, timersLeft } = await promise
    expect(result).toMatchObject({
      status: 'ok',
      cursor,
      event: { type: 'session.ready' },
    })
    expect(follow).toHaveBeenCalledWith(expect.objectContaining({ fs }))
    expect(logger.text()).toContain(
      'Waiting for Dev Mode to be ready (up to 100s)',
    )
    expect(timersLeft).toBe(0)
  })

  test('a session still starting without a control endpoint is waited for', async () => {
    // The control endpoint does not listen yet (control: null); a live pid makes it a starting session.
    const service = serviceDir()
    writeSession(service, { state: 'starting', ready_at: null, control: null })
    const log = eventLog(service)
    starting(log)
    const { logger, promise } = wait(
      service,
      { for: 'ready' },
      {
        connect: async () => null,
      },
    )
    await waiting(logger)
    const { cursor } = ready(log)
    expect((await promise).result).toMatchObject({
      status: 'ok',
      cursor,
      event: { type: 'session.ready' },
    })
  })

  test('an old record without a control endpoint is stale even when its pid names a live process', async () => {
    const service = serviceDir()
    writeSession(service, {
      state: 'starting',
      ready_at: null,
      control: null,
      started_at: '2020-01-01T00:00:00.000Z',
    })
    const log = eventLog(service)
    starting(log)
    const { promise } = wait(
      service,
      { for: 'ready' },
      {
        connect: async () => null,
      },
    )
    expect((await promise).result).toMatchObject({
      status: 'error',
      reason: 'restore_incomplete',
      next: [{ command: RESTORE_COMMAND }],
    })
  })

  test('a session that failed to start is session_ended', async () => {
    const service = serviceDir()
    const record = writeSession(service, { state: 'starting' })
    const log = eventLog(service)
    starting(log)
    const { cursor } = log.emit('session.failed', {
      reason: 'nothing_to_attach',
      message: 'No function in this service can run in Dev Mode.',
      exit_code: 1,
    })
    const { promise } = wait(
      service,
      { for: 'ready' },
      {
        connect: async () => liveClient(record),
      },
    )
    const { result } = await promise
    expect(result).toMatchObject({
      status: 'error',
      reason: 'session_ended',
      cursor,
      event: { type: 'session.failed', reason: 'nothing_to_attach' },
    })
    expect(exitCodeOf(result)).toBe(1)
  })

  test('the next session is awaited even before it rotated the event file', async () => {
    const service = serviceDir()
    const old = eventLog(service, OLD_SESSION)
    starting(old)
    ready(old)
    ended(old)
    old.close()
    // The new session wrote session.json; its event log is not open yet.
    const record = writeSession(service, { state: 'starting' })
    const { logger, promise } = wait(
      service,
      { for: 'ready' },
      {
        connect: async () => liveClient(record),
      },
    )
    await waiting(logger)
    const log = eventLog(service)
    starting(log)
    ready(log)
    const { result } = await promise
    expect(result).toMatchObject({
      status: 'ok',
      event: { type: 'session.ready', session_id: SESSION, seq: 2 },
    })
  })

  test('a session stopped before it was ready is session_ended with its session.ended', async () => {
    const service = serviceDir()
    const record = writeSession(service, { state: 'stopping', ready_at: null })
    const log = eventLog(service)
    starting(log)
    const { cursor } = ended(log)
    const { result } = await wait(
      service,
      { for: 'ready' },
      {
        connect: async () => liveClient(record),
      },
    ).promise
    expect(result).toMatchObject({
      status: 'error',
      reason: 'session_ended',
      cursor,
      event: { type: 'session.ended', exit_code: 0 },
    })
    expect(exitCodeOf(result)).toBe(1)
  })

  test('state on whose ready record is not in the file yet waits for that record', async () => {
    const service = serviceDir()
    const record = writeSession(service)
    const log = eventLog(service)
    starting(log)
    const { logger, promise } = wait(
      service,
      { for: 'ready' },
      {
        connect: async () => liveClient(record),
      },
    )
    await waiting(logger)
    const { cursor } = ready(log)
    const { result } = await promise
    expect(result).toMatchObject({
      status: 'ok',
      cursor,
      event: { type: 'session.ready' },
    })
    expect(result.event).not.toBeNull()
  })
})

describe('dev wait --for invocation', () => {
  test('an invocation written before wait started is found by --after', async () => {
    const service = serviceDir()
    const record = writeSession(service)
    const log = eventLog(service)
    starting(log)
    const { cursor: after } = ready(log)
    log.emit('invocation.start', {
      function: 'createOrder',
      request_id: REQUEST,
      label: 'aws:apigateway:v2:post:/orders',
      new_worker: true,
      source: 'caller',
    })
    const { cursor } = invocationEnd(log)
    const follow = jest.fn()
    const { promise } = wait(
      service,
      { for: 'invocation', after },
      {
        follow,
        connect: async () => liveClient(record),
      },
    )
    const { result, human } = await promise
    expect(result).toMatchObject({
      status: 'ok',
      cursor,
      event: {
        type: 'invocation.end',
        seq: 4,
        request_id: REQUEST,
        file: FILE,
      },
    })
    expect(human).toBe(`createOrder · 3f2a9c1e · ok · 200 · 38 ms\n${FILE}`)
    expect(follow).not.toHaveBeenCalled()
  })

  test('--after finds it even when the session has ended since', async () => {
    const service = serviceDir()
    const log = eventLog(service)
    starting(log)
    const { cursor: after } = ready(log)
    const { cursor } = invocationEnd(log)
    ended(log)
    const { promise } = wait(
      service,
      { for: 'invocation', after },
      {
        connect: async () => null,
      },
    )
    expect((await promise).result).toMatchObject({
      status: 'ok',
      // The matched record's cursor, not the last one in the file: --after it skips nothing.
      cursor,
      event: { type: 'invocation.end', seq: 3 },
    })
  })

  test('without --after only an invocation after now matches', async () => {
    const service = serviceDir()
    const record = writeSession(service)
    const log = eventLog(service)
    starting(log)
    ready(log)
    invocationEnd(log, { request_id: 'aaaaaaaa-0000-4000-8000-000000000000' })
    const { logger, promise } = wait(
      service,
      { for: 'invocation' },
      {
        connect: async () => liveClient(record),
      },
    )
    await waiting(logger)
    const { seq, cursor } = invocationEnd(log)
    const { result } = await promise
    expect(result.event).toMatchObject({ seq, request_id: REQUEST })
    expect(result.cursor).toBe(cursor)
  })

  test('from a Compose root, the matched record and its line name the file from there', async () => {
    const service = serviceDir()
    setCliNames({
      serverless: {
        serviceDir: service,
        compose: { isWithinCompose: true, serviceName: 'consumer' },
      },
      cwd: path.dirname(service),
    })
    try {
      const record = writeSession(service)
      const log = eventLog(service)
      starting(log)
      const { cursor: after } = ready(log)
      invocationEnd(log)
      const { result, human } = await wait(
        service,
        { for: 'invocation', after },
        { connect: async () => liveClient(record) },
      ).promise
      const folder = path.basename(service)
      expect(result.event.file).toBe(`${folder}/${FILE}`)
      expect(human).toContain(`${folder}/${FILE}`)
      // The record on disk keeps its path relative to the service.
      expect(
        fs.readFileSync(path.join(devDirOf(service), 'session.ndjson'), 'utf8'),
      ).toContain(`"file":"${FILE}"`)
    } finally {
      resetCliNames()
    }
  })

  test('--function picks that function, and an error outcome still matches', async () => {
    const service = serviceDir()
    const record = writeSession(service)
    const log = eventLog(service)
    starting(log)
    const { cursor: after } = ready(log)
    invocationEnd(log, { function: 'listOrders' })
    const { logger, promise } = wait(
      service,
      { for: 'invocation', after, function: ['createOrder'] },
      {
        connect: async () => liveClient(record),
      },
    )
    await waiting(logger)
    expect(logger.text()).toContain(
      'Waiting for the next invocation of createOrder',
    )
    const { seq } = invocationEnd(log, {
      outcome: 'error',
      status_code: 502,
      error_type: 'TypeError',
    })
    const { result } = await promise
    expect(result.event).toMatchObject({
      seq,
      function: 'createOrder',
      outcome: 'error',
    })
    expect(exitCodeOf(result)).toBe(0)
  })

  test('a cursor from another session is refused', async () => {
    const service = serviceDir()
    const record = writeSession(service)
    const log = eventLog(service)
    starting(log)
    ready(log)
    invocationEnd(log)
    const follow = jest.fn()
    const { promise } = wait(
      service,
      { for: 'invocation', after: `${OLD_SESSION}:4` },
      { follow, connect: async () => liveClient(record) },
    )
    const { result } = await promise
    expect(result).toMatchObject({
      status: 'error',
      reason: 'cursor_from_other_session',
    })
    expect(result).not.toHaveProperty('event')
    expect(exitCodeOf(result)).toBe(1)
    expect(follow).not.toHaveBeenCalled()
  })

  test('a cursor of an unknown session says it is another session, not an earlier one', async () => {
    const service = serviceDir()
    const record = writeSession(service)
    const log = eventLog(service)
    starting(log)
    ready(log)
    const { result, human } = await wait(
      service,
      { for: 'invocation', after: `${OLD_SESSION}:4` },
      { connect: async () => liveClient(record) },
    ).promise
    expect(result.reason).toBe('cursor_from_other_session')
    expect(result.message).toBe(
      `The cursor ${OLD_SESSION}:4 belongs to another Dev Mode session, not to the session of orders running here. Take a cursor of this one from "serverless dev status --json".`,
    )
    expect(human).toBe(result.message)
  })

  test('a cursor of the session before this one here names its stage', async () => {
    const service = serviceDir()
    const old = eventLog(service, OLD_SESSION)
    old.emit('session.starting', {
      service: 'orders',
      stage: 'bob',
      region: 'eu-west-1',
      owner: 'ana@laptop',
      pid: 41000,
      detached: true,
      selection: { only: [], skip: [] },
    })
    old.close()
    const record = writeSession(service)
    const log = eventLog(service)
    starting(log)
    ready(log)
    const { result } = await wait(
      service,
      { for: 'invocation', after: `${OLD_SESSION}:1` },
      { connect: async () => liveClient(record) },
    ).promise
    expect(result.reason).toBe('cursor_from_other_session')
    expect(result.message).toBe(
      `The cursor ${OLD_SESSION}:1 belongs to an earlier Dev Mode session of orders (stage bob). Take a cursor of the current one from "serverless dev status --json".`,
    )
  })

  test.each(['nope', `${SESSION}:0`, `${SESSION}:x`, ':4'])(
    'a malformed cursor %p is refused',
    async (after) => {
      const service = serviceDir()
      starting(eventLog(service))
      const { result } = await wait(service, { for: 'invocation', after })
        .promise
      expect(result).toMatchObject({
        status: 'error',
        reason: 'invalid_cursor',
      })
      expect(exitCodeOf(result)).toBe(1)
    },
  )

  test('the session ending while waiting is session_ended', async () => {
    const service = serviceDir()
    const record = writeSession(service)
    const log = eventLog(service)
    starting(log)
    ready(log)
    const { logger, promise } = wait(
      service,
      { for: 'invocation' },
      {
        connect: async () => liveClient(record),
      },
    )
    await waiting(logger)
    const { cursor } = ended(log)
    const { result, timersLeft } = await promise
    expect(result).toMatchObject({
      status: 'error',
      reason: 'session_ended',
      cursor,
      event: { type: 'session.ended', exit_code: 0 },
    })
    expect(exitCodeOf(result)).toBe(1)
    expect(timersLeft).toBe(0)
  })

  test('a cursor of the last session, with a new one starting, is that session ending', async () => {
    const service = serviceDir()
    const old = eventLog(service, OLD_SESSION)
    starting(old)
    ready(old)
    const { cursor } = ended(old)
    old.close()
    // The new session wrote session.json; its event log is not open yet.
    const record = writeSession(service, { state: 'starting' })
    const follow = jest.fn()
    const { result } = await wait(
      service,
      { for: 'invocation', after: cursor },
      {
        follow,
        connect: async () => liveClient(record),
      },
    ).promise
    expect(result).toMatchObject({
      status: 'error',
      reason: 'session_ended',
      cursor,
      event: { type: 'session.ended', session_id: OLD_SESSION },
    })
    expect(follow).not.toHaveBeenCalled()
  })

  test('a session process that dies without a final record is restore_incomplete, exit 3, as dev stop says', async () => {
    const service = serviceDir()
    const record = writeSession(service)
    const log = eventLog(service)
    starting(log)
    const { cursor } = ready(log)
    let alive = true
    const { logger, promise } = wait(
      service,
      { for: 'invocation' },
      {
        isAlive: () => alive,
        connect: async () => liveClient(record),
      },
    )
    await waiting(logger)
    alive = false
    const { result, human, timersLeft } = await promise
    expect(human).toBe(
      'The Dev Mode session here (pid 41234) ended without restoring its functions.\n' +
        RESTORE_LINE,
    )
    expect(result).toMatchObject({
      status: 'error',
      reason: 'restore_incomplete',
      message:
        'The Dev Mode session here (pid 41234) ended without restoring its functions.',
      cursor,
      next: [{ command: RESTORE_COMMAND }],
    })
    expect(result).not.toHaveProperty('event')
    expect(exitCodeOf(result)).toBe(3)
    expect(timersLeft).toBe(0)
  })

  test('a session that ended and was followed by a new one is found in its renamed file', async () => {
    const service = serviceDir()
    const record = writeSession(service)
    const log = eventLog(service)
    starting(log)
    ready(log)
    // A follower that delivers nothing: only the last read after the process went can see the end.
    const quietFollow = ({ signal }) =>
      new Promise((resolve) => signal.addEventListener('abort', resolve))
    const { logger, promise } = wait(
      service,
      { for: 'invocation' },
      { follow: quietFollow, connect: async () => liveClient(record) },
    )
    await waiting(logger)
    const { cursor } = ended(log)
    log.close()
    // The next session renames this session's file and claims the directory.
    starting(eventLog(service, OLD_SESSION))
    writeSession(service, { session_id: OLD_SESSION, state: 'starting' })
    const { result, timersLeft } = await promise
    expect(result).toMatchObject({
      status: 'error',
      reason: 'session_ended',
      cursor,
      event: { type: 'session.ended', session_id: SESSION },
    })
    expect(timersLeft).toBe(0)
  })

  test('a cursor of neither the running session nor the last one is refused', async () => {
    const service = serviceDir()
    // A session starting: no event file yet.
    const record = writeSession(service, { state: 'starting' })
    const follow = jest.fn()
    const { result } = await wait(
      service,
      { for: 'invocation', after: `${OLD_SESSION}:4` },
      { follow, connect: async () => liveClient(record) },
    ).promise
    expect(result).toMatchObject({
      status: 'error',
      reason: 'cursor_from_other_session',
    })
    expect(follow).not.toHaveBeenCalled()
  })

  test('no session here is session_not_running', async () => {
    for (const kind of ['ready', 'invocation', 'reload', 'ended']) {
      const { result } = await wait(
        serviceDir(),
        { for: kind },
        {
          connect: async () => null,
        },
      ).promise
      expect(result).toMatchObject({
        status: 'error',
        reason: 'session_not_running',
        next: [{ command: 'serverless dev --detach' }],
      })
      expect(exitCodeOf(result)).toBe(1)
    }
  })
})

describe('dev wait --for reload and --for ended', () => {
  test('a reload matches on reload.end, also a failed one', async () => {
    const service = serviceDir()
    const record = writeSession(service)
    const log = eventLog(service)
    starting(log)
    const { cursor: after } = ready(log)
    log.emit('reload.start', { files: 1, functions: ['createOrder'] })
    log.emit('reload.end', {
      ok: false,
      functions: ['createOrder'],
      ms: 210,
      error: 'Build failed',
    })
    const { result, human } = await wait(
      service,
      { for: 'reload', after },
      {
        connect: async () => liveClient(record),
      },
    ).promise
    expect(result.event).toMatchObject({ type: 'reload.end', ok: false })
    expect(human).toBe('The reload failed: Build failed.')
  })

  test("ended returns the last session's session.ended when none is running", async () => {
    const service = serviceDir()
    const log = eventLog(service)
    starting(log)
    ready(log)
    const { cursor } = ended(log)
    const { result, human } = await wait(
      service,
      { for: 'ended' },
      {
        connect: async () => null,
      },
    ).promise
    expect(result).toMatchObject({
      status: 'ok',
      cursor,
      event: { type: 'session.ended', restore: { restored: 2, failed: 0 } },
    })
    expect(human).toBe('Dev Mode off (exit 0): 2 restored, 0 not restored.')
  })

  test('ended waits for a running session; a failed start ends with its session.failed', async () => {
    const service = serviceDir()
    const record = writeSession(service, { state: 'starting' })
    const log = eventLog(service)
    starting(log)
    const { logger, promise } = wait(
      service,
      { for: 'ended' },
      {
        connect: async () => liveClient(record),
      },
    )
    await waiting(logger)
    const { cursor } = log.emit('session.failed', {
      reason: 'nothing_to_attach',
      message: 'No function in this service can run in Dev Mode.',
      exit_code: 1,
    })
    log.emit('session.ended', {
      exit_code: 1,
      restore: { restored: 0, unchanged: 0, skipped: 0, missing: 0, failed: 0 },
      kept: false,
    })
    const { result, human } = await promise
    expect(result).toMatchObject({
      status: 'error',
      reason: 'nothing_to_attach',
      cursor,
      event: { type: 'session.failed', reason: 'nothing_to_attach' },
    })
    expect(exitCodeOf(result)).toBe(1)
    expect(human).toBe(
      'Dev Mode did not start: No function in this service can run in Dev Mode.',
    )
  })
})

describe('time limits, bad options and keeping the session in use', () => {
  // A follower that delivers nothing and ends when the wait ends.
  const quietFollow = ({ signal }) =>
    new Promise((resolve) => signal.addEventListener('abort', resolve))

  test('an open wait touches the session every 30 s and times out with exit 124', async () => {
    const service = serviceDir()
    const record = writeSession(service)
    const log = eventLog(service)
    starting(log)
    const { cursor } = ready(log)
    const clock = manualClock(Date.parse('2026-10-05T10:41:00Z'))
    const client = liveClient(record)
    const logger = fakeLog()
    const outcome = runDevWait({
      serviceDir: service,
      options: { for: 'invocation' },
      logger,
      deps: {
        progress: recordingProgress(logger),
        timers: clock.timers,
        follow: quietFollow,
        isAlive: () => true,
        connect: async () => client,
      },
    })
    // Its timers exist once it says it is waiting (the file reads before that may be asynchronous).
    await waiting(logger)
    await clock.advance(TOUCH_INTERVAL_MS)
    expect(client.touch).toHaveBeenCalledTimes(1)
    await clock.advance(TOUCH_INTERVAL_MS)
    expect(client.touch).toHaveBeenCalledTimes(2)
    await clock.advance(WAIT_DEFAULT_MS - 2 * TOUCH_INTERVAL_MS)
    const { result } = await outcome
    expect(result).toMatchObject({
      status: 'timeout',
      reason: 'timeout',
      cursor,
      next: [
        { command: `serverless dev wait --for invocation --after ${cursor}` },
      ],
    })
    expect(exitCodeOf(result)).toBe(124)
    expect(clock.live()).toBe(0)
  })

  test('a timeout before a new session wrote a record says how to keep waiting for the same thing', async () => {
    const service = serviceDir()
    const old = eventLog(service, OLD_SESSION)
    starting(old)
    ended(old)
    old.close()
    // The new session wrote session.json; its event log is not open yet.
    const record = writeSession(service, { state: 'starting' })
    const clock = manualClock(Date.parse('2026-10-05T10:41:00Z'))
    const logger = fakeLog()
    const outcome = runDevWait({
      serviceDir: service,
      options: { for: 'invocation', function: ['createOrder'], timeout: '5s' },
      logger,
      deps: {
        progress: recordingProgress(logger),
        timers: clock.timers,
        follow: quietFollow,
        isAlive: () => true,
        connect: async () => liveClient(record),
      },
    })
    await waiting(logger)
    await clock.advance(5_000)
    const { result } = await outcome
    // No cursor of the last session: the next wait would refuse it once this one writes.
    expect(result).not.toHaveProperty('cursor')
    expect(result).toMatchObject({
      status: 'timeout',
      message: 'Nothing matched within 5s; the session is still running.',
      next: [
        {
          command:
            'serverless dev wait --for invocation --function createOrder',
        },
      ],
    })
    expect(clock.live()).toBe(0)
  })

  test('--timeout takes a duration up to 1h, and --for is required', async () => {
    const service = serviceDir()
    for (const [options, message] of [
      [
        { for: 'invocation', timeout: '2h' },
        'Option "--timeout" can be at most 1h.',
      ],
      [
        { for: 'invocation', timeout: '3601' },
        'Option "--timeout" can be at most 1h.',
      ],
      [
        { for: 'invocation', timeout: 'soon' },
        'Option "--timeout" takes a duration such as 100 or 100s (seconds), 5m or 1h.',
      ],
      [{}, 'Option "--for" must be one of: ready, invocation, reload, ended.'],
      [
        { for: 'start' },
        'Option "--for" must be one of: ready, invocation, reload, ended.',
      ],
    ]) {
      const { result, human } = await wait(service, options).promise
      expect(result).toMatchObject({
        status: 'error',
        reason: 'invalid_option_value',
        message,
      })
      expect(human).toBe(message)
      expect(exitCodeOf(result)).toBe(1)
    }
  })

  test('an unexpected error is an error result with exit 1, never ok', async () => {
    const service = serviceDir()
    const record = writeSession(service)
    starting(eventLog(service))
    const { result } = await wait(
      service,
      { for: 'invocation', after: `${SESSION}:1` },
      {
        connect: async () => liveClient(record),
        read: () => {
          throw new Error('the disk is gone')
        },
      },
    ).promise
    expect(result).toMatchObject({
      status: 'error',
      reason: 'error',
      message: 'the disk is gone',
    })
    expect(exitCodeOf(result)).toBe(1)
  })
})

const endWith = (log, fields = {}) => {
  log.emit('session.stopping', { trigger: 'stop_command' })
  return log.emit('session.ended', {
    exit_code: 0,
    restore: { restored: 2, unchanged: 0, skipped: 0, missing: 0, failed: 0 },
    kept: false,
    ...fields,
  })
}

describe('dev wait --for ended with --after, and how an end is reported', () => {
  test('an end already after the cursor is returned at once, before asking any session', async () => {
    const service = serviceDir()
    const old = eventLog(service, OLD_SESSION)
    starting(old)
    const { cursor: after } = ready(old)
    const { cursor } = endWith(old)
    old.close()
    // A new session claimed the directory; its event log is not open yet.
    const record = writeSession(service, { state: 'starting' })
    const connect = jest.fn(async () => liveClient(record))
    const follow = jest.fn()
    const { result, human } = await wait(
      service,
      { for: 'ended', after },
      { connect, follow },
    ).promise
    expect(result).toMatchObject({
      status: 'ok',
      cursor,
      event: { type: 'session.ended', session_id: OLD_SESSION, exit_code: 0 },
    })
    expect(exitCodeOf(result)).toBe(0)
    expect(human).toBe('Dev Mode off (exit 0): 2 restored, 0 not restored.')
    expect(connect).not.toHaveBeenCalled()
    expect(follow).not.toHaveBeenCalled()
  })

  test('an end after the cursor that left functions in Dev Mode exits 3 with dev restore', async () => {
    const service = serviceDir()
    const log = eventLog(service)
    starting(log)
    const { cursor: after } = ready(log)
    const { cursor } = endWith(log, {
      exit_code: 3,
      restore: { restored: 1, unchanged: 0, skipped: 0, missing: 0, failed: 1 },
    })
    const { result, human } = await wait(service, { for: 'ended', after })
      .promise
    expect(human).toBe(
      'Dev Mode off (exit 3): 1 restored, 1 not restored.\n' + RESTORE_LINE,
    )
    expect(result).toMatchObject({
      status: 'error',
      reason: 'restore_incomplete',
      cursor,
      event: { type: 'session.ended', exit_code: 3 },
      next: [{ command: RESTORE_COMMAND }],
    })
    expect(exitCodeOf(result)).toBe(3)
    // An agent runs a next step with --json added: the restore takes it too.
    expect(runnable(`${result.next[0].command} --json`)).toEqual({
      command: 'dev restore',
      options: { stage: 'alice', region: 'eu-west-1', json: true },
    })
  })

  test('a failed start after the cursor ends with its session.failed', async () => {
    const service = serviceDir()
    const log = eventLog(service)
    const { cursor: after } = starting(log)
    const { cursor } = log.emit('session.failed', {
      reason: 'nothing_to_attach',
      message: 'No function in this service can run in Dev Mode.',
      exit_code: 1,
    })
    endWith(log, { exit_code: 1 })
    const { result } = await wait(service, { for: 'ended', after }).promise
    expect(result).toMatchObject({
      status: 'error',
      reason: 'nothing_to_attach',
      cursor,
      event: { type: 'session.failed' },
    })
    expect(exitCodeOf(result)).toBe(1)
  })

  test('with no session, an end that could not attach every function exits 3', async () => {
    const service = serviceDir()
    const log = eventLog(service)
    starting(log)
    ready(log)
    const { cursor } = endWith(log, { exit_code: 3 })
    const { result } = await wait(
      service,
      { for: 'ended' },
      { connect: async () => null },
    ).promise
    expect(result).toMatchObject({
      status: 'error',
      reason: 'attach_incomplete',
      cursor,
      event: { type: 'session.ended', exit_code: 3 },
    })
    expect(exitCodeOf(result)).toBe(3)
  })

  test('an end after the cursor stops a wait for an invocation with the same end record', async () => {
    const service = serviceDir()
    const log = eventLog(service)
    const { cursor: after } = starting(log)
    const { cursor } = log.emit('session.failed', {
      reason: 'nothing_to_attach',
      message: 'x',
      exit_code: 1,
    })
    endWith(log, { exit_code: 1 })
    const { result } = await wait(service, { for: 'invocation', after }).promise
    expect(result).toMatchObject({
      status: 'error',
      reason: 'session_ended',
      cursor,
      event: { type: 'session.failed' },
    })
  })
})

describe('a session file whose session does not answer', () => {
  test.each(['ready', 'invocation', 'reload', 'ended'])(
    '--for %s: an endpoint that does not answer is a stale session: exit 3 and dev restore',
    async (kind) => {
      const service = serviceDir()
      writeSession(service)
      const log = eventLog(service)
      starting(log)
      const { cursor } = ready(log)
      const follow = jest.fn()
      const { result, human } = await wait(
        service,
        { for: kind },
        { follow, connect: async () => null },
      ).promise
      expect(result).toMatchObject({
        status: 'error',
        reason: 'restore_incomplete',
        cursor,
        next: [{ command: RESTORE_COMMAND }],
      })
      expect(result.message).toContain('does not answer')
      // Its message already says to run dev restore: the person line is not repeated.
      expect(human.split(RESTORE_COMMAND)).toHaveLength(2)
      expect(exitCodeOf(result)).toBe(3)
      expect(follow).not.toHaveBeenCalled()
    },
  )

  test('a stale session started with --aws-profile: the restore uses that profile', async () => {
    const service = serviceDir()
    writeSession(service, { aws_profile: 'sandbox' })
    starting(eventLog(service))
    const { result, human } = await wait(
      service,
      { for: 'ready' },
      { connect: async () => null },
    ).promise
    expect(result.next).toEqual([
      {
        command: `${RESTORE_COMMAND} --aws-profile sandbox`,
        when: expect.any(String),
      },
    ])
    expect(human).toContain(`Run "${RESTORE_COMMAND} --aws-profile sandbox"`)
  })

  test('a session process that is gone without its end is a stale session too', async () => {
    const service = serviceDir()
    writeSession(service, { state: 'starting', control: null })
    starting(eventLog(service))
    const { result, human } = await wait(
      service,
      { for: 'ready' },
      { isAlive: () => false, connect: async () => null },
    ).promise
    expect(human).toBe(
      'The Dev Mode session here (pid 41234) ended without restoring its functions.\n' +
        RESTORE_LINE,
    )
    expect(result).toMatchObject({
      status: 'error',
      reason: 'restore_incomplete',
      next: [{ command: RESTORE_COMMAND }],
    })
    expect(exitCodeOf(result)).toBe(3)
  })

  test('a session that wrote its end but not yet removed its file has ended, not gone stale', async () => {
    const service = serviceDir()
    writeSession(service, { state: 'stopping' })
    const log = eventLog(service)
    starting(log)
    ready(log)
    const { cursor } = endWith(log)
    const ended = await wait(
      service,
      { for: 'ended' },
      { connect: async () => null },
    ).promise
    expect(ended.result).toMatchObject({
      status: 'ok',
      cursor,
      event: { type: 'session.ended' },
    })
    const invocation = await wait(
      service,
      { for: 'invocation' },
      { connect: async () => null },
    ).promise
    expect(invocation.result).toMatchObject({
      status: 'error',
      reason: 'session_not_running',
    })
  })
})

describe('matching, touching and following', () => {
  // A follower that delivers nothing and ends when the wait ends.
  const quietFollow = ({ signal }) =>
    new Promise((resolve) => signal.addEventListener('abort', resolve))

  test('of several matches after the cursor the first wins, with its own cursor', async () => {
    const service = serviceDir()
    const record = writeSession(service)
    const log = eventLog(service)
    starting(log)
    const { cursor: after } = ready(log)
    const first = invocationEnd(log, {
      request_id: 'aaaaaaaa-0000-4000-8000-000000000000',
    })
    invocationEnd(log, { request_id: 'bbbbbbbb-0000-4000-8000-000000000000' })
    const { result } = await wait(
      service,
      { for: 'invocation', after },
      { connect: async () => liveClient(record) },
    ).promise
    expect(result.event).toMatchObject({
      seq: first.seq,
      request_id: 'aaaaaaaa-0000-4000-8000-000000000000',
    })
    expect(result.cursor).toBe(first.cursor)
  })

  test('a repeated --function matches any of them', async () => {
    const service = serviceDir()
    const record = writeSession(service)
    const log = eventLog(service)
    starting(log)
    const { cursor: after } = ready(log)
    invocationEnd(log, { function: 'deleteOrder' })
    const { logger, promise } = wait(
      service,
      { for: 'invocation', after, function: ['createOrder', 'listOrders'] },
      { connect: async () => liveClient(record) },
    )
    await waiting(logger)
    expect(logger.text()).toContain(
      'Waiting for the next invocation of createOrder or listOrders (up to 100s)',
    )
    const { seq } = invocationEnd(log, { function: 'listOrders' })
    const { result } = await promise
    expect(result.event).toMatchObject({ seq, function: 'listOrders' })
  })

  test.each([
    ['rejects', () => Promise.reject(new Error('connection refused'))],
    ['never answers', () => new Promise(() => {})],
  ])(
    'a touch that %s neither fails nor delays the wait',
    async (_name, touch) => {
      const service = serviceDir()
      const record = writeSession(service)
      const log = eventLog(service)
      starting(log)
      ready(log)
      const clock = manualClock(Date.parse('2026-10-05T10:41:00Z'))
      const client = { record, touch: jest.fn(touch) }
      const logger = fakeLog()
      const outcome = runDevWait({
        serviceDir: service,
        options: { for: 'invocation' },
        logger,
        deps: {
          progress: recordingProgress(logger),
          timers: clock.timers,
          isAlive: () => true,
          connect: async () => client,
        },
      })
      await waiting(logger)
      await clock.advance(TOUCH_INTERVAL_MS)
      expect(client.touch).toHaveBeenCalledTimes(1)
      const { seq, cursor } = invocationEnd(log)
      // One poll of the event file later.
      await clock.advance(200)
      const { result } = await outcome
      expect(result).toMatchObject({ status: 'ok', cursor, event: { seq } })
      expect(clock.live()).toBe(0)
    },
  )

  test('--for ended never touches the session, so it can still stop for being idle', async () => {
    const service = serviceDir()
    const record = writeSession(service)
    const log = eventLog(service)
    starting(log)
    ready(log)
    const clock = manualClock(Date.parse('2026-10-05T10:41:00Z'))
    const client = liveClient(record)
    const logger = fakeLog()
    const outcome = runDevWait({
      serviceDir: service,
      options: { for: 'ended' },
      logger,
      deps: {
        progress: recordingProgress(logger),
        timers: clock.timers,
        follow: quietFollow,
        isAlive: () => true,
        connect: async () => client,
      },
    })
    await waiting(logger)
    await clock.advance(WAIT_DEFAULT_MS)
    const { result } = await outcome
    expect(result).toMatchObject({ status: 'timeout' })
    expect(client.touch).not.toHaveBeenCalled()
    expect(clock.live()).toBe(0)
  })

  test("a record written after the session's file was renamed under it is still seen", async () => {
    const service = serviceDir()
    const record = writeSession(service)
    const log = eventLog(service)
    starting(log)
    ready(log)
    const { logger, promise } = wait(
      service,
      { for: 'invocation' },
      { connect: async () => liveClient(record) },
    )
    await waiting(logger)
    // Another log opening here renames this session's file; the session keeps writing to it.
    starting(eventLog(service, `s_${'1'.repeat(12)}`))
    const { seq, cursor } = invocationEnd(log)
    const { result, timersLeft } = await promise
    expect(result).toMatchObject({
      status: 'ok',
      cursor,
      event: { seq, session_id: SESSION },
    })
    expect(timersLeft).toBe(0)
  })
})

describe('a failed start whose restore failed', () => {
  // How the session writes it: session.failed with exit code 3, then session.ended with the
  // functions it could not restore.
  const failedUnrestored = (log) => {
    const failed = log.emit('session.failed', {
      reason: 'error',
      message: 'The IoT Core connection failed.',
      exit_code: 3,
    })
    log.emit('session.ended', {
      exit_code: 3,
      restore: { restored: 1, unchanged: 0, skipped: 0, missing: 0, failed: 1 },
      kept: false,
    })
    return failed
  }
  const RESTORE = [{ command: RESTORE_COMMAND }]
  const incomplete = (cursor) => ({
    status: 'error',
    reason: 'restore_incomplete',
    cursor,
    event: { type: 'session.failed', exit_code: 3 },
    next: RESTORE,
  })

  test('--for ended meeting it while following exits 3 with dev restore', async () => {
    const service = serviceDir()
    const record = writeSession(service, { state: 'starting' })
    const log = eventLog(service)
    starting(log)
    const { logger, promise } = wait(
      service,
      { for: 'ended' },
      { connect: async () => liveClient(record) },
    )
    await waiting(logger)
    const { cursor } = failedUnrestored(log)
    const { result, human } = await promise
    expect(result).toMatchObject(incomplete(cursor))
    expect(exitCodeOf(result)).toBe(3)
    expect(human).toBe(
      'Dev Mode did not start: The IoT Core connection failed.\n' +
        RESTORE_LINE,
    )
  })

  test('--for ended finding it after the cursor exits 3 with dev restore', async () => {
    const service = serviceDir()
    const log = eventLog(service)
    const { cursor: after } = starting(log)
    const { cursor } = failedUnrestored(log)
    const { result } = await wait(service, { for: 'ended', after }).promise
    expect(result).toMatchObject(incomplete(cursor))
    expect(exitCodeOf(result)).toBe(3)
  })

  test('--for ended with no session running exits 3 with dev restore', async () => {
    const service = serviceDir()
    const log = eventLog(service)
    starting(log)
    const { cursor } = failedUnrestored(log)
    const { result } = await wait(
      service,
      { for: 'ended' },
      { connect: async () => null },
    ).promise
    expect(result).toMatchObject(incomplete(cursor))
    expect(exitCodeOf(result)).toBe(3)
  })

  test('--for ready meeting it is session_ended with dev restore next', async () => {
    const service = serviceDir()
    const record = writeSession(service, { state: 'stopping' })
    const log = eventLog(service)
    starting(log)
    const { cursor } = failedUnrestored(log)
    const { result } = await wait(
      service,
      { for: 'ready' },
      { connect: async () => liveClient(record) },
    ).promise
    expect(result).toMatchObject({
      status: 'error',
      reason: 'session_ended',
      cursor,
      event: { type: 'session.failed', exit_code: 3 },
      next: RESTORE,
    })
    expect(exitCodeOf(result)).toBe(1)
  })

  test('--for invocation meeting it while following is session_ended with dev restore next', async () => {
    const service = serviceDir()
    const record = writeSession(service, { state: 'starting' })
    const log = eventLog(service)
    starting(log)
    const { logger, promise } = wait(
      service,
      { for: 'invocation' },
      { connect: async () => liveClient(record) },
    )
    await waiting(logger)
    const { cursor } = failedUnrestored(log)
    const { result } = await promise
    expect(result).toMatchObject({
      status: 'error',
      reason: 'session_ended',
      cursor,
      event: { type: 'session.failed' },
      next: RESTORE,
    })
  })

  test('an end that restored everything adds no next step', async () => {
    const service = serviceDir()
    const log = eventLog(service)
    const { cursor: after } = starting(log)
    log.emit('session.failed', {
      reason: 'nothing_to_attach',
      message: 'x',
      exit_code: 1,
    })
    endWith(log, { exit_code: 1 })
    const { result } = await wait(service, { for: 'invocation', after }).promise
    expect(result).toMatchObject({ reason: 'session_ended' })
    expect(result).not.toHaveProperty('next')
  })
})

describe("a failed start's restore result comes from its session.ended", () => {
  const RESTORE = [{ command: RESTORE_COMMAND }]
  const restoreOf = (failed) => ({
    restored: 1,
    unchanged: 0,
    skipped: 0,
    missing: 0,
    failed,
  })
  // Both exit 3, as the session writes them: session.failed, then right after it session.ended.
  const CASES = {
    // The restore after the failed start left a function in Dev Mode.
    'restore failed': {
      failed: {
        reason: 'error',
        message: 'The IoT Core connection failed.',
        exit_code: 3,
      },
      ended: { exit_code: 3, restore: restoreOf(1), kept: false },
      expected: {
        reason: 'restore_incomplete',
        message:
          'Dev Mode did not start (The IoT Core connection failed), and it could not restore every function it had attached.',
        next: RESTORE,
      },
      human: `Dev Mode did not start: The IoT Core connection failed.\n${RESTORE_LINE}`,
    },
    // No function could be attached; everything it changed was restored.
    'attach failed, restore clean': {
      failed: {
        reason: 'attach_incomplete',
        message: 'No function could be attached.',
        exit_code: 3,
      },
      ended: { exit_code: 3, restore: restoreOf(0), kept: false },
      expected: {
        reason: 'attach_incomplete',
        message:
          'Dev Mode did not start (No function could be attached); it restored its functions.',
      },
      human: 'Dev Mode did not start: No function could be attached.',
    },
  }
  const failStart = (log, { failed, ended }) => {
    const record = log.emit('session.failed', failed)
    log.emit('session.ended', ended)
    return record
  }
  // The three ways `--for ended` meets the end; `end(log, service)` writes it.
  const PATHS = {
    following: async (service, end) => {
      const record = writeSession(service, { state: 'starting' })
      const log = eventLog(service)
      starting(log)
      const { logger, promise } = wait(
        service,
        { for: 'ended' },
        { connect: async () => liveClient(record) },
      )
      await waiting(logger)
      const { cursor } = end(log, service)
      return { cursor, ...(await promise) }
    },
    'after the cursor': async (service, end) => {
      const log = eventLog(service)
      const { cursor: after } = starting(log)
      const { cursor } = end(log, service)
      return {
        cursor,
        ...(await wait(service, { for: 'ended', after }).promise),
      }
    },
    'no session running': async (service, end) => {
      const log = eventLog(service)
      starting(log)
      const { cursor } = end(log, service)
      const outcome = await wait(
        service,
        { for: 'ended' },
        { connect: async () => null },
      ).promise
      return { cursor, ...outcome }
    },
  }
  const each = (names) =>
    Object.keys(PATHS).flatMap((way) => names.map((name) => [way, name]))

  test.each(each(Object.keys(CASES)))(
    '--for ended, %s: %s',
    async (way, name) => {
      const { failed, ended, expected, human: line } = CASES[name]
      const { cursor, result, human, timersLeft } = await PATHS[way](
        serviceDir(),
        (log) => failStart(log, { failed, ended }),
      )
      expect(result).toMatchObject({
        status: 'error',
        ...expected,
        cursor,
        event: { type: 'session.failed', exit_code: 3 },
      })
      if (!expected.next) expect(result).not.toHaveProperty('next')
      expect(exitCodeOf(result)).toBe(3)
      expect(human).toBe(line)
      expect(timersLeft).toBe(0)
    },
  )

  test.each(Object.keys(CASES))(
    "--for ended, following, with the session's log renamed before its end: %s",
    async (name) => {
      const { failed, ended, expected } = CASES[name]
      const { cursor, result } = await PATHS.following(
        serviceDir(),
        (log, service) => {
          // Another log opening here renames this session's file; the session keeps writing to it.
          starting(eventLog(service, `s_${'1'.repeat(12)}`))
          return failStart(log, { failed, ended })
        },
      )
      expect(result).toMatchObject({ ...expected, cursor })
      expect(exitCodeOf(result)).toBe(3)
    },
  )

  test.each([
    [
      'an attach that failed',
      {
        reason: 'attach_incomplete',
        message: 'No function could be attached.',
        exit_code: 3,
      },
      3,
    ],
    [
      'a restore that failed',
      {
        reason: 'error',
        message: 'The IoT Core connection failed.',
        exit_code: 3,
      },
      1,
    ],
  ])(
    'a failed start with no session.ended after it (%s) keeps its own reason and exit code',
    async (_name, failed, code) => {
      for (const way of ['after the cursor', 'no session running']) {
        const { cursor, result } = await PATHS[way](serviceDir(), (log) =>
          log.emit('session.failed', failed),
        )
        expect(result).toMatchObject({
          status: 'error',
          reason: failed.reason,
          message: failed.message,
          cursor,
          event: { type: 'session.failed' },
        })
        expect(result).not.toHaveProperty('next')
        expect(exitCodeOf(result)).toBe(code)
      }
    },
  )

  test.each([
    ['restore failed', RESTORE],
    ['attach failed, restore clean', undefined],
  ])('--for ready meeting a failed start (%s)', async (name, next) => {
    const { failed, ended } = CASES[name]
    const service = serviceDir()
    const record = writeSession(service, { state: 'stopping' })
    const log = eventLog(service)
    starting(log)
    const { cursor } = failStart(log, { failed, ended })
    const { result, human } = await wait(
      service,
      { for: 'ready' },
      { connect: async () => liveClient(record) },
    ).promise
    expect(result).toMatchObject({
      status: 'error',
      reason: 'session_ended',
      cursor,
      event: { type: 'session.failed', exit_code: 3 },
    })
    if (next) expect(result).toMatchObject({ next })
    else expect(result).not.toHaveProperty('next')
    expect(exitCodeOf(result)).toBe(1)
    expect(human).toBe(
      [
        'The Dev Mode session ended before that happened.',
        `Dev Mode did not start: ${failed.message}`,
        ...(next ? [RESTORE_LINE] : []),
      ].join('\n'),
    )
  })

  test('--for invocation meeting a failed start whose restore was clean adds no next step', async () => {
    const service = serviceDir()
    const record = writeSession(service, { state: 'starting' })
    const log = eventLog(service)
    starting(log)
    const { logger, promise } = wait(
      service,
      { for: 'invocation' },
      { connect: async () => liveClient(record) },
    )
    await waiting(logger)
    const { cursor } = failStart(log, CASES['attach failed, restore clean'])
    const { result } = await promise
    expect(result).toMatchObject({
      reason: 'session_ended',
      cursor,
      event: { type: 'session.failed', exit_code: 3 },
    })
    expect(result).not.toHaveProperty('next')
  })

  test('a failed start without a message never says "undefined"', async () => {
    const { cursor, result, human } = await PATHS['no session running'](
      serviceDir(),
      (log) =>
        failStart(log, {
          failed: { reason: 'error', exit_code: 3 },
          ended: CASES['restore failed'].ended,
        }),
    )
    expect(result).toMatchObject({
      status: 'error',
      reason: 'restore_incomplete',
      message:
        'Dev Mode did not start, and it could not restore every function it had attached.',
      cursor,
      next: RESTORE,
    })
    expect(human).toBe(`Dev Mode did not start.\n${RESTORE_LINE}`)
    expect(`${JSON.stringify(result)}\n${human}`).not.toContain('undefined')
  })
})

describe('checks and answers added with the sweep', () => {
  test('a --function serverless.yml does not have is refused at once', async () => {
    const service = serviceDir()
    const record = writeSession(service)
    const log = eventLog(service)
    starting(log)
    ready(log)
    const timers = countingTimers()
    const { result } = await runDevWait({
      serviceDir: service,
      options: { for: 'invocation', function: ['createOrder', 'nope'] },
      logger: fakeLog(),
      serverless: { service: { getAllFunctions: () => ['createOrder'] } },
      deps: {
        timers,
        isAlive: () => true,
        connect: async () => liveClient(record),
      },
    })
    expect(result).toMatchObject({
      status: 'error',
      reason: 'error',
      message: 'Function "nope" is not in serverless.yml.',
    })
    expect(exitCodeOf(result)).toBe(1)
    expect(timers.live()).toBe(0)
  })

  test('a session still starting is touched once its control endpoint listens', async () => {
    const service = serviceDir()
    writeSession(service, { state: 'starting', ready_at: null, control: null })
    const log = eventLog(service)
    starting(log)
    const clock = manualClock(Date.parse('2026-10-05T10:41:00Z'))
    const client = liveClient({ session_id: SESSION })
    const connect = jest
      .fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValue(client)
    const logger = fakeLog()
    const outcome = runDevWait({
      serviceDir: service,
      options: { for: 'invocation', timeout: '2m' },
      logger,
      deps: {
        progress: recordingProgress(logger),
        timers: clock.timers,
        follow: ({ signal }) =>
          new Promise((resolve) => signal.addEventListener('abort', resolve)),
        isAlive: () => true,
        connect,
      },
    })
    await waiting(logger)
    // The first touch finds no endpoint yet; the next one reaches the session.
    await clock.advance(TOUCH_INTERVAL_MS)
    expect(client.touch).not.toHaveBeenCalled()
    await clock.advance(TOUCH_INTERVAL_MS)
    expect(client.touch).toHaveBeenCalledTimes(1)
    await clock.advance(TOUCH_INTERVAL_MS)
    expect(client.touch).toHaveBeenCalledTimes(2)
    // A touch is one attempt within 2 s: no second health check, half the bound for each call.
    for (const [args] of connect.mock.calls.slice(1)) {
      expect(args).toMatchObject({ retryMs: 0, timeoutMs: 1_000 })
    }
    await clock.advance(2 * 60_000)
    expect((await outcome).result).toMatchObject({ status: 'timeout' })
    expect(clock.live()).toBe(0)
  })

  test("a failed start's session.ended written just after the wait read its session.failed still decides", async () => {
    const service = serviceDir()
    const record = writeSession(service, { state: 'starting' })
    const log = eventLog(service)
    starting(log)
    const { logger, promise } = wait(
      service,
      { for: 'ended' },
      {
        connect: async () => liveClient(record),
        // Hands the wait the session.failed alone; its session.ended is written a moment later.
        follow: ({ onRecord, signal }) =>
          new Promise((resolve) => {
            signal.addEventListener('abort', resolve)
            const failed = log.emit('session.failed', {
              reason: 'error',
              message: 'The IoT Core connection failed.',
              exit_code: 3,
            })
            onRecord({
              v: 1,
              seq: failed.seq,
              session_id: SESSION,
              type: 'session.failed',
              reason: 'error',
              message: 'The IoT Core connection failed.',
              exit_code: 3,
            })
            setTimeout(
              () =>
                log.emit('session.ended', {
                  exit_code: 3,
                  restore: {
                    restored: 1,
                    unchanged: 0,
                    skipped: 0,
                    missing: 0,
                    failed: 1,
                  },
                  kept: false,
                }),
              60,
            )
          }),
      },
    )
    await waiting(logger)
    const { result } = await promise
    expect(result).toMatchObject({
      status: 'error',
      reason: 'restore_incomplete',
      next: [{ command: RESTORE_COMMAND }],
    })
  })

  test('an end without an exit code never says "exit undefined"', async () => {
    const service = serviceDir()
    const log = eventLog(service)
    starting(log)
    log.emit('session.ended', {
      restore: { restored: 2, unchanged: 0, skipped: 0, missing: 0, failed: 0 },
      kept: false,
    })
    const { human } = await wait(
      service,
      { for: 'ended' },
      {
        connect: async () => null,
        isAlive: () => false,
      },
    ).promise
    expect(human).toBe('Dev Mode off: 2 restored, 0 not restored.')
  })

  test('a record the answer cannot describe is an error result, never a rejected command', async () => {
    const service = serviceDir()
    const record = writeSession(service)
    const log = eventLog(service)
    starting(log)
    const { cursor: after } = ready(log)
    // A damaged record: its functions are not a list.
    log.emit('reload.end', { ok: true, functions: 'api', ms: 5 })
    const { result } = await wait(
      service,
      { for: 'reload', after },
      { connect: async () => liveClient(record) },
    ).promise
    expect(result).toMatchObject({ status: 'error' })
    expect(exitCodeOf(result)).toBe(1)
  })
})
