import { buildVelocityContext } from '../../../../../../../../../../lib/plugins/aws/offline/lib/app-server/rest-api/velocity/context.js'

function makeRequest(overrides = {}) {
  return {
    method: 'POST',
    params: { id: '42' },
    query: { search: 'hello' },
    headers: { 'x-custom': 'abc', 'user-agent': 'curl/8' },
    info: { remoteAddress: '127.0.0.1' },
    raw: {
      req: {
        rawHeaders: ['X-Custom', 'abc', 'User-Agent', 'curl/8'],
      },
    },
    payload: { hello: 'world', nested: { x: 1 } },
    ...overrides,
  }
}

function build(overrides = {}) {
  return buildVelocityContext({
    request: makeRequest(overrides.request),
    stage: overrides.stage ?? 'dev',
    payload: overrides.payload ?? makeRequest(overrides.request).payload,
    resourcePath: overrides.resourcePath ?? '/items/{id}',
  })
}

describe('$context', () => {
  it('populates apiId, httpMethod, stage, resourcePath', () => {
    const { context } = build()
    expect(context.apiId).toBe('offlineContext_apiId')
    expect(context.httpMethod).toBe('POST')
    expect(context.stage).toBe('dev')
    expect(context.resourcePath).toBe('/items/{id}')
  })

  it('populates a requestId per build', () => {
    expect(build().context.requestId).toMatch(/^[0-9a-f-]{36}$/)
  })

  it('identity.sourceIp from request.info.remoteAddress', () => {
    const { context } = build({
      request: { info: { remoteAddress: '10.0.0.42' } },
    })
    expect(context.identity.sourceIp).toBe('10.0.0.42')
  })

  it('identity.userAgent from header (empty fallback)', () => {
    expect(build().context.identity.userAgent).toBe('curl/8')
    const empty = build({
      request: {
        headers: {},
        raw: { req: { rawHeaders: [] } },
      },
    })
    expect(empty.context.identity.userAgent).toBe('')
  })

  it('identity carries offlineContext_* placeholders for unimplemented fields', () => {
    const { context } = build()
    expect(context.identity.accountId).toBe('offlineContext_accountId')
    expect(context.identity.apiKey).toBe('offlineContext_apiKey')
    expect(context.identity.caller).toBe('offlineContext_caller')
    expect(context.identity.cognitoAuthenticationProvider).toBe(
      'offlineContext_cognitoAuthenticationProvider',
    )
    expect(context.identity.user).toBe('offlineContext_user')
    expect(context.identity.userArn).toBe('offlineContext_userArn')
  })

  it('authorizer.principalId is the offline placeholder when no auth credentials', () => {
    expect(build().context.authorizer.principalId).toBe(
      'offlineContext_authorizer_principalId',
    )
  })

  it('authorizer.principalId is taken from request.auth.credentials.principalId when set', () => {
    const { context } = build({
      request: {
        auth: { credentials: { principalId: 'user-7' } },
      },
    })
    expect(context.authorizer.principalId).toBe('user-7')
  })

  it('authorizer.principalId falls back to PRINCIPAL_ID env then the default', () => {
    const prev = process.env.PRINCIPAL_ID
    process.env.PRINCIPAL_ID = 'env-pid'
    try {
      expect(build().context.authorizer.principalId).toBe('env-pid')
    } finally {
      if (prev === undefined) delete process.env.PRINCIPAL_ID
      else process.env.PRINCIPAL_ID = prev
    }
  })

  it('decodes a Bearer JWT into authorizer.claims', () => {
    const headerSeg = Buffer.from(
      JSON.stringify({ alg: 'none', typ: 'JWT' }),
    ).toString('base64url')
    const payloadSeg = Buffer.from(JSON.stringify({ sub: 'abc' })).toString(
      'base64url',
    )
    const jwt = `${headerSeg}.${payloadSeg}.`
    const { context } = build({
      request: {
        headers: { authorization: `Bearer ${jwt}` },
        raw: { req: { rawHeaders: ['Authorization', `Bearer ${jwt}`] } },
      },
    })
    expect(context.authorizer.claims.sub).toBe('abc')
  })

  it('leaves authorizer.claims unset for a non-JWT bearer token (no throw)', () => {
    const { context } = build({
      request: {
        headers: { authorization: 'Bearer not-a-jwt' },
        raw: { req: { rawHeaders: ['Authorization', 'Bearer not-a-jwt'] } },
      },
    })
    expect(context.authorizer.claims).toBeUndefined()
  })

  it('preserves existing credentials.authorizer fields alongside principalId', () => {
    const { context } = build({
      request: {
        auth: { credentials: { authorizer: { tenant: 't-1' } } },
      },
    })
    expect(context.authorizer.tenant).toBe('t-1')
    expect(context.authorizer.principalId).toBe(
      'offlineContext_authorizer_principalId',
    )
  })
})

describe('$input', () => {
  it('body is the parsed payload', () => {
    const { input } = build()
    expect(input.body).toEqual({ hello: 'world', nested: { x: 1 } })
  })

  it('json($.path) returns the value at that JSONPath, stringified', () => {
    const { input } = build()
    expect(input.json('$.hello')).toBe('"world"')
    expect(input.json('$.nested.x')).toBe('1')
  })

  it('path($.path) returns the value at that JSONPath (typed)', () => {
    const { input } = build()
    expect(input.path('$.hello')).toBe('world')
    expect(input.path('$.nested.x')).toBe(1)
  })

  it('params("name") returns the path param first', () => {
    const { input } = build()
    expect(input.params('id')).toBe('42')
  })

  it('params("name") falls back to query param', () => {
    const { input } = build()
    expect(input.params('search')).toBe('hello')
  })

  it('params("name") falls back to header', () => {
    const { input } = build()
    expect(input.params('x-custom')).toBe('abc')
  })

  it('params() with no arg returns the full {header, path, querystring} map', () => {
    const { input } = build()
    const all = input.params()
    expect(all.path).toEqual({ id: '42' })
    expect(all.querystring).toEqual({ search: 'hello' })
    expect(all.header['x-custom']).toBe('abc')
  })
})

describe('$util', () => {
  it('escapeJavaScript escapes quotes and backslashes', () => {
    const { util } = build()
    expect(util.escapeJavaScript('hello "world"')).toBe('hello \\"world\\"')
  })

  it('parseJson parses a JSON string', () => {
    const { util } = build()
    expect(util.parseJson('{"a":1}')).toEqual({ a: 1 })
  })

  it('urlEncode encodes a URL-unsafe string', () => {
    const { util } = build()
    expect(util.urlEncode('hello world')).toBe('hello%20world')
  })

  it('urlDecode replaces + with space and decodes percent-escapes', () => {
    const { util } = build()
    expect(util.urlDecode('hello+world%21')).toBe('hello world!')
  })

  it('base64Encode encodes a string', () => {
    const { util } = build()
    expect(util.base64Encode('hello')).toBe('aGVsbG8=')
  })

  it('base64Decode decodes a base64 string', () => {
    const { util } = build()
    expect(util.base64Decode('aGVsbG8=')).toBe('hello')
  })

  it('base64Encode encodes via binary (Latin-1), not utf8', () => {
    const { util } = build()
    expect(util.base64Encode('ÿ')).toBe('/w==')
  })

  it('base64Decode decodes via binary (Latin-1)', () => {
    const { util } = build()
    expect(util.base64Decode('/w==')).toBe('ÿ')
  })

  it('urlEncode uses encodeURI semantics (does not encode "/")', () => {
    const { util } = build()
    expect(util.urlEncode('a/b c')).toBe('a/b%20c')
  })

  it('escapeJavaScript coerces non-strings via toString', () => {
    const { util } = build()
    expect(util.escapeJavaScript(42)).toBe('42')
  })

  it('escapeJavaScript stringifies plain objects with escaped values', () => {
    const { util } = build()
    expect(util.escapeJavaScript({ a: 'b' })).toBe('{"a":"b"}')
  })
})
