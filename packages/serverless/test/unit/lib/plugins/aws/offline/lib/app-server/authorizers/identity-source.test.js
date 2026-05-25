import {
  parseIdentitySource,
  extractIdentitySource,
} from '../../../../../../../../../lib/plugins/aws/offline/lib/app-server/authorizers/identity-source.js'

describe('parseIdentitySource', () => {
  it('parses a single header source', () => {
    expect(parseIdentitySource('method.request.header.Authorization')).toEqual([
      { kind: 'header', name: 'Authorization' },
    ])
  })

  it('parses a single querystring source', () => {
    expect(parseIdentitySource('method.request.querystring.token')).toEqual([
      { kind: 'querystring', name: 'token' },
    ])
  })

  it('parses a comma-separated list with whitespace tolerance', () => {
    expect(
      parseIdentitySource(
        'method.request.header.Authorization, method.request.querystring.token',
      ),
    ).toEqual([
      { kind: 'header', name: 'Authorization' },
      { kind: 'querystring', name: 'token' },
    ])
  })

  it('returns an empty list when input is empty or undefined', () => {
    expect(parseIdentitySource('')).toEqual([])
    expect(parseIdentitySource(undefined)).toEqual([])
  })

  it('skips malformed entries silently', () => {
    expect(
      parseIdentitySource(
        'method.request.header.A, garbage, method.request.querystring.B',
      ),
    ).toEqual([
      { kind: 'header', name: 'A' },
      { kind: 'querystring', name: 'B' },
    ])
  })
})

describe('extractIdentitySource', () => {
  function makeRequest({ headers = {}, query = {} } = {}) {
    return { headers, query }
  }

  it('returns the first non-empty header value', () => {
    const sources = parseIdentitySource('method.request.header.Authorization')
    const value = extractIdentitySource(
      makeRequest({ headers: { authorization: 'Bearer t-1' } }),
      sources,
    )
    expect(value).toBe('Bearer t-1')
  })

  it('header lookup is case-insensitive', () => {
    const sources = parseIdentitySource('method.request.header.Authorization')
    const value = extractIdentitySource(
      makeRequest({ headers: { Authorization: 'tok' } }),
      sources,
    )
    expect(value).toBe('tok')
  })

  it('falls through to querystring when header is missing', () => {
    const sources = parseIdentitySource(
      'method.request.header.X, method.request.querystring.token',
    )
    const value = extractIdentitySource(
      makeRequest({ query: { token: 'qtoken' } }),
      sources,
    )
    expect(value).toBe('qtoken')
  })

  it('returns null when no source resolves', () => {
    const sources = parseIdentitySource('method.request.header.Authorization')
    expect(extractIdentitySource(makeRequest(), sources)).toBeNull()
  })

  it('returns null when sources is empty', () => {
    expect(
      extractIdentitySource(makeRequest({ headers: { x: 'y' } }), []),
    ).toBeNull()
  })
})
