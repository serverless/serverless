import {
  normalizeCorsConfig,
  buildCorsOptionsRoute,
  resolveAllowOrigin,
  applyCorsResponseHeaders,
} from '../../../../../../../../../lib/plugins/aws/offline/lib/app-server/shared/cors-options.js'

describe('normalizeCorsConfig', () => {
  it('expands true to AWS defaults', () => {
    expect(normalizeCorsConfig(true)).toEqual({
      origins: ['*'],
      headers: [
        'Content-Type',
        'X-Amz-Date',
        'Authorization',
        'X-Api-Key',
        'X-Amz-Security-Token',
        'X-Amz-User-Agent',
      ],
      methods: ['OPTIONS'],
      allowCredentials: false,
      maxAge: undefined,
      exposedHeaders: [],
    })
  })

  it('respects custom origin (string)', () => {
    const cfg = normalizeCorsConfig({ origin: 'https://example.com' })
    expect(cfg.origins).toEqual(['https://example.com'])
  })

  it('respects custom origins (array via origins)', () => {
    const cfg = normalizeCorsConfig({
      origins: ['https://a.com', 'https://b.com'],
    })
    expect(cfg.origins).toEqual(['https://a.com', 'https://b.com'])
  })

  it('respects custom headers and methods (OPTIONS auto-appended)', () => {
    const cfg = normalizeCorsConfig({
      headers: ['Authorization', 'X-Custom'],
      methods: ['GET', 'POST'],
    })
    expect(cfg.headers).toEqual(['Authorization', 'X-Custom'])
    expect(cfg.methods).toEqual(['GET', 'POST', 'OPTIONS'])
  })

  it('does NOT duplicate OPTIONS when caller already included it', () => {
    const cfg = normalizeCorsConfig({ methods: ['OPTIONS', 'GET'] })
    expect(cfg.methods).toEqual(['OPTIONS', 'GET'])
  })

  it('honors allowCredentials and maxAge', () => {
    const cfg = normalizeCorsConfig({
      allowCredentials: true,
      maxAge: 3600,
    })
    expect(cfg.allowCredentials).toBe(true)
    expect(cfg.maxAge).toBe(3600)
  })

  it('honors exposedHeaders', () => {
    const cfg = normalizeCorsConfig({
      exposedHeaders: ['X-Total-Count'],
    })
    expect(cfg.exposedHeaders).toEqual(['X-Total-Count'])
  })

  it('returns null when cors is false', () => {
    expect(normalizeCorsConfig(false)).toBeNull()
  })

  it('returns null when cors is undefined', () => {
    expect(normalizeCorsConfig(undefined)).toBeNull()
  })

  it('returns null when cors is null', () => {
    expect(normalizeCorsConfig(null)).toBeNull()
  })
})

describe('buildCorsOptionsRoute', () => {
  function fakeH() {
    const calls = { headers: [] }
    const builder = {
      code(c) {
        calls.statusCode = c
        return builder
      },
      header(name, value) {
        calls.headers.push({ name, value })
        return builder
      },
    }
    return {
      calls,
      response(p) {
        calls.payload = p
        return builder
      },
    }
  }

  function namedHeaders(calls) {
    return Object.fromEntries(
      calls.headers.map((x) => [x.name.toLowerCase(), x.value]),
    )
  }

  it('returns a Hapi route config for OPTIONS at the given path', () => {
    const cfg = normalizeCorsConfig(true)
    const route = buildCorsOptionsRoute({ path: '/dev/users', corsConfig: cfg })
    expect(route.method).toBe('OPTIONS')
    expect(route.path).toBe('/dev/users')
    expect(typeof route.handler).toBe('function')
  })

  it('responds 204 with no body', () => {
    const cfg = normalizeCorsConfig(true)
    const route = buildCorsOptionsRoute({ path: '/x', corsConfig: cfg })
    const h = fakeH()
    route.handler({ headers: { origin: 'https://example.com' } }, h)
    expect(h.calls.statusCode).toBe(204)
    expect(h.calls.payload).toBe('')
  })

  it('returns "*" for Allow-Origin under AWS defaults', () => {
    const cfg = normalizeCorsConfig(true)
    const route = buildCorsOptionsRoute({ path: '/x', corsConfig: cfg })
    const h = fakeH()
    route.handler({ headers: { origin: 'https://example.com' } }, h)
    expect(namedHeaders(h.calls)['access-control-allow-origin']).toBe('*')
  })

  it('returns AWS-default Allow-Headers list joined with commas', () => {
    const cfg = normalizeCorsConfig(true)
    const route = buildCorsOptionsRoute({ path: '/x', corsConfig: cfg })
    const h = fakeH()
    route.handler({ headers: {} }, h)
    expect(namedHeaders(h.calls)['access-control-allow-headers']).toBe(
      'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token,X-Amz-User-Agent',
    )
  })

  it('returns Allow-Methods including OPTIONS', () => {
    const cfg = normalizeCorsConfig({ methods: ['GET', 'POST'] })
    const route = buildCorsOptionsRoute({ path: '/x', corsConfig: cfg })
    const h = fakeH()
    route.handler({ headers: {} }, h)
    const methods = namedHeaders(h.calls)['access-control-allow-methods']
    expect(methods.split(',')).toEqual(['GET', 'POST', 'OPTIONS'])
  })

  it('echoes the request origin when origin is "*" and credentials true', () => {
    const cfg = normalizeCorsConfig({ origin: '*', allowCredentials: true })
    const route = buildCorsOptionsRoute({ path: '/x', corsConfig: cfg })
    const h = fakeH()
    route.handler({ headers: { origin: 'https://example.com' } }, h)
    expect(namedHeaders(h.calls)['access-control-allow-origin']).toBe(
      'https://example.com',
    )
    expect(namedHeaders(h.calls)['access-control-allow-credentials']).toBe(
      'true',
    )
  })

  it('falls back to "*" when credentials true but request has no origin header', () => {
    const cfg = normalizeCorsConfig({ origin: '*', allowCredentials: true })
    const route = buildCorsOptionsRoute({ path: '/x', corsConfig: cfg })
    const h = fakeH()
    route.handler({ headers: {} }, h)
    expect(namedHeaders(h.calls)['access-control-allow-origin']).toBe('*')
  })

  it('omits Allow-Credentials when allowCredentials is false', () => {
    const cfg = normalizeCorsConfig(true)
    const route = buildCorsOptionsRoute({ path: '/x', corsConfig: cfg })
    const h = fakeH()
    route.handler({ headers: { origin: 'https://example.com' } }, h)
    expect(
      namedHeaders(h.calls)['access-control-allow-credentials'],
    ).toBeUndefined()
  })

  it('includes Max-Age when set, omits when undefined', () => {
    const cfgWith = normalizeCorsConfig({ maxAge: 3600 })
    const routeWith = buildCorsOptionsRoute({
      path: '/x',
      corsConfig: cfgWith,
    })
    const hWith = fakeH()
    routeWith.handler({ headers: {} }, hWith)
    expect(namedHeaders(hWith.calls)['access-control-max-age']).toBe('3600')

    const cfgWithout = normalizeCorsConfig(true)
    const routeWithout = buildCorsOptionsRoute({
      path: '/x',
      corsConfig: cfgWithout,
    })
    const hWithout = fakeH()
    routeWithout.handler({ headers: {} }, hWithout)
    expect(
      namedHeaders(hWithout.calls)['access-control-max-age'],
    ).toBeUndefined()
  })

  it('includes Expose-Headers when set, omits when empty', () => {
    const cfgWith = normalizeCorsConfig({ exposedHeaders: ['X-Total-Count'] })
    const routeWith = buildCorsOptionsRoute({
      path: '/x',
      corsConfig: cfgWith,
    })
    const hWith = fakeH()
    routeWith.handler({ headers: {} }, hWith)
    expect(namedHeaders(hWith.calls)['access-control-expose-headers']).toBe(
      'X-Total-Count',
    )

    const cfgWithout = normalizeCorsConfig(true)
    const routeWithout = buildCorsOptionsRoute({
      path: '/x',
      corsConfig: cfgWithout,
    })
    const hWithout = fakeH()
    routeWithout.handler({ headers: {} }, hWithout)
    expect(
      namedHeaders(hWithout.calls)['access-control-expose-headers'],
    ).toBeUndefined()
  })

  it('echoes the request origin when in the allow-list', () => {
    const cfg = normalizeCorsConfig({
      origins: ['https://a.com', 'https://b.com'],
    })
    const route = buildCorsOptionsRoute({ path: '/x', corsConfig: cfg })
    const h = fakeH()
    route.handler({ headers: { origin: 'https://b.com' } }, h)
    expect(namedHeaders(h.calls)['access-control-allow-origin']).toBe(
      'https://b.com',
    )
  })

  it('returns the first configured origin when request origin not in list', () => {
    const cfg = normalizeCorsConfig({
      origins: ['https://a.com', 'https://b.com'],
    })
    const route = buildCorsOptionsRoute({ path: '/x', corsConfig: cfg })
    const h = fakeH()
    route.handler({ headers: { origin: 'https://evil.com' } }, h)
    expect(namedHeaders(h.calls)['access-control-allow-origin']).toBe(
      'https://a.com',
    )
  })
})

describe('resolveAllowOrigin', () => {
  it('returns "*" under AWS defaults', () => {
    const cfg = normalizeCorsConfig(true)
    expect(resolveAllowOrigin(cfg, 'https://example.com')).toBe('*')
  })

  it('echoes request origin when "*" + credentials true + origin present', () => {
    const cfg = normalizeCorsConfig({ origin: '*', allowCredentials: true })
    expect(resolveAllowOrigin(cfg, 'https://example.com')).toBe(
      'https://example.com',
    )
  })

  it('falls back to "*" when "*" + credentials true + no origin', () => {
    const cfg = normalizeCorsConfig({ origin: '*', allowCredentials: true })
    expect(resolveAllowOrigin(cfg, undefined)).toBe('*')
  })

  it('echoes request origin when in allow-list', () => {
    const cfg = normalizeCorsConfig({
      origins: ['https://a.com', 'https://b.com'],
    })
    expect(resolveAllowOrigin(cfg, 'https://b.com')).toBe('https://b.com')
  })

  it('returns first configured origin when request origin not in list', () => {
    const cfg = normalizeCorsConfig({
      origins: ['https://a.com', 'https://b.com'],
    })
    expect(resolveAllowOrigin(cfg, 'https://evil.com')).toBe('https://a.com')
  })

  it('matches origin case-insensitively against the allow-list', () => {
    // Real APIGW lower-cases scheme/host before comparing — a mixed-case
    // allow-list entry must still match a lowercased request origin.
    const cfg = normalizeCorsConfig({
      origins: ['https://Example.COM'],
    })
    expect(resolveAllowOrigin(cfg, 'https://example.com')).toBe(
      'https://example.com',
    )
  })

  it('matches a lowercase allow-list against a mixed-case request origin', () => {
    const cfg = normalizeCorsConfig({
      origins: ['https://example.com'],
    })
    expect(resolveAllowOrigin(cfg, 'https://EXAMPLE.com')).toBe(
      'https://EXAMPLE.com',
    )
  })
})

describe('applyCorsResponseHeaders', () => {
  function makeResponse() {
    const calls = { headers: [] }
    return {
      calls,
      header(name, value) {
        calls.headers.push({ name, value })
        return this
      },
    }
  }
  const named = (calls) =>
    Object.fromEntries(
      calls.headers.map((x) => [x.name.toLowerCase(), x.value]),
    )

  it('adds Allow-Origin (defaults: "*")', () => {
    const r = makeResponse()
    applyCorsResponseHeaders(
      r,
      normalizeCorsConfig(true),
      'https://example.com',
    )
    expect(named(r.calls)['access-control-allow-origin']).toBe('*')
  })

  it('omits Allow-Credentials when allowCredentials false', () => {
    const r = makeResponse()
    applyCorsResponseHeaders(r, normalizeCorsConfig(true), undefined)
    expect(named(r.calls)['access-control-allow-credentials']).toBeUndefined()
  })

  it('adds Allow-Credentials: true when allowCredentials configured', () => {
    const r = makeResponse()
    applyCorsResponseHeaders(
      r,
      normalizeCorsConfig({ origin: 'https://x.com', allowCredentials: true }),
      'https://x.com',
    )
    expect(named(r.calls)['access-control-allow-credentials']).toBe('true')
  })

  it('adds Expose-Headers when configured', () => {
    const r = makeResponse()
    applyCorsResponseHeaders(
      r,
      normalizeCorsConfig({ exposedHeaders: ['X-Total-Count'] }),
      undefined,
    )
    expect(named(r.calls)['access-control-expose-headers']).toBe(
      'X-Total-Count',
    )
  })

  it('omits Expose-Headers when empty', () => {
    const r = makeResponse()
    applyCorsResponseHeaders(r, normalizeCorsConfig(true), undefined)
    expect(named(r.calls)['access-control-expose-headers']).toBeUndefined()
  })

  it('does NOT add Allow-Headers, Allow-Methods, Max-Age (those are preflight-only)', () => {
    const r = makeResponse()
    applyCorsResponseHeaders(
      r,
      normalizeCorsConfig({
        origin: 'https://x.com',
        headers: ['X-Custom'],
        methods: ['GET'],
        maxAge: 3600,
      }),
      'https://x.com',
    )
    expect(named(r.calls)['access-control-allow-headers']).toBeUndefined()
    expect(named(r.calls)['access-control-allow-methods']).toBeUndefined()
    expect(named(r.calls)['access-control-max-age']).toBeUndefined()
  })

  it('returns the response object (allows chaining)', () => {
    const r = makeResponse()
    const out = applyCorsResponseHeaders(r, normalizeCorsConfig(true), '*')
    expect(out).toBe(r)
  })
})
