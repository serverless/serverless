import { afterAll, afterEach, describe, expect, test } from '@jest/globals'
import fs from 'fs'
import os from 'os'
import path from 'path'
import {
  EMPTY_RESTORE,
  createSessionLifecycle,
  newSessionRecord,
  openSessionState,
  restoreCounts,
  webAppRestoreCounts,
  sameScope,
  selectionOf,
} from '../../../../../../../lib/plugins/aws/dev/state/session-state.js'
import { memoryState, testSessionId } from '../attach/fakes.js'

const dirs = []
afterEach(() => {
  for (const dir of dirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})
const serviceDir = () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sls-dev-t-'))
  dirs.push(dir)
  return dir
}
const record = (id, extra = {}) =>
  newSessionRecord({
    sessionId: id,
    pid: process.pid,
    service: 'orders',
    stage: 'dev',
    region: 'us-east-1',
    owner: 'ana@laptop',
    selection: selectionOf({ 'skip-function': 'report' }),
    startedAt: Date.parse('2026-10-05T10:40:02.113Z'),
    cliVersion: '4.44.0',
    ...extra,
  })

test('the session record has the fields of the contract, starting', () => {
  expect(record('s_3f2a9c1e0b4d')).toEqual({
    v: 1,
    session_id: 's_3f2a9c1e0b4d',
    pid: process.pid,
    state: 'starting',
    service: 'orders',
    stage: 'dev',
    region: 'us-east-1',
    owner: 'ana@laptop',
    selection: { only: [], skip: ['report'] },
    detached: false,
    idle_timeout_s: null,
    started_at: '2026-10-05T10:40:02.113Z',
    ready_at: null,
    cli_version: '4.44.0',
    events_file: 'session.ndjson',
    log_file: null,
    control: null,
  })
})

test('the session record names the AWS profile only when the session was started with one', () => {
  expect(record('s_3f2a9c1e0b4d', { awsProfile: 'sandbox' })).toMatchObject({
    stage: 'dev',
    region: 'us-east-1',
    aws_profile: 'sandbox',
  })
  expect(record('s_3f2a9c1e0b4d')).not.toHaveProperty('aws_profile')
})

test('the session record says --take-over and --on-exit only when the session was started with them', () => {
  expect(
    record('s_3f2a9c1e0b4d', { takeOver: true, onExit: 'keep' }),
  ).toMatchObject({ take_over: true, on_exit: 'keep' })
  const plain = record('s_3f2a9c1e0b4d', { takeOver: false })
  expect(plain).not.toHaveProperty('take_over')
  expect(plain).not.toHaveProperty('on_exit')
})

test('the selection is sorted and de-duplicated; the scope is stage, region and selection', () => {
  expect(
    selectionOf({ function: ['b', 'a', 'b'], 'skip-function': 'c' }),
  ).toEqual({ only: ['a', 'b'], skip: ['c'] })
  const a = {
    stage: 'dev',
    region: 'us-east-1',
    selection: { only: ['b', 'a'], skip: [] },
  }
  expect(
    sameScope(a, { ...a, selection: { only: ['a', 'b'], skip: [] } }),
  ).toBe(true)
  expect(sameScope(a, { ...a, stage: 'other' })).toBe(false)
  expect(sameScope(a, { ...a, region: 'eu-west-1' })).toBe(false)
  expect(sameScope(a, { ...a, selection: { only: ['a'], skip: [] } })).toBe(
    false,
  )
})

test('restore counts come from a restore result, or zeros', () => {
  expect(
    restoreCounts({
      restored: [{}, {}],
      unchanged: [{}],
      skipped: [],
      missing: [],
      failed: [{}],
    }),
  ).toEqual({ restored: 2, unchanged: 1, skipped: 0, missing: 0, failed: 1 })
  expect(restoreCounts({ failed: ['a'], timedOut: true })).toEqual({
    ...EMPTY_RESTORE,
    failed: 1,
  })
})

test("a restore's web app counts: its web app entries alone, or null without any", () => {
  expect(
    webAppRestoreCounts({
      restored: [{ webApp: true }, {}, { webApp: true }],
      unchanged: [],
      skipped: [],
      missing: [],
      failed: [{}],
    }),
  ).toEqual({ ...EMPTY_RESTORE, restored: 2 })
  expect(
    webAppRestoreCounts({ restored: [], failed: [{ webApp: true }] }),
  ).toEqual({ ...EMPTY_RESTORE, failed: 1 })
  expect(webAppRestoreCounts({ restored: [{}], failed: [] })).toBeNull()
  expect(webAppRestoreCounts(undefined)).toBeNull()
})

test('session.ended carries the web app counts beside the restore counts', () => {
  const state = memoryState()
  const lifecycle = createSessionLifecycle({ state })
  lifecycle.ended({
    exitCode: 0,
    restore: { restored: 3 },
    webApps: { restored: 2 },
  })
  expect(state.records.at(-1)).toEqual({
    type: 'session.ended',
    exit_code: 0,
    restore: { ...EMPTY_RESTORE, restored: 3 },
    web_apps: { ...EMPTY_RESTORE, restored: 2 },
    kept: false,
  })
})

test('openSessionState claims the directory and opens its log; a second start gets the first', async () => {
  const dir = serviceDir()
  const first = await openSessionState({
    serviceDir: dir,
    record: record(testSessionId(1)),
  })
  expect(first).toMatchObject({
    claimed: true,
    dir: path.join(dir, '.serverless', 'dev'),
  })
  first.events.emit('session.starting', {})
  const second = await openSessionState({
    serviceDir: dir,
    record: record(testSessionId(2)),
    // Another process: the first session's pid is not its own.
    selfPid: -1,
    // A second after the first session's start: it is still starting.
    now: () => Date.parse('2026-10-05T10:40:03.113Z'),
  })
  expect(second).toEqual({
    claimed: false,
    existing: expect.objectContaining({ session_id: testSessionId(1) }),
  })
  // The second start rotated nothing: the first session's log is intact.
  expect(
    fs.readFileSync(path.join(first.dir, 'session.ndjson'), 'utf8'),
  ).toContain(testSessionId(1))
  first.events.close()
  first.sessionFile.release()
})

describe('createSessionLifecycle', () => {
  test('writes each record once, ready only before an end, failed only before ready, ended last', () => {
    const state = memoryState()
    const lifecycle = createSessionLifecycle({
      state,
      now: () => Date.parse('2026-10-05T10:40:09.000Z'),
    })
    lifecycle.starting({ stage: 'dev' })
    lifecycle.modes([
      {
        function: 'api',
        mode: 'dev',
        notes: [{ reason: 'reattached', message: 'm' }],
      },
      {
        function: 'report',
        mode: 'deployed',
        reason: 'not_selected',
        why: 'not selected (--skip-function)',
        notes: [],
      },
      { function: 'old', mode: 'skipped', reason: 'legacy_shim', why: 'w' },
    ])
    lifecycle.ready({ readyMs: 7012.4, attachMs: 1300.6 })
    lifecycle.ready({ readyMs: 1, attachMs: 1 })
    lifecycle.failed({ reason: 'error', message: 'x', exitCode: 3 })
    lifecycle.stopping({ trigger: 'signal', signal: 'SIGTERM' })
    lifecycle.stopping({ trigger: 'stop_command' })
    lifecycle.ended({ exitCode: 0, restore: { restored: 1 }, kept: false })
    lifecycle.ended({ exitCode: 3 })
    expect(state.records).toEqual([
      { type: 'session.starting', stage: 'dev' },
      {
        type: 'function.mode',
        function: 'api',
        mode: 'dev',
        reason: undefined,
        why: undefined,
        notes: ['reattached'],
      },
      {
        type: 'function.mode',
        function: 'report',
        mode: 'deployed',
        reason: 'not_selected',
        why: 'not selected (--skip-function)',
        notes: undefined,
      },
      {
        type: 'function.mode',
        function: 'old',
        mode: 'skipped',
        reason: 'legacy_shim',
        why: 'w',
        notes: undefined,
      },
      {
        type: 'session.ready',
        functions: { dev: 1, deployed: 1, skipped: 1 },
        ready_ms: 7012,
        attach_ms: 1301,
      },
      { type: 'session.stopping', trigger: 'signal', signal: 'SIGTERM' },
      {
        type: 'session.ended',
        exit_code: 0,
        restore: { ...EMPTY_RESTORE, restored: 1 },
        kept: false,
      },
    ])
    expect(state.updates).toEqual([
      { state: 'on', ready_at: '2026-10-05T10:40:09.000Z' },
      { state: 'stopping' },
    ])
    expect(lifecycle.isReady).toBe(true)
    expect(state.closed).toBe(true)
    expect(state.released).toBe(true)
  })

  test('a function the session loses changes its row and is recorded', () => {
    const state = memoryState()
    const lifecycle = createSessionLifecycle({ state })
    const names = [
      'mine',
      'theirs',
      'wrapped',
      'detached',
      'gone',
      'layerless',
      'sealed',
      'kept',
    ]
    lifecycle.modes(
      names.map((name) => ({
        function: name,
        mode: 'dev',
        notes: [{ reason: 'vpc_egress_required', message: 'm' }],
      })),
    )
    const lost = [
      ['mine', 'taken_over_by_you'],
      ['theirs', 'taken_over'],
      ['wrapped', 'wrapper_replaced'],
      ['detached', 'detached'],
      ['gone', 'function_deleted'],
      ['layerless', 'layer_missing'],
      ['sealed', 'env_unreadable'],
    ]
    for (const [name, lostState] of lost) {
      lifecycle.lost({ name, state: lostState, why: `why ${name}` })
    }
    expect(
      lifecycle.rows.map(({ function: name, mode, reason, why, notes }) => [
        name,
        mode,
        reason,
        why,
        notes.length,
      ]),
    ).toEqual([
      ['mine', 'skipped', 'taken_over_by_you', 'why mine', 0],
      ['theirs', 'skipped', 'taken_over', 'why theirs', 0],
      ['wrapped', 'deployed', 'wrapper_replaced', 'why wrapped', 0],
      ['detached', 'deployed', 'detached', 'why detached', 0],
      ['gone', 'deployed', 'function_deleted', 'why gone', 0],
      ['layerless', 'dev', 'layer_missing', 'why layerless', 0],
      ['sealed', 'dev', 'env_unreadable', 'why sealed', 0],
      ['kept', 'dev', undefined, undefined, 1],
    ])
    expect(
      state.records.filter((record) => record.type === 'function.lost'),
    ).toEqual(
      lost.map(([name, lostState]) => ({
        type: 'function.lost',
        function: name,
        state: lostState,
      })),
    )
  })

  test('a web app the session lost is recorded as web_app.lost', () => {
    const state = memoryState()
    const lifecycle = createSessionLifecycle({ state })
    for (const lostState of ['detached', 'function_deleted', 'taken_over']) {
      lifecycle.webAppLost({ webApp: 'api', state: lostState })
    }
    expect(state.records).toEqual(
      ['detached', 'function_deleted', 'taken_over'].map((lostState) => ({
        type: 'web_app.lost',
        web_app: 'api',
        state: lostState,
      })),
    )
  })

  test("web_app.lost names who took a web app over; a take-over of the owner's own is taken_over_by_you", () => {
    const state = memoryState()
    const lifecycle = createSessionLifecycle({ state })
    lifecycle.webModes([
      { webApp: 'api', mode: 'dev', notes: [] },
      { webApp: 'web', mode: 'dev', notes: [] },
    ])
    lifecycle.webAppLost({
      webApp: 'api',
      state: 'taken_over',
      owner: 'bob@desk',
    })
    lifecycle.webAppLost({
      webApp: 'web',
      state: 'taken_over_by_you',
      owner: 'alice@mbp',
    })
    expect(
      state.records.filter((record) => record.type === 'web_app.lost'),
    ).toEqual([
      {
        type: 'web_app.lost',
        web_app: 'api',
        state: 'taken_over',
        owner: 'bob@desk',
      },
      { type: 'web_app.lost', web_app: 'web', state: 'taken_over_by_you' },
    ])
    expect(lifecycle.webRows.map((row) => [row.webApp, row.mode])).toEqual([
      ['api', 'skipped'],
      ['web', 'skipped'],
    ])
  })

  test('web apps get a web_app.mode record each, and session.ready counts them by mode', () => {
    const state = memoryState()
    const lifecycle = createSessionLifecycle({ state })
    lifecycle.modes([{ function: 'api', mode: 'dev', notes: [] }])
    lifecycle.webModes([
      { webApp: 'web', mode: 'dev', notes: [] },
      {
        webApp: 'admin',
        mode: 'local',
        notes: [{ reason: 'taken_over', message: 'taken over from bob' }],
      },
      {
        webApp: 'docs',
        mode: 'deployed',
        reason: 'build_output_entry',
        why: 'w',
        notes: [],
      },
    ])
    lifecycle.ready({ readyMs: 10, attachMs: 5 })
    expect(state.records.filter((r) => r.type !== 'function.mode')).toEqual([
      {
        type: 'web_app.mode',
        web_app: 'web',
        mode: 'dev',
        reason: undefined,
        why: undefined,
        notes: undefined,
      },
      {
        type: 'web_app.mode',
        web_app: 'admin',
        mode: 'local',
        reason: undefined,
        // The why dev status gives it.
        why: 'on its local URL only (--local-only); its real URL serves the deployed code; taken over from bob',
        notes: ['taken_over'],
      },
      {
        type: 'web_app.mode',
        web_app: 'docs',
        mode: 'deployed',
        reason: 'build_output_entry',
        why: 'w',
        notes: undefined,
      },
      {
        type: 'session.ready',
        functions: { dev: 1, deployed: 0, skipped: 0 },
        web_apps: { dev: 1, local: 1, deployed: 1, skipped: 0 },
        ready_ms: 10,
        attach_ms: 5,
      },
    ])
    expect(lifecycle.webRows.map((row) => row.webApp)).toEqual([
      'web',
      'admin',
      'docs',
    ])
  })

  test('a session without web apps writes no web_apps in session.ready', () => {
    const state = memoryState()
    const lifecycle = createSessionLifecycle({ state })
    lifecycle.modes([{ function: 'api', mode: 'dev', notes: [] }])
    lifecycle.webModes([])
    lifecycle.ready({ readyMs: 1, attachMs: 1 })
    expect(state.records.at(-1)).toEqual({
      type: 'session.ready',
      functions: { dev: 1, deployed: 0, skipped: 0 },
      ready_ms: 1,
      attach_ms: 1,
    })
  })

  test('a web app the session lost changes its row', () => {
    const state = memoryState()
    const lifecycle = createSessionLifecycle({ state })
    lifecycle.webModes([
      { webApp: 'web', mode: 'dev', notes: [] },
      { webApp: 'admin', mode: 'local', notes: [] },
    ])
    lifecycle.webAppLost({ webApp: 'web', state: 'taken_over', why: 'x' })
    lifecycle.webAppLost({ webApp: 'admin', state: 'detached', why: 'y' })
    expect(lifecycle.webRows).toEqual([
      {
        webApp: 'web',
        mode: 'skipped',
        reason: 'taken_over',
        why: 'x',
        notes: [],
      },
      {
        webApp: 'admin',
        mode: 'deployed',
        reason: 'detached',
        why: 'y',
        notes: [],
      },
    ])
  })

  test('a failed start keeps no URL in its message', () => {
    const state = memoryState()
    const lifecycle = createSessionLifecycle({ state })
    lifecycle.failed({
      reason: 'error',
      message:
        'request to https://lambda.us-east-1.amazonaws.com/2015-03-31/functions?X-Amz-Signature=abc failed\nat wss://x.iot.amazonaws.com/mqtt',
      exitCode: 1,
    })
    expect(state.records[0].message).toBe('request to <url> failed at <url>')
  })

  test('a failed start says why, in one line', () => {
    const state = memoryState()
    const lifecycle = createSessionLifecycle({ state })
    lifecycle.failed({
      reason: 'permission_denied',
      message: 'denied\nsecond line',
      exitCode: 1,
    })
    expect(state.records).toEqual([
      {
        type: 'session.failed',
        reason: 'permission_denied',
        message: 'denied second line',
        exit_code: 1,
      },
    ])
  })
})

describe('the log of a detached session', () => {
  const made = []
  afterAll(() => {
    for (const dir of made) fs.rmSync(dir, { recursive: true, force: true })
  })
  const serviceDirWith = (files) => {
    const serviceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sls-dev-t-'))
    made.push(serviceDir)
    const dir = path.join(serviceDir, '.serverless', 'dev')
    fs.mkdirSync(dir, { recursive: true })
    for (const [name, text] of Object.entries(files)) {
      fs.writeFileSync(path.join(dir, name), text)
    }
    return { serviceDir, dir }
  }
  const recordOf = (sessionId) =>
    newSessionRecord({
      sessionId,
      pid: process.pid + 1,
      service: 'orders',
      stage: 'dev',
      region: 'us-east-1',
      owner: 'ana@laptop',
      selection: { only: [], skip: [] },
      detached: true,
      idleTimeoutS: null,
      logFile: 'session.log',
      startedAt: Date.parse('2026-10-05T10:40:02.113Z'),
      cliVersion: '4.44.0',
    })

  test('becomes session.log once the session holds the directory', async () => {
    const { serviceDir, dir } = serviceDirWith({
      'session.log': 'the last session\n',
      'session.log.4242.tmp': 'this session\n',
    })
    const state = await openSessionState({
      serviceDir,
      record: recordOf('s_0000000000c1'),
      ownLog: 'session.log.4242.tmp',
      isAlive: () => false,
    })
    expect(state.claimed).toBe(true)
    expect(fs.readFileSync(path.join(dir, 'session.log'), 'utf8')).toBe(
      'this session\n',
    )
    expect(fs.existsSync(path.join(dir, 'session.log.4242.tmp'))).toBe(false)
    state.events.close()
    state.sessionFile.release()
  })

  test('stays as it is when another session holds the directory, or its name is not a log of this kind', async () => {
    const { serviceDir, dir } = serviceDirWith({
      'session.log': 'the running session\n',
      'session.log.4242.tmp': 'this start\n',
      'other.txt': 'x',
    })
    const first = await openSessionState({
      serviceDir,
      record: recordOf('s_0000000000c2'),
      isAlive: () => false,
    })
    const second = await openSessionState({
      serviceDir,
      record: recordOf('s_0000000000c3'),
      ownLog: 'session.log.4242.tmp',
      // The first session's process runs: the place is taken.
      isAlive: () => true,
      // A second after the first session's start: it is still starting.
      now: () => Date.parse('2026-10-05T10:40:03.113Z'),
    })
    expect(second.claimed).toBe(false)
    expect(fs.readFileSync(path.join(dir, 'session.log'), 'utf8')).toBe(
      'the running session\n',
    )
    first.events.close()
    first.sessionFile.release()
    const third = await openSessionState({
      serviceDir,
      record: recordOf('s_0000000000c4'),
      ownLog: '../other.txt',
      isAlive: () => false,
    })
    expect(fs.readFileSync(path.join(dir, 'session.log'), 'utf8')).toBe(
      'the running session\n',
    )
    third.events.close()
    third.sessionFile.release()
  })
})
