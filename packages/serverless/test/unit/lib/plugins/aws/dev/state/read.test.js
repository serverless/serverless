import { afterEach, describe, expect, test } from '@jest/globals'
import fs from 'fs'
import os from 'os'
import path from 'path'
import {
  currentSessionId,
  findInvocation,
  followRecords,
  lastCursor,
  listRequests,
  readRecords,
  readSessionRecords,
} from '../../../../../../../lib/plugins/aws/dev/state/read.js'
import { openEventLog } from '../../../../../../../lib/plugins/aws/dev/state/events.js'
import { countingTimers } from '../attach/fakes.js'

const dirs = []
afterEach(() => {
  for (const dir of dirs.splice(0))
    fs.rmSync(dir, { recursive: true, force: true })
})
const devDir = () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sls-dev-t-'))
  dirs.push(dir)
  return path.join(dir, '.serverless', 'dev')
}
const writeInvocation = (dir, fnDir, name, fields) => {
  const folder = path.join(dir, 'invocations', fnDir)
  fs.mkdirSync(folder, { recursive: true })
  fs.writeFileSync(path.join(folder, name), JSON.stringify({ v: 1, ...fields }))
}

describe('the event log readers', () => {
  test('read the current log, its session and its last cursor; a line still being written is skipped', () => {
    const dir = devDir()
    expect(readRecords({ dir })).toEqual([])
    expect(lastCursor({ dir })).toBeNull()
    expect(currentSessionId({ dir })).toBeNull()
    const log = openEventLog({ dir, sessionId: 's_000000000001' })
    log.emit('session.starting', {})
    log.emit('session.ready', {})
    fs.appendFileSync(path.join(dir, 'session.ndjson'), '{"v":1,"seq":3,')
    expect(readRecords({ dir }).map((record) => record.seq)).toEqual([1, 2])
    expect(lastCursor({ dir })).toBe('s_000000000001:2')
    expect(currentSessionId({ dir })).toBe('s_000000000001')
    log.close()
  })

  test("a session's records are found after the next session renamed its log", () => {
    const dir = devDir()
    const first = openEventLog({ dir, sessionId: 's_000000000001' })
    first.emit('session.ended', { exit_code: 0 })
    first.close()
    openEventLog({ dir, sessionId: 's_000000000002' }).close()
    expect(readSessionRecords({ dir, sessionId: 's_000000000001' })).toEqual([
      expect.objectContaining({ type: 'session.ended', exit_code: 0 }),
    ])
  })

  test("a session's records are found when the next session renames its log while it is read", () => {
    const dir = devDir()
    const first = openEventLog({ dir, sessionId: 's_0000000000a1' })
    first.emit('session.ended', { exit_code: 0 })
    first.close()
    // The log is checked as the first session's, then renamed by the next start before the read.
    let renamed = false
    const racing = {
      ...fs,
      readFileSync: (file, ...rest) => {
        if (!renamed && file === path.join(dir, 'session.ndjson')) {
          renamed = true
          const next = openEventLog({ dir, sessionId: 's_0000000000a2' })
          next.emit('session.starting', {})
          next.close()
        }
        return fs.readFileSync(file, ...rest)
      },
    }
    expect(
      readSessionRecords({ dir, sessionId: 's_0000000000a1', fs: racing }),
    ).toEqual([
      expect.objectContaining({ type: 'session.ended', exit_code: 0 }),
    ])
  })
})

describe('followRecords', () => {
  test('calls back for each new record after a seq, as written, and stops when aborted', async () => {
    const dir = devDir()
    const timers = countingTimers()
    const log = openEventLog({ dir, sessionId: 's_000000000001' })
    log.emit('session.starting', {})
    log.emit('session.ready', {})
    const seen = []
    const abort = new AbortController()
    const following = followRecords({
      dir,
      afterSeq: 1,
      sessionId: 's_000000000001',
      timers,
      signal: abort.signal,
      pollMs: 10,
      onRecord: (record) => {
        seen.push(record.type)
        if (record.type === 'session.ended') abort.abort()
      },
    })
    log.emit('invocation.start', {})
    log.emit('session.ended', {})
    log.close()
    await following
    expect(seen).toEqual(['session.ready', 'invocation.start', 'session.ended'])
    expect(timers.live()).toBe(0)
  })

  test('follows a log the next session renamed', async () => {
    const dir = devDir()
    const timers = countingTimers()
    const first = openEventLog({ dir, sessionId: 's_000000000001' })
    first.emit('session.stopping', {})
    const seen = []
    const abort = new AbortController()
    const following = followRecords({
      dir,
      sessionId: 's_000000000001',
      timers,
      signal: abort.signal,
      pollMs: 10,
      onRecord: (record) => {
        seen.push(record.type)
        if (record.type === 'session.ended') abort.abort()
      },
    })
    first.emit('session.ended', {})
    first.close()
    const second = openEventLog({ dir, sessionId: 's_000000000002' })
    second.emit('session.starting', {})
    await following
    second.close()
    expect(seen).toEqual(['session.stopping', 'session.ended'])
    expect(timers.live()).toBe(0)
  })

  test('a log renamed between the check of its session and the read is not read as this session', async () => {
    const dir = devDir()
    const timers = countingTimers()
    const current = path.join(dir, 'session.ndjson')
    const first = openEventLog({ dir, sessionId: 's_000000000001' })
    first.emit('session.starting', {})
    first.emit('session.ready', {})
    // Once armed (with a new record to read), the second open of the current log in a poll (the
    // read, after the check of its first line) finds it renamed and the next session's log in its
    // place.
    let armed = false
    let opens = 0
    const racing = {
      ...fs,
      openSync(file, ...rest) {
        if (armed && file === current && ++opens === 2) {
          armed = false
          first.emit('session.ended', {})
          first.close()
          const second = openEventLog({ dir, sessionId: 's_000000000002' })
          second.emit('session.starting', {})
          second.close()
        }
        return fs.openSync(file, ...rest)
      },
    }
    const seen = []
    const abort = new AbortController()
    await followRecords({
      dir,
      sessionId: 's_000000000001',
      timers,
      signal: abort.signal,
      pollMs: 10,
      fs: racing,
      onRecord: (record) => {
        seen.push(`${record.session_id}:${record.type}`)
        if (record.type === 'session.ready') {
          first.emit('session.stopping', {})
          armed = true
          opens = 0
        }
        if (record.type === 'session.ended') abort.abort()
      },
    })
    expect(seen).toEqual([
      's_000000000001:session.starting',
      's_000000000001:session.ready',
      's_000000000001:session.stopping',
      's_000000000001:session.ended',
    ])
    expect(timers.live()).toBe(0)
  })

  test('a character split between two polls is read whole', async () => {
    const dir = devDir()
    fs.mkdirSync(dir, { recursive: true })
    const file = path.join(dir, 'session.ndjson')
    const line = (seq, fields) =>
      `${JSON.stringify({ v: 1, seq, session_id: 's_000000000001', ...fields })}\n`
    const second = Buffer.from(
      line(2, { type: 'reload.end', error: 'café € 🚀' }),
    )
    // The first poll sees the second line cut inside the two-byte "é".
    const cut = second.indexOf(Buffer.from('é')) + 1
    fs.writeFileSync(
      file,
      Buffer.concat([
        Buffer.from(line(1, { type: 'session.starting' })),
        second.subarray(0, cut),
      ]),
    )
    const timers = countingTimers()
    const seen = []
    const abort = new AbortController()
    const following = followRecords({
      dir,
      sessionId: 's_000000000001',
      timers,
      signal: abort.signal,
      pollMs: 10,
      onRecord: (record) => {
        seen.push(record)
        if (record.seq === 2) abort.abort()
      },
    })
    expect(seen.map((record) => record.seq)).toEqual([1])
    fs.appendFileSync(file, second.subarray(cut))
    await following
    expect(seen[1].error).toBe('café € 🚀')
    expect(timers.live()).toBe(0)
  })

  test('an aborted signal resolves at once and leaves no timer', async () => {
    const timers = countingTimers()
    const abort = new AbortController()
    abort.abort()
    await followRecords({
      dir: devDir(),
      sessionId: 's_1',
      onRecord() {},
      timers,
      signal: abort.signal,
    })
    expect(timers.live()).toBe(0)
  })
})

describe('listRequests and findInvocation', () => {
  const fill = (dir) => {
    writeInvocation(
      dir,
      'createOrder',
      '1759661067-3f2a9c1e-0000-4000-8000-000000000001.json',
      {
        request_id: '3f2a9c1e-0000-4000-8000-000000000001',
        function: 'createOrder',
        started_at: '2026-10-05T10:41:07.512Z',
        outcome: 'error',
        duration_ms: 38,
        status_code: 502,
      },
    )
    writeInvocation(
      dir,
      'listOrders',
      '1759661090-77e0b3aa-0000-4000-8000-000000000002.json',
      {
        request_id: '77e0b3aa-0000-4000-8000-000000000002',
        function: 'listOrders',
        started_at: '2026-10-05T10:41:30.000Z',
        outcome: 'ok',
        duration_ms: 12,
        status_code: null,
      },
    )
    // An asynchronous retry keeps its request id: the newest file wins.
    writeInvocation(
      dir,
      'listOrders',
      '1759661150-77e0b3aa-0000-4000-8000-000000000002.json',
      {
        request_id: '77e0b3aa-0000-4000-8000-000000000002',
        function: 'listOrders',
        started_at: '2026-10-05T10:42:30.000Z',
        outcome: 'error',
        duration_ms: 15,
      },
    )
    writeInvocation(
      dir,
      'listOrders',
      '1759661100-77e0b3ab-0000-4000-8000-000000000003.json',
      {
        request_id: '77e0b3ab-0000-4000-8000-000000000003',
        function: 'listOrders',
        started_at: '2026-10-05T10:41:40.000Z',
        outcome: 'ok',
        duration_ms: 9,
      },
    )
    fs.writeFileSync(
      path.join(dir, 'invocations', 'listOrders', '.1-x.json.9.tmp'),
      '{',
    )
  }

  test('lists the newest first, per function or all, at most the limit', () => {
    const dir = devDir()
    expect(listRequests({ dir })).toEqual([])
    fill(dir)
    expect(listRequests({ dir, limit: 2 })).toEqual([
      {
        ts: '2026-10-05T10:42:30.000Z',
        kind: 'invocation',
        function: 'listOrders',
        stage: null,
        request_id: '77e0b3aa-0000-4000-8000-000000000002',
        outcome: 'error',
        duration_ms: 15,
        status_code: undefined,
        file: '.serverless/dev/invocations/listOrders/1759661150-77e0b3aa-0000-4000-8000-000000000002.json',
      },
      expect.objectContaining({
        request_id: '77e0b3ab-0000-4000-8000-000000000003',
      }),
    ])
    expect(listRequests({ dir, functionKey: 'createOrder' })).toEqual([
      expect.objectContaining({
        request_id: '3f2a9c1e-0000-4000-8000-000000000001',
        status_code: 502,
      }),
    ])
    expect(listRequests({ dir, functionKey: 'missing' })).toEqual([])
  })

  test('lists only the records of the function asked for, also when keys that differ only by case share a directory', () => {
    // On a file system that ignores case (Windows, macOS by default), `api` and `API` share one.
    const dir = devDir()
    writeInvocation(
      dir,
      'api',
      '1759661067-aaaaaaaa-0000-4000-8000-000000000001.json',
      {
        request_id: 'aaaaaaaa-0000-4000-8000-000000000001',
        function: 'api',
        started_at: '2026-10-05T10:41:07.000Z',
        outcome: 'ok',
        duration_ms: 3,
      },
    )
    writeInvocation(
      dir,
      'api',
      '1759661068-bbbbbbbb-0000-4000-8000-000000000002.json',
      {
        request_id: 'bbbbbbbb-0000-4000-8000-000000000002',
        function: 'API',
        started_at: '2026-10-05T10:41:08.000Z',
        outcome: 'ok',
        duration_ms: 4,
      },
    )
    const ids = (functionKey) =>
      listRequests({ dir, functionKey }).map((request) => request.request_id)
    expect(ids('api')).toEqual(['aaaaaaaa-0000-4000-8000-000000000001'])
    expect(listRequests({ dir }).map((request) => request.function)).toEqual([
      'API',
      'api',
    ])
  })

  test('finds an invocation by its id or a unique prefix of at least 8 characters', () => {
    const dir = devDir()
    fill(dir)
    expect(findInvocation({ dir, idOrPrefix: '3f2a9c1e' })).toEqual({
      file: '.serverless/dev/invocations/createOrder/1759661067-3f2a9c1e-0000-4000-8000-000000000001.json',
      record: expect.objectContaining({ outcome: 'error' }),
    })
    expect(
      findInvocation({
        dir,
        idOrPrefix: '77e0b3aa-0000-4000-8000-000000000002',
      }).file,
    ).toMatch(/1759661150-77e0b3aa/)
    expect(() => findInvocation({ dir, idOrPrefix: '77e0b3a0' })).toThrow(
      expect.objectContaining({ reason: 'invocation_not_found' }),
    )
    expect(
      findInvocation({ dir, idOrPrefix: '77e0b3ab' }).record.duration_ms,
    ).toBe(9)
  })

  test('an exact id of any length is found first; a shorter prefix is ambiguous', () => {
    const dir = devDir()
    fill(dir)
    writeInvocation(dir, 'listOrders', '1759661300-r-1.json', {
      request_id: 'r-1',
      function: 'listOrders',
      outcome: 'ok',
    })
    expect(findInvocation({ dir, idOrPrefix: 'r-1' })).toEqual({
      file: '.serverless/dev/invocations/listOrders/1759661300-r-1.json',
      record: expect.objectContaining({ request_id: 'r-1' }),
    })
    for (const idOrPrefix of ['77e0b3a', 'r-', '']) {
      expect(() => findInvocation({ dir, idOrPrefix })).toThrow(
        expect.objectContaining({ reason: 'ambiguous_request_id' }),
      )
    }
  })

  test('a prefix of two requests is ambiguous', () => {
    const dir = devDir()
    fill(dir)
    writeInvocation(dir, 'createOrder', '1759661200-3f2a9c1e-ffff.json', {
      request_id: '3f2a9c1e-ffff',
      function: 'createOrder',
    })
    expect(() => findInvocation({ dir, idOrPrefix: '3f2a9c1e' })).toThrow(
      expect.objectContaining({ reason: 'ambiguous_request_id' }),
    )
  })
})
