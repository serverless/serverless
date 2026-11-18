import { afterEach, describe, expect, jest, test } from '@jest/globals'
import {
  getColorSettingsForTests,
  setColorSettingsForTests,
  stringToSafeColor,
  style,
} from '@serverless/util/src/logger/index.js'
import {
  DETAIL_BODY_BYTES,
  SLOW_REQUEST_MS,
  createRequestOutput,
  recordingWith,
} from '../../../../../../../lib/plugins/aws/dev/web/request-output.js'
import { manualClock } from '../relay/manual-clock.js'

// Every test runs without colour unless it turns colour on; each puts the logger's level back.
const colorSettings = getColorSettingsForTests()
afterEach(() => setColorSettingsForTests(colorSettings))
const withoutColor = () =>
  setColorSettingsForTests({ chalkLevel: 0, colorSupportLevel: 0 })
const withColor = () =>
  setColorSettingsForTests({ chalkLevel: 3, colorSupportLevel: 3 })

const ID = '3f2a9c1e-5b7d-4f0e-9a1c-0d2e3f4a5b6c'
const OTHER = '77e0b3aa-0000-4000-8000-000000000000'

const capture = (options = {}) => {
  withoutColor()
  const lines = []
  const idle = jest.fn()
  const clock = manualClock(1_000)
  const output = createRequestOutput({
    write: (line) => lines.push(line),
    idle,
    now: clock.now,
    timers: clock.timers,
    ...options,
  })
  return { output, lines, idle, clock }
}

describe('createRequestOutput', () => {
  test('a relayed request prints one line, when it ends: method, path, status, duration', () => {
    const { output, lines, clock } = capture()
    output.start({ id: ID, key: 'api', method: 'GET', path: '/orders' })
    expect(lines).toEqual([])
    output.end({
      id: ID,
      key: 'api',
      durationMs: 21,
      outcome: 'answered',
      status: 200,
    })
    expect(lines).toEqual(['← web api ── GET /orders (200) 21ms · 3f2a9c1e'])
    expect(clock.live()).toBe(0)
  })

  test.each([['local'], ['replay']])(
    'a %s request names its source',
    (source) => {
      const { output, lines } = capture()
      output.start({
        id: ID,
        key: 'api',
        method: 'POST',
        path: '/orders',
        source,
      })
      output.end({
        id: ID,
        key: 'api',
        durationMs: 1400,
        outcome: 'answered',
        status: 201,
      })
      expect(lines).toEqual([
        `← web api ── POST /orders (201) 1.4s · ${source} · 3f2a9c1e`,
      ])
    },
  )

  test(`a request still running after ${SLOW_REQUEST_MS} ms gets an arrival line then`, async () => {
    const { output, lines, clock } = capture()
    output.start({ id: ID, key: 'api', method: 'GET', path: '/events' })
    await clock.advance(SLOW_REQUEST_MS - 1)
    expect(lines).toEqual([])
    await clock.advance(1)
    expect(lines).toEqual(['→ web api ── GET /events · 3f2a9c1e'])
    output.end({ id: ID, key: 'api', outcome: 'answered', status: 200 })
    expect(lines[1]).toBe('← web api ── GET /events (200) 1.0s · 3f2a9c1e')
    expect(clock.live()).toBe(0)
  })

  test('a local request still running names its source on its arrival line', async () => {
    const { output, lines, clock } = capture()
    output.start({
      id: ID,
      key: 'api',
      method: 'GET',
      path: '/',
      source: 'local',
    })
    await clock.advance(SLOW_REQUEST_MS)
    expect(lines).toEqual(['→ web api ── GET / · local · 3f2a9c1e'])
  })

  test('a relayed request the deployed code answered says so', () => {
    const { output, lines } = capture()
    output.start({ id: ID, key: 'api', method: 'GET', path: '/' })
    output.end({
      id: ID,
      key: 'api',
      durationMs: 3,
      outcome: 'not_run',
      status: null,
      reason: 'its local server could not be reached (ECONNREFUSED)',
    })
    expect(lines).toEqual([
      '← web api ── GET / (deployed code) ── its local server could not be reached (ECONNREFUSED) 3ms · 3f2a9c1e',
    ])
  })

  test('a local request that did not run says not run, whatever status the listener sent', () => {
    const { output, lines } = capture()
    output.start({
      id: ID,
      key: 'api',
      method: 'GET',
      path: '/',
      source: 'local',
    })
    output.end({
      id: ID,
      key: 'api',
      durationMs: 1,
      outcome: 'not_run',
      status: 503,
      reason: 'web app api is not running on this machine',
    })
    expect(lines).toEqual([
      '← web api ── GET / (not run) ── web app api is not running on this machine 1ms · local · 3f2a9c1e',
    ])
  })

  test('a failed request shows its mark, its status when one came, and why', () => {
    const { output, lines } = capture()
    output.start({ id: ID, key: 'api', method: 'GET', path: '/a' })
    output.end({
      id: ID,
      key: 'api',
      durationMs: 4,
      outcome: 'failed',
      status: 502,
      reason: 'ECONNRESET',
    })
    output.start({ id: OTHER, key: 'api', method: 'GET', path: '/b' })
    output.end({ id: OTHER, key: 'api', durationMs: 5, outcome: 'failed' })
    expect(lines).toEqual([
      '← web api ── GET /a ✕ (502) ECONNRESET 4ms · 3f2a9c1e',
      '← web api ── GET /b ✕ failed 5ms · 77e0b3aa',
    ])
  })

  test('the path is shown as the record keeps it: signed query values redacted', () => {
    const { output, lines } = capture()
    output.start({
      id: ID,
      key: 'api',
      method: 'get',
      path: '/file?X-Amz-Signature=abc&page=2',
    })
    output.end({
      id: ID,
      key: 'api',
      durationMs: 1,
      outcome: 'answered',
      status: 200,
    })
    expect(lines[0]).toBe(
      '← web api ── GET /file?X-Amz-Signature=[redacted]&page=2 (200) 1ms · 3f2a9c1e',
    )
  })

  test('control characters and line breaks in the method and path are not printed', () => {
    const { output, lines } = capture()
    output.start({
      id: ID,
      key: 'api',
      method: 'GET',
      path: '/a\u001b[2J\nb',
    })
    output.end({
      id: ID,
      key: 'api',
      durationMs: 1,
      outcome: 'answered',
      status: 200,
    })
    expect(lines[0]).toBe('← web api ── GET /a b (200) 1ms · 3f2a9c1e')
  })

  test('the credentials request of a --local-only web app is never shown', async () => {
    const { output, lines, idle, clock } = capture()
    output.start({
      id: ID,
      key: 'api',
      method: 'GET',
      path: '/__serverless-dev/credentials?x=1',
      source: 'local',
    })
    await clock.advance(SLOW_REQUEST_MS)
    output.end({
      id: ID,
      key: 'api',
      durationMs: 1,
      outcome: 'answered',
      status: 204,
    })
    expect(lines).toEqual([])
    expect(idle).not.toHaveBeenCalled()
  })

  test('an end without a start prints nothing', () => {
    const { output, lines } = capture()
    output.end({
      id: ID,
      key: 'api',
      durationMs: 1,
      outcome: 'answered',
      status: 200,
    })
    expect(lines).toEqual([])
  })

  test('the duration counts from the start when the end names none', async () => {
    const { output, lines, clock } = capture()
    output.start({ id: ID, key: 'api', method: 'GET', path: '/' })
    await clock.advance(250)
    output.end({ id: ID, key: 'api', outcome: 'answered', status: 200 })
    expect(lines[0]).toBe('← web api ── GET / (200) 250ms · 3f2a9c1e')
  })

  test('no blank line goes between requests; idle once none runs', () => {
    const { output, lines, idle } = capture()
    output.start({ id: ID, key: 'api', method: 'GET', path: '/a' })
    output.start({ id: OTHER, key: 'api', method: 'GET', path: '/b' })
    output.end({
      id: ID,
      key: 'api',
      durationMs: 1,
      outcome: 'answered',
      status: 200,
    })
    expect(idle).not.toHaveBeenCalled()
    output.end({
      id: OTHER,
      key: 'api',
      durationMs: 1,
      outcome: 'answered',
      status: 200,
    })
    expect(idle).toHaveBeenCalledTimes(1)
    output.start({ id: ID, key: 'api', method: 'GET', path: '/c' })
    output.end({
      id: ID,
      key: 'api',
      durationMs: 1,
      outcome: 'answered',
      status: 200,
    })
    expect(lines).toEqual([
      '← web api ── GET /a (200) 1ms · 3f2a9c1e',
      '← web api ── GET /b (200) 1ms · 77e0b3aa',
      '← web api ── GET /c (200) 1ms · 3f2a9c1e',
    ])
    expect(lines.some((line) => line.trim() === '')).toBe(false)
  })

  test('within the terminal width the path gives way first, never the status, duration or id', () => {
    const { output, lines } = capture({ width: () => 45 })
    output.start({
      id: ID,
      key: 'api',
      method: 'GET',
      path: '/orders/2026/10/27/items?page=2&sort=desc',
    })
    output.end({
      id: ID,
      key: 'api',
      durationMs: 1,
      outcome: 'answered',
      status: 200,
    })
    expect(lines[0]).toBe('← web api ── GET /orde… (200) 1ms · 3f2a9c1e')
    expect(lines[0]).toHaveLength(44)
  })

  test('within the terminal width the arrival line keeps within it too', async () => {
    const { output, lines, clock } = capture({ width: () => 40 })
    output.start({
      id: ID,
      key: 'api',
      method: 'GET',
      path: '/orders/2026/10/27/items?page=2&sort=desc',
    })
    await clock.advance(SLOW_REQUEST_MS)
    expect(lines[0]).toBe('→ web api ── GET /orders/20… · 3f2a9c1e')
    expect(lines[0]).toHaveLength(39)
  })

  test('within the terminal width the reason takes what the path leaves, never the duration or id', () => {
    const { output, lines } = capture({ width: () => 60 })
    output.start({ id: ID, key: 'api', method: 'GET', path: '/' })
    output.end({
      id: ID,
      key: 'api',
      durationMs: 3,
      outcome: 'not_run',
      reason: 'its local server could not be reached (ECONNREFUSED)',
    })
    expect(lines[0]).toBe(
      '← web api ── GET / (deployed code) ── its l… 3ms · 3f2a9c1e',
    )
    expect(lines[0]).toHaveLength(59)
  })

  test('a failed request keeps its mark when nothing else fits', () => {
    const { output, lines } = capture({ width: () => 30 })
    output.start({ id: ID, key: 'api', method: 'GET', path: '/a' })
    output.end({
      id: ID,
      key: 'api',
      durationMs: 4,
      outcome: 'failed',
      reason: 'ECONNRESET',
    })
    expect(lines[0]).toContain('✕')
    expect(lines[0]).toContain('4ms · 3f2a9c1e')
  })

  test('detailed output shows the path in full', () => {
    const { output, lines } = capture({ width: () => 40, detailed: () => true })
    const path = '/orders/2026/10/27/items?page=2&sort=desc'
    output.start({ id: ID, key: 'api', method: 'GET', path })
    output.end({
      id: ID,
      key: 'api',
      durationMs: 1,
      outcome: 'answered',
      status: 200,
    })
    expect(lines[0]).toBe(`← web api ── GET ${path} (200) 1ms · 3f2a9c1e`)
  })

  test("detailed output shows the request's headers, its body and the response under the line, redacted", () => {
    const { output, lines } = capture({ detailed: () => true })
    output.start({
      id: ID,
      key: 'api',
      method: 'POST',
      path: '/orders',
      headers: { authorization: 'Bearer secret-token', accept: 'text/html' },
    })
    output.note({
      id: ID,
      requestBody: { head: Buffer.from('{"item":1}'), bytes: 10 },
    })
    output.note({
      id: ID,
      response: {
        status: 201,
        headers: {
          'set-cookie': 'session=secret-cookie',
          'content-type': 'text/plain',
        },
      },
    })
    const long = Buffer.alloc(5000, 'a')
    output.note({ id: ID, responseBody: { head: long, bytes: 9000 } })
    output.end({
      id: ID,
      key: 'api',
      durationMs: 4,
      outcome: 'answered',
      status: 201,
    })
    expect(lines[0]).toBe('← web api ── POST /orders (201) 4ms · 3f2a9c1e')
    expect(lines[1]).toContain("accept: 'text/html'")
    expect(lines[1]).toContain(`body: '{"item":1}'`)
    expect(lines[1]).toContain('status_code: 201')
    expect(lines[1]).toContain("'content-type': 'text/plain'")
    expect(lines[1]).toContain('body_bytes: 9000')
    expect(lines[1]).toContain('body_truncated: true')
    expect(lines[1]).toContain(`'${'a'.repeat(DETAIL_BODY_BYTES)}'`)
    expect(lines.join('\n')).not.toContain('secret-')
    expect(lines).toHaveLength(2)
  })

  test('without detailed output, nothing more than the one line; a request not run shows no response', () => {
    const plain = capture()
    plain.output.start({
      id: ID,
      key: 'api',
      method: 'GET',
      path: '/',
      headers: { a: '1' },
    })
    plain.output.note({ id: ID, response: { status: 200, headers: {} } })
    plain.output.end({
      id: ID,
      key: 'api',
      durationMs: 1,
      outcome: 'answered',
      status: 200,
    })
    expect(plain.lines).toHaveLength(1)
    const detailed = capture({ detailed: () => true })
    detailed.output.start({ id: ID, key: 'api', method: 'GET', path: '/' })
    detailed.output.end({
      id: ID,
      key: 'api',
      durationMs: 1,
      outcome: 'not_run',
      status: null,
    })
    expect(detailed.lines).toHaveLength(1)
  })

  test("with colour, the arrow takes the request's colour and a success status is green", () => {
    const lines = []
    const output = createRequestOutput({
      write: (line) => lines.push(line),
    })
    withColor()
    output.start({ id: ID, key: 'api', method: 'GET', path: '/' })
    output.end({
      id: ID,
      key: 'api',
      durationMs: 2,
      outcome: 'answered',
      status: 200,
    })
    const hue = stringToSafeColor(ID)
    expect(lines).toEqual([
      `${hue('←')} web api ── GET / ${style.success('(200)')} ${style.aside('2ms · 3f2a9c1e')}`,
    ])
  })
})

describe('recordingWith', () => {
  const fakeRecorder = () => ({
    captureBytes: 1024,
    start: jest.fn(),
    note: jest.fn(),
    end: jest.fn(),
    whenEnded: jest.fn(),
  })

  test('tells the output and the recorder each start and end, and passes notes to the recorder', () => {
    const recorder = fakeRecorder()
    const output = { start: jest.fn(), end: jest.fn(), note: jest.fn() }
    const both = recordingWith(recorder, output)
    expect(both.captureBytes).toBe(1024)
    const start = { id: ID, key: 'api', method: 'GET', path: '/' }
    both.start(start)
    both.note({ id: ID, headers: {} })
    both.end({ id: ID, key: 'api', outcome: 'answered', status: 200 })
    expect(output.start).toHaveBeenCalledWith(start)
    expect(recorder.start).toHaveBeenCalledWith(start)
    expect(recorder.note).toHaveBeenCalledWith({ id: ID, headers: {} })
    // The output hears the notes too, for detailed output.
    expect(output.note).toHaveBeenCalledWith({ id: ID, headers: {} })
    expect(output.end).toHaveBeenCalledTimes(1)
    expect(recorder.end).toHaveBeenCalledTimes(1)
  })

  test('an output that throws never stops the record', () => {
    const recorder = fakeRecorder()
    const both = recordingWith(recorder, {
      start: () => {
        throw new Error('EPIPE')
      },
      end: () => {
        throw new Error('EPIPE')
      },
    })
    both.start({ id: ID, key: 'api' })
    both.end({ id: ID, key: 'api' })
    expect(recorder.start).toHaveBeenCalledTimes(1)
    expect(recorder.end).toHaveBeenCalledTimes(1)
  })

  test('without a recorder, only the output hears; nothing asks for bodies', () => {
    const output = { start: jest.fn(), end: jest.fn() }
    const both = recordingWith(null, output)
    expect(both.captureBytes).toBeUndefined()
    expect(both.note).toBeUndefined()
    both.start({ id: ID, key: 'api' })
    both.end({ id: ID, key: 'api' })
    expect(output.start).toHaveBeenCalledTimes(1)
    expect(output.end).toHaveBeenCalledTimes(1)
  })
})
