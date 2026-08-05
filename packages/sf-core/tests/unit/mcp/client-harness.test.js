import {
  createMcpChecks,
  createMcpClient,
} from '../../integration/mcp/lib/client.mjs'

// The harness itself is exercised live by tests/integration/mcp/*. What is
// unit-testable — and what this file covers — is the pure branch logic layered
// on top of the vendored client: bearer-header injection, the SSE frame
// parser, which checks a given variant runs, the negative checks' handling of
// the challenge header under either name, and the long-stream timing verdicts —
// replayed against a scripted clock, so the ~36s cases cost milliseconds here.

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

  test('a bearer token adds the auth negatives', () => {
    const checks = createMcpChecks({ endpoint: ENDPOINT, bearerToken: 'tok-a' })

    expect(checks.map((c) => c.name).slice(12)).toEqual([
      'unauthenticated401',
      'discoveryRootProbe403',
    ])
  })

  test('a second token adds the wrong-client negative, last', () => {
    const checks = createMcpChecks({
      endpoint: ENDPOINT,
      bearerToken: 'tok-a',
      wrongClientToken: 'tok-b',
    })

    expect(checks.map((c) => c.name).slice(12)).toEqual([
      'unauthenticated401',
      'discoveryRootProbe403',
      'wrongClient401',
    ])
  })

  test('a wrong-client token alone adds nothing — the negatives need the bearer gate', () => {
    const checks = createMcpChecks({
      endpoint: ENDPOINT,
      wrongClientToken: 'tok-b',
    })

    expect(checks).toHaveLength(12)
    expect(checks.map((c) => c.name)).not.toContain('wrongClient401')
    expect(checks.map((c) => c.name)).not.toContain('unauthenticated401')
  })

  test('titles are numbered in insertion order, gapless, for every config combo', () => {
    const combos = [
      { endpoint: ENDPOINT },
      { endpoint: ENDPOINT, longRunning: true },
      { endpoint: ENDPOINT, bearerToken: 'tok-a' },
      { endpoint: ENDPOINT, bearerToken: 'tok-a', wrongClientToken: 'tok-b' },
      {
        endpoint: ENDPOINT,
        bearerToken: 'tok-a',
        wrongClientToken: 'tok-b',
        longRunning: true,
      },
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
      wrongClientToken: 'tok-b',
      longRunning: true,
    })

    expect(new Set(checks.map((c) => c.name)).size).toBe(checks.length)
    for (const check of checks) {
      expect(typeof check.title).toBe('string')
      expect(typeof check.run).toBe('function')
    }
  })
})

describe('the unauthenticated401 check', () => {
  const challenge = (metadataUrl) => `Bearer resource_metadata="${metadataUrl}"`
  const metadataUrl =
    'https://abc123.execute-api.us-east-1.amazonaws.com/dev/.well-known/oauth-protected-resource/crm/mcp'

  const run = async (responseFactory) => {
    stubFetch(responseFactory)
    const checks = createMcpChecks({ endpoint: ENDPOINT, bearerToken: 'tok-a' })
    return findCheck(checks, 'unauthenticated401').run()
  }

  test('accepts the remapped header under any casing and sends no token', async () => {
    const detail = await run(() =>
      jsonResponse(
        { message: 'Unauthorized' },
        {
          status: 401,
          headers: {
            'X-Amzn-Remapped-WWW-Authenticate': challenge(metadataUrl),
          },
        },
      ),
    )

    expect(calls[0].headers.authorization).toBeUndefined()
    expect(detail).toContain('401')
  })

  test('accepts the standard header name a non-remapping front door would send', async () => {
    const detail = await run(() =>
      jsonResponse(
        { message: 'Unauthorized' },
        {
          status: 401,
          headers: { 'WWW-Authenticate': challenge(metadataUrl) },
        },
      ),
    )

    expect(detail).toContain('www-authenticate')
    expect(detail).not.toContain('remapped')
  })

  test('fails when the request is not rejected', async () => {
    await expect(run(() => jsonResponse({ result: {} }))).rejects.toThrow(
      /HTTP 200/,
    )
  })

  test('fails, naming the remapped header, when no challenge arrives', async () => {
    await expect(
      run(() => jsonResponse({ message: 'Unauthorized' }, { status: 401 })),
    ).rejects.toThrow(/x-amzn-remapped-www-authenticate/i)
  })

  test('fails when resource_metadata is missing from the challenge', async () => {
    await expect(
      run(() =>
        jsonResponse(
          {},
          {
            status: 401,
            headers: { 'x-amzn-remapped-www-authenticate': 'Bearer' },
          },
        ),
      ),
    ).rejects.toThrow(/resource_metadata/)
  })

  test('fails when resource_metadata is not an https URL', async () => {
    await expect(
      run(() =>
        jsonResponse(
          {},
          {
            status: 401,
            headers: {
              'x-amzn-remapped-www-authenticate': challenge(
                'http://insecure.example.com/.well-known/oauth-protected-resource/crm/mcp',
              ),
            },
          },
        ),
      ),
    ).rejects.toThrow(/https/)
  })

  test('fails when resource_metadata does not point at the well-known path', async () => {
    await expect(
      run(() =>
        jsonResponse(
          {},
          {
            status: 401,
            headers: {
              'x-amzn-remapped-www-authenticate': challenge(
                'https://abc123.execute-api.us-east-1.amazonaws.com/dev/crm/mcp',
              ),
            },
          },
        ),
      ),
    ).rejects.toThrow(/well-known/)
  })
})

describe('the discoveryRootProbe403 check', () => {
  const run = async (responseFactory) => {
    stubFetch(responseFactory)
    const checks = createMcpChecks({ endpoint: ENDPOINT, bearerToken: 'tok-a' })
    return findCheck(checks, 'discoveryRootProbe403').run()
  }

  test('probes the origin-root well-known form and passes on 403', async () => {
    await run(() => jsonResponse({ message: 'Forbidden' }, { status: 403 }))

    expect(calls[0].url).toBe(
      'https://abc123.execute-api.us-east-1.amazonaws.com/.well-known/oauth-protected-resource/dev/crm/mcp',
    )
    expect(calls[0].headers.authorization).toBeUndefined()
  })

  test('fails when the probe unexpectedly succeeds', async () => {
    await expect(run(() => jsonResponse({ resource: 'x' }))).rejects.toThrow(
      /HTTP 200/,
    )
  })

  // The check exists to be loud the day the platform limitation lifts: a 200
  // means root-probe discovery works and the docs claiming it does not are
  // stale. A message that only said "expected 403" would read as a regression.
  test('says the root probe resolved, not merely that 403 was expected', async () => {
    await expect(run(() => jsonResponse({ resource: 'x' }))).rejects.toThrow(
      /the root probe resolved/,
    )
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

describe('the wrongClient401 check', () => {
  const run = async (responseFactory) => {
    stubFetch(responseFactory)
    const checks = createMcpChecks({
      endpoint: ENDPOINT,
      bearerToken: 'tok-a',
      wrongClientToken: 'tok-b',
    })
    return findCheck(checks, 'wrongClient401').run()
  }

  test('sends the second token and passes on 401', async () => {
    await run(() => jsonResponse({}, { status: 401 }))

    expect(calls[0].headers.authorization).toBe('Bearer tok-b')
  })

  test('fails when the wrong client is accepted', async () => {
    await expect(run(() => jsonResponse({ result: {} }))).rejects.toThrow(
      /HTTP 200/,
    )
  })
})
