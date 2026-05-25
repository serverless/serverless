import {
  parseV2IdentitySource,
  extractV2IdentitySource,
} from '../../../../../../../../../lib/plugins/aws/offline/lib/app-server/authorizers/v2-identity-source.js'

describe('parseV2IdentitySource', () => {
  it('parses a single header source', () => {
    expect(parseV2IdentitySource('$request.header.Authorization')).toEqual([
      { kind: 'header', name: 'Authorization' },
    ])
  })

  it('parses a single querystring source', () => {
    expect(parseV2IdentitySource('$request.querystring.token')).toEqual([
      { kind: 'querystring', name: 'token' },
    ])
  })

  it('parses a comma-separated list with whitespace tolerance', () => {
    expect(
      parseV2IdentitySource(
        '$request.header.Authorization, $request.querystring.token',
      ),
    ).toEqual([
      { kind: 'header', name: 'Authorization' },
      { kind: 'querystring', name: 'token' },
    ])
  })

  it('returns an empty list when input is empty or undefined', () => {
    expect(parseV2IdentitySource('')).toEqual([])
    expect(parseV2IdentitySource(undefined)).toEqual([])
  })

  it('rejects v1-style sources silently (different prefix)', () => {
    expect(
      parseV2IdentitySource('method.request.header.Authorization'),
    ).toEqual([])
  })

  it('skips malformed entries silently', () => {
    expect(
      parseV2IdentitySource(
        '$request.header.A, garbage, $request.querystring.B',
      ),
    ).toEqual([
      { kind: 'header', name: 'A' },
      { kind: 'querystring', name: 'B' },
    ])
  })

  it('accepts an array form (some YAML users write the list as a sequence)', () => {
    expect(
      parseV2IdentitySource([
        '$request.header.Authorization',
        '$request.querystring.token',
      ]),
    ).toEqual([
      { kind: 'header', name: 'Authorization' },
      { kind: 'querystring', name: 'token' },
    ])
  })
})

describe('extractV2IdentitySource', () => {
  function makeRequest({ headers = {}, query = {} } = {}) {
    return { headers, query }
  }

  it('returns the first non-empty header value', () => {
    const sources = parseV2IdentitySource('$request.header.Authorization')
    expect(
      extractV2IdentitySource(
        makeRequest({ headers: { authorization: 'Bearer t-1' } }),
        sources,
      ),
    ).toBe('Bearer t-1')
  })

  it('header lookup is case-insensitive', () => {
    const sources = parseV2IdentitySource('$request.header.Authorization')
    expect(
      extractV2IdentitySource(
        makeRequest({ headers: { Authorization: 'tok' } }),
        sources,
      ),
    ).toBe('tok')
  })

  it('falls through to querystring when header is missing', () => {
    const sources = parseV2IdentitySource(
      '$request.header.X, $request.querystring.token',
    )
    expect(
      extractV2IdentitySource(makeRequest({ query: { token: 'q' } }), sources),
    ).toBe('q')
  })

  it('returns null when no source resolves', () => {
    const sources = parseV2IdentitySource('$request.header.Authorization')
    expect(extractV2IdentitySource(makeRequest(), sources)).toBeNull()
  })

  it('returns null when sources is empty', () => {
    expect(
      extractV2IdentitySource(makeRequest({ headers: { x: 'y' } }), []),
    ).toBeNull()
  })
})
