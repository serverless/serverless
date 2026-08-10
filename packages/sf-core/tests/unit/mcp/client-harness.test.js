import {
  createMcpChecks,
  createMcpClient,
} from '../../integration/mcp/lib/client.mjs'

// The harness itself is exercised live by tests/integration/mcp/*. What is
// unit-testable — and what this file covers — is the pure branch logic layered
// on top of the vendored client: bearer-header injection, the SSE frame parser,
// which checks a given variant runs, and the long-stream timing verdicts —
// replayed against a scripted clock, so the ~36s cases cost milliseconds here.
//
// There is nothing here about rejections: enforcement is the user's, so how a
// request is refused belongs to the deployment that configured the refusal
// (`../../integration/mcp/mcp-auth.test.js`), not to this list.

const ENDPOINT =
  'https://abc123.execute-api.us-east-1.amazonaws.com/dev/crm/mcp'

let calls
let originalFetch
let originalDateNow

/** Records every request and answers with what `impl` returns. */
const stubFetch = (impl) => {
  calls = []
  globalThis.fetch = async (input, init) => {
    const call = { url: String(input), init, headers: init?.headers ?? {} }
    calls.push(call)
    return impl(call)
  }
}

const jsonResponse = (payload, init = {}) =>
  new Response(JSON.stringify(payload), {
    status: init.status ?? 200,
    headers: { 'content-type': 'application/json', ...init.headers },
  })

/** A text/event-stream body delivered as the given raw chunks. */
const sseResponse = (chunks) =>
  new Response(
    new ReadableStream({
      start(controller) {
        const encoder = new TextEncoder()
        for (const chunk of chunks) controller.enqueue(encoder.encode(chunk))
        controller.close()
      },
    }),
    { status: 200, headers: { 'content-type': 'text/event-stream' } },
  )

/**
 * An SSE body that trickles `chunks` and then stays open forever, and that
 * errors the way `fetch` does when the request's signal is aborted.
 */
const abortableSseResponse = (signal, chunks, intervalMs = 2) =>
  new Response(
    new ReadableStream({
      start(controller) {
        const encoder = new TextEncoder()
        let i = 0
        const push = () => {
          if (signal?.aborted || i >= chunks.length) return
          controller.enqueue(encoder.encode(chunks[i++]))
          setTimeout(push, intervalMs)
        }
        push()
        signal?.addEventListener(
          'abort',
          () =>
            controller.error(
              Object.assign(new Error('aborted'), { name: 'AbortError' }),
            ),
          { once: true },
        )
      },
    }),
    { status: 200, headers: { 'content-type': 'text/event-stream' } },
  )

const LONG_STEPS = 45

/** The 45 progress frames plus the final result, as the fixture streams them. */
const longStreamFrames = () => [
  ...Array.from(
    { length: LONG_STEPS },
    (_, i) =>
      `data: ${JSON.stringify({
        jsonrpc: '2.0',
        method: 'notifications/progress',
        params: { progress: i + 1, total: LONG_STEPS },
      })}\n\n`,
  ),
  `data: ${JSON.stringify({
    jsonrpc: '2.0',
    id: 1,
    result: {
      content: [{ type: 'text', text: `completed ${LONG_STEPS} steps` }],
    },
  })}\n\n`,
]

/**
 * Replays the ~36s long stream instantly. `Date.now` hands out
 * `[0, ...eventTimes, endMs]` in call order — exactly the order the client asks
 * for it (t0, once per parsed frame, then the total) — so the long checks see
 * the timings a live call would produce without waiting 36 seconds for them.
 * `firstEventAt` is the whole point: ~800ms is incremental delivery, ~35000ms is
 * a stream buffered until the end.
 */
const stubLongStream = ({ firstEventAt, endMs }) => {
  const frames = longStreamFrames()
  const spacing = (endMs - 400 - firstEventAt) / (frames.length - 1)
  const timeline = [
    0,
    ...frames.map((_, i) => Math.round(firstEventAt + i * spacing)),
    endMs,
  ]
  let i = 0
  Date.now = () => timeline[Math.min(i++, timeline.length - 1)]
  stubFetch(() => sseResponse(frames))
}

const findCheck = (checks, name) => {
  const check = checks.find((c) => c.name === name)
  if (!check) throw new Error(`no check named ${name} in ${names(checks)}`)
  return check
}
const names = (checks) => checks.map((c) => c.name).join(', ')

beforeEach(() => {
  originalFetch = globalThis.fetch
  originalDateNow = Date.now
})
afterEach(() => {
  globalThis.fetch = originalFetch
  Date.now = originalDateNow
})

describe('createMcpClient request building', () => {
  test('injects the bearer token on every request', async () => {
    stubFetch(() => jsonResponse({ result: {} }))
    const client = createMcpClient({ endpoint: ENDPOINT, bearerToken: 'tok-a' })

    await client.request({ method: 'tools/list' })
    await client.request({ method: 'tools/call', name: 'add' })

    expect(calls).toHaveLength(2)
    for (const call of calls) {
      expect(call.headers.authorization).toBe('Bearer tok-a')
    }
  })

  test('sends no authorization header when no token is configured', async () => {
    stubFetch(() => jsonResponse({ result: {} }))
    const client = createMcpClient({ endpoint: ENDPOINT })

    await client.request({ method: 'tools/list' })

    expect(calls[0].headers.authorization).toBeUndefined()
  })

  test('a per-call token of null opts out of the configured token', async () => {
    stubFetch(() => jsonResponse({ result: {} }))
    const client = createMcpClient({ endpoint: ENDPOINT, bearerToken: 'tok-a' })

    await client.request({ method: 'tools/list', token: null })

    expect(calls[0].headers.authorization).toBeUndefined()
  })

  test('carries the 2026-07-28 envelope in headers and _meta', async () => {
    stubFetch(() => jsonResponse({ result: {} }))
    const client = createMcpClient({ endpoint: ENDPOINT })

    await client.request({
      method: 'resources/read',
      params: { uri: 'guide://usage' },
      name: 'guide://usage',
    })

    const { headers, body } = calls[0].init
    expect(headers['mcp-protocol-version']).toBe('2026-07-28')
    expect(headers['mcp-method']).toBe('resources/read')
    expect(headers['mcp-name']).toBe('guide://usage')
    expect(headers.accept).toBe('application/json, text/event-stream')
    const parsed = JSON.parse(body)
    expect(parsed.params.uri).toBe('guide://usage')
    expect(parsed.params._meta['io.modelcontextprotocol/protocolVersion']).toBe(
      '2026-07-28',
    )
  })

  test('headerMethod overrides mcp-method without touching the body', async () => {
    stubFetch(() => jsonResponse({ result: {} }))
    const client = createMcpClient({ endpoint: ENDPOINT })

    await client.request({
      method: 'tools/call',
      params: { name: 'add' },
      headerMethod: 'tools/list',
    })

    expect(calls[0].init.headers['mcp-method']).toBe('tools/list')
    expect(JSON.parse(calls[0].init.body).method).toBe('tools/call')
  })

  test('envelope: false sends the legacy shape — no mcp-* headers, no _meta', async () => {
    stubFetch(() => jsonResponse({ result: {} }))
    const client = createMcpClient({ endpoint: ENDPOINT })

    await client.request({
      method: 'initialize',
      params: { protocolVersion: '2025-06-18' },
      envelope: false,
    })

    const { headers, body } = calls[0].init
    expect(headers['mcp-protocol-version']).toBeUndefined()
    expect(headers['mcp-method']).toBeUndefined()
    expect(JSON.parse(body).params._meta).toBeUndefined()
  })

  test('rawGet carries the bearer token and the streaming accept header', async () => {
    stubFetch(() => new Response('', { status: 405 }))
    const client = createMcpClient({ endpoint: ENDPOINT, bearerToken: 'tok-a' })

    const res = await client.rawGet()

    expect(res.status).toBe(405)
    expect(calls[0].url).toBe(ENDPOINT)
    expect(calls[0].init.method).toBe('GET')
    expect(calls[0].headers.authorization).toBe('Bearer tok-a')
    expect(calls[0].headers.accept).toBe('application/json, text/event-stream')
  })

  test('rawGet resolves an absolute path against the endpoint origin', async () => {
    stubFetch(() => new Response('', { status: 403 }))
    const client = createMcpClient({ endpoint: ENDPOINT, bearerToken: 'tok-a' })

    await client.rawGet({
      path: '/.well-known/oauth-protected-resource',
      token: null,
    })

    expect(calls[0].url).toBe(
      'https://abc123.execute-api.us-east-1.amazonaws.com/.well-known/oauth-protected-resource',
    )
    expect(calls[0].headers.authorization).toBeUndefined()
  })

  test('refuses to combine sigv4 with a bearer token', () => {
    expect(() =>
      createMcpClient({
        endpoint: ENDPOINT,
        auth: 'sigv4',
        bearerToken: 'tok-a',
      }),
    ).toThrow(/signer overwrites the Authorization header/)
  })

  test('parses SSE frames split across chunks and returns the last as json', async () => {
    const progress = (i) =>
      JSON.stringify({
        method: 'notifications/progress',
        params: { progress: i },
      })
    const final = JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      result: { ok: true },
    })
    stubFetch(() =>
      sseResponse([
        `event: message\ndata: ${progress(1)}\n\nevent: message\ndata: ${progress(2)}`,
        `\n\nevent: message\ndata: ${final}\n\n`,
      ]),
    )
    const client = createMcpClient({ endpoint: ENDPOINT })

    const r = await client.request({
      method: 'tools/call',
      name: 'slow_report',
    })

    expect(r.contentType).toContain('text/event-stream')
    expect(r.events).toHaveLength(3)
    expect(r.events.map((e) => e.data.method)).toEqual([
      'notifications/progress',
      'notifications/progress',
      undefined,
    ])
    expect(r.events.every((e) => typeof e.t === 'number')).toBe(true)
    expect(r.json.result.ok).toBe(true)
  })
})

describe('abortMidStream', () => {
  const frame = (i) =>
    `data: ${JSON.stringify({ method: 'notifications/progress', params: { progress: i } })}\n\n`

  test('hangs up mid-stream and returns what arrived first', async () => {
    stubFetch((call) =>
      abortableSseResponse(call.init.signal, [frame(1), frame(2)]),
    )
    const client = createMcpClient({ endpoint: ENDPOINT })

    const result = await client.abortMidStream({
      method: 'tools/call',
      params: { name: 'slow_report' },
      name: 'slow_report',
      afterMs: 40,
    })

    expect(result.events.length).toBeGreaterThan(0)
    expect(result.events[0].data.method).toBe('notifications/progress')
    expect(result.abortedAfterMs).toBeGreaterThanOrEqual(0)
  })

  test('fails loudly when the call finishes before the hang-up', async () => {
    stubFetch(() => sseResponse([frame(1)]))
    const client = createMcpClient({ endpoint: ENDPOINT })

    await expect(
      client.abortMidStream({ method: 'tools/call', afterMs: 5000 }),
    ).rejects.toThrow(/instead of being aborted/)
  })
})

describe('createMcpChecks gating', () => {
  test('an unauthenticated variant runs the 12 base checks only', () => {
    const checks = createMcpChecks({ endpoint: ENDPOINT })

    expect(checks).toHaveLength(12)
    expect(checks.map((c) => c.name)).toEqual([
      'toolsList',
      'addPlainJson',
      'slowReportStream',
      'elicitationRoundTrip',
      'resourcesListAndRead',
      'resourceTemplate',
      'prompts',
      'serverDiscover',
      'legacyInitialize',
      'getReturns405',
      'headerMethodMismatch',
      'missingElicitationCapability',
    ])
  })

  test('longRunning adds the two ~36s cases and antiBuffering', () => {
    const checks = createMcpChecks({ endpoint: ENDPOINT, longRunning: true })

    expect(checks.map((c) => c.name).slice(12)).toEqual([
      'longStream',
      'longSilent',
      'antiBuffering',
    ])
  })

  test('a bearer token adds no checks — it only rides on the requests', () => {
    const checks = createMcpChecks({ endpoint: ENDPOINT, bearerToken: 'tok-a' })

    expect(checks).toHaveLength(12)
  })

  test('titles are numbered in insertion order, gapless, for every config combo', () => {
    const combos = [
      { endpoint: ENDPOINT },
      { endpoint: ENDPOINT, longRunning: true },
      { endpoint: ENDPOINT, bearerToken: 'tok-a' },
      { endpoint: ENDPOINT, bearerToken: 'tok-a', longRunning: true },
    ]

    for (const config of combos) {
      const checks = createMcpChecks(config)
      expect(checks.map((c) => c.title.match(/^(\d+)\. /)?.[1])).toEqual(
        checks.map((_, i) => String(i + 1)),
      )
    }
  })

  test('every check has a unique name, a title and a callable run', () => {
    const checks = createMcpChecks({
      endpoint: ENDPOINT,
      bearerToken: 'tok-a',
      longRunning: true,
    })

    expect(new Set(checks.map((c) => c.name)).size).toBe(checks.length)
    for (const check of checks) {
      expect(typeof check.title).toBe('string')
      expect(typeof check.run).toBe('function')
    }
  })
})

describe('the antiBuffering check', () => {
  const longChecks = () =>
    createMcpChecks({ endpoint: ENDPOINT, longRunning: true })

  test('passes on an incrementally delivered stream it measures itself', async () => {
    stubLongStream({ firstEventAt: 800, endMs: 36400 })

    const detail = await findCheck(longChecks(), 'antiBuffering').run()

    expect(calls).toHaveLength(1)
    expect(detail).toContain('+800ms')
  })

  test('fails when the first event lands with the rest, at the end of the call', async () => {
    stubLongStream({ firstEventAt: 35000, endMs: 35800 })

    await expect(
      findCheck(longChecks(), 'antiBuffering').run(),
    ).rejects.toThrow(
      /first progress event arrived at \+35000ms of a 35800ms call .* the stream is being buffered/,
    )
  })

  test('reuses the longStream observation instead of paying for a second ~36s call', async () => {
    stubLongStream({ firstEventAt: 800, endMs: 36400 })
    const checks = longChecks()

    const longDetail = await findCheck(checks, 'longStream').run()
    expect(longDetail).toContain('45 events')
    expect(calls).toHaveLength(1)

    const detail = await findCheck(checks, 'antiBuffering').run()

    expect(calls).toHaveLength(1)
    expect(detail).toContain('+800ms')
  })
})
