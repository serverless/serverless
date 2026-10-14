import { afterEach, describe, expect, test } from '@jest/globals'
import fs from 'fs'
import os from 'os'
import path from 'path'
import {
  MAX_RECORD_BYTES,
  ROTATED_EVENT_FILES,
  coalescePassedThrough,
  fitRecord,
  openEventLog,
  scrubLine,
} from '../../../../../../../lib/plugins/aws/dev/state/events.js'
import { countingTimers, testSessionId } from '../attach/fakes.js'

const dirs = []
afterEach(() => {
  for (const dir of dirs.splice(0))
    fs.rmSync(dir, { recursive: true, force: true })
})
const tempDir = () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sls-dev-t-'))
  dirs.push(dir)
  return dir
}
const linesOf = (file) =>
  fs
    .readFileSync(file, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line))
const waitFor = async (check, ms = 5_000) => {
  const until = Date.now() + ms
  while (!check()) {
    if (Date.now() > until) throw new Error('timed out waiting')
    await new Promise((resolve) => setTimeout(resolve, 5))
  }
}
const clock = () => {
  let t = Date.parse('2026-10-05T10:40:02.113Z')
  return () => (t += 1)
}

describe('openEventLog', () => {
  test('numbers records from 1 with the envelope first, and returns their cursors', () => {
    const dir = tempDir()
    const log = openEventLog({ dir, sessionId: testSessionId(1), now: clock() })
    expect(log.lastCursor()).toBeNull()
    expect(
      log.emit('session.starting', {
        stage: 'dev',
        pid: 7,
        skipped: undefined,
      }),
    ).toEqual({
      seq: 1,
      cursor: `${testSessionId(1)}:1`,
    })
    // A field never overrides the envelope.
    log.emit('session.ready', { seq: 99, type: 'other', ready_ms: 5 })
    log.close()
    log.emit('session.ended', {})
    const records = linesOf(path.join(dir, 'session.ndjson'))
    expect(records).toEqual([
      {
        v: 1,
        seq: 1,
        ts: '2026-10-05T10:40:02.114Z',
        session_id: testSessionId(1),
        type: 'session.starting',
        stage: 'dev',
        pid: 7,
      },
      {
        v: 1,
        seq: 2,
        ts: '2026-10-05T10:40:02.115Z',
        session_id: testSessionId(1),
        type: 'session.ready',
        ready_ms: 5,
      },
    ])
    expect(Object.keys(records[0]).slice(0, 5)).toEqual([
      'v',
      'seq',
      'ts',
      'session_id',
      'type',
    ])
    expect(log.lastCursor()).toBe(`${testSessionId(1)}:2`)
  })

  test('a new session renames the previous log after its session and keeps the newest five', () => {
    const dir = tempDir()
    for (let n = 1; n <= ROTATED_EVENT_FILES + 2; n += 1) {
      const id = `s_00000000000${n}`
      const log = openEventLog({ dir, sessionId: id })
      log.emit('session.starting', {})
      log.close()
      // Distinct modification times, oldest first.
      const at = new Date(Date.now() - (100 - n) * 1000)
      fs.utimesSync(path.join(dir, 'session.ndjson'), at, at)
    }
    const names = fs.readdirSync(dir).sort()
    expect(names).toEqual([
      'session.ndjson',
      `session.${testSessionId(2)}.ndjson`,
      `session.${testSessionId(3)}.ndjson`,
      `session.${testSessionId(4)}.ndjson`,
      `session.${testSessionId(5)}.ndjson`,
      `session.${testSessionId(6)}.ndjson`,
    ])
    expect(linesOf(path.join(dir, 'session.ndjson'))[0].session_id).toBe(
      testSessionId(7),
    )
    expect(
      linesOf(path.join(dir, `session.${testSessionId(6)}.ndjson`))[0].seq,
    ).toBe(1)
  })

  test('a previous log without a readable record is dropped', () => {
    const dir = tempDir()
    fs.writeFileSync(path.join(dir, 'session.ndjson'), 'not json\n')
    const log = openEventLog({ dir, sessionId: testSessionId(1) })
    log.close()
    expect(fs.readdirSync(dir)).toEqual(['session.ndjson'])
  })

  test('a failed write goes to onError and the session goes on', () => {
    const dir = tempDir()
    const errors = []
    const failing = {
      ...fs,
      writeSync: () => {
        throw Object.assign(new Error('no space left on device'), {
          code: 'ENOSPC',
        })
      },
    }
    const log = openEventLog({
      dir,
      sessionId: testSessionId(1),
      fs: failing,
      onError: (error) => errors.push(error.code),
    })
    expect(log.emit('session.starting', {})).toEqual({
      seq: 1,
      cursor: `${testSessionId(1)}:1`,
    })
    log.close()
    expect(errors).toEqual(['ENOSPC'])
  })

  if (process.platform !== 'win32') {
    test('the log is readable by its owner only', () => {
      const dir = tempDir()
      const log = openEventLog({ dir, sessionId: testSessionId(1) })
      log.close()
      expect(fs.statSync(path.join(dir, 'session.ndjson')).mode & 0o777).toBe(
        0o600,
      )
    })
  }
})

describe('openEventLog and links', () => {
  const onPosix = process.platform === 'win32' ? test.skip : test

  test('a link in the place of .serverless/dev is refused', () => {
    const service = tempDir()
    const target = tempDir()
    const dir = path.join(service, '.serverless', 'dev')
    fs.mkdirSync(path.dirname(dir), { recursive: true })
    fs.symlinkSync(target, dir, 'junction')
    expect(() => openEventLog({ dir, sessionId: 's_1' })).toThrow(
      expect.objectContaining({ code: 'EDEVLINK' }),
    )
    expect(fs.readdirSync(target)).toEqual([])
  })

  onPosix(
    'a log that is a link is never written through, even a dangling one',
    () => {
      const service = tempDir()
      const target = path.join(tempDir(), 'created-outside.txt')
      const dir = path.join(service, '.serverless', 'dev')
      fs.mkdirSync(dir, { recursive: true })
      fs.symlinkSync(target, path.join(dir, 'session.ndjson'))
      const log = openEventLog({ dir, sessionId: 's_1', now: clock() })
      log.emit('session.starting', {})
      log.close()
      expect(fs.existsSync(target)).toBe(false)
      expect(fs.lstatSync(path.join(dir, 'session.ndjson')).isFile()).toBe(true)
      expect(linesOf(path.join(dir, 'session.ndjson'))).toHaveLength(1)
      expect(fs.statSync(path.join(dir, 'session.ndjson')).mode & 0o777).toBe(
        0o600,
      )
    },
  )
})

describe('scrubLine', () => {
  test('makes one line and writes every URL as <url>', () => {
    expect(
      scrubLine(
        'upload to https://b.s3.amazonaws.com/k?X-Amz-Signature=abc failed\r\nsee wss://h/mqtt?token=t',
      ),
    ).toBe('upload to <url> failed see <url>')
    expect(scrubLine(undefined)).toBe('')
    expect(scrubLine('  no address here \n')).toBe('no address here')
  })

  test('keeps the quote, bracket or punctuation that closes the text around a URL', () => {
    expect(scrubLine('GET "https://h/p?sig=1" refused')).toBe(
      'GET "<url>" refused',
    )
    expect(scrubLine('(see https://h/p?sig=1).')).toBe('(see <url>).')
    expect(scrubLine("url 'http://h/x?a=1', then")).toBe("url '<url>', then")
  })

  test('never keeps what follows a bracket inside a URL', () => {
    expect(scrubLine('https://h/k(1).zip?X-Amz-Signature=abc')).toBe('<url>')
  })
})

describe('fitRecord', () => {
  const base = { v: 1, seq: 3, ts: 't', session_id: 's_1', type: 'reload.end' }
  test('a record that fits is unchanged', () => {
    const record = { ...base, ok: true }
    expect(fitRecord(record)).toBe(record)
  })

  test('the longest string is cut to fit, by whole characters, and the record says so', () => {
    const record = { ...base, ok: false, error: `${'é'.repeat(5_000)}` }
    const fitted = fitRecord(record)
    expect(Buffer.byteLength(JSON.stringify(fitted))).toBeLessThanOrEqual(
      MAX_RECORD_BYTES,
    )
    expect(fitted.truncated).toBe(true)
    expect(fitted.error).toMatch(/^é+$/)
    expect(fitted).toMatchObject(base)
    expect(record.error).toHaveLength(5_000)
  })

  test('a long list is shortened when its strings are short', () => {
    const functions = Array.from({ length: 600 }, (_, i) => `function${i}`)
    const fitted = fitRecord({ ...base, functions })
    expect(Buffer.byteLength(JSON.stringify(fitted))).toBeLessThanOrEqual(
      MAX_RECORD_BYTES,
    )
    expect(fitted.functions.length).toBeLessThan(600)
    expect(fitted.functions[0]).toBe('function0')
    expect(fitted.truncated).toBe(true)
  })

  test('escaped characters are counted as written', () => {
    const fitted = fitRecord({ ...base, error: '"\u0001'.repeat(3_000) })
    expect(Buffer.byteLength(JSON.stringify(fitted))).toBeLessThanOrEqual(
      MAX_RECORD_BYTES,
    )
  })
})

describe('coalescePassedThrough', () => {
  test('a burst is one record per function and reason, and stop leaves no timer', async () => {
    const timers = countingTimers()
    const written = []
    const passed = coalescePassedThrough({
      emit: (type, fields) => written.push([type, fields]),
      timers,
      windowMs: 20,
    })
    passed.add({ functionKey: 'api', reason: 'paced' })
    passed.add({ functionKey: 'api', reason: 'paced' })
    passed.add({ functionKey: 'worker', reason: 'late' })
    expect(timers.live()).toBe(1)
    await waitFor(() => written.length === 2)
    expect(written).toEqual([
      [
        'invocation.passed_through',
        { function: 'api', count: 2, reason: 'paced' },
      ],
      [
        'invocation.passed_through',
        { function: 'worker', count: 1, reason: 'late' },
      ],
    ])
    passed.add({ reason: 'clock_off' })
    passed.stop()
    expect(written[2]).toEqual([
      'invocation.passed_through',
      { function: undefined, count: 1, reason: 'clock_off' },
    ])
    expect(timers.live()).toBe(0)
  })
})
