import { buildV2RequestEvent } from '../../../../../../../../../lib/plugins/aws/offline/lib/app-server/authorizers/v2-lambda-authorizer-event.js'

function makeRequest(overrides = {}) {
  return {
    method: 'GET',
    path: '/items/42',
    params: { id: '42' },
    query: { search: 'hi' },
    headers: { authorization: 'Bearer t', 'x-custom': 'c' },
    info: { remoteAddress: '127.0.0.1' },
    raw: {
      req: {
        rawHeaders: ['Authorization', 'Bearer t', 'X-Custom', 'c'],
      },
    },
    ...overrides,
  }
}

const ROUTE_ARN =
  'arn:aws:execute-api:us-east-1:000000000000:offline/dev/GET/items/{id}'
const ROUTE_KEY = 'GET /items/{id}'

describe('buildV2RequestEvent', () => {
  it('builds an APIGW v2 REQUEST event with version 2.0', () => {
    const event = buildV2RequestEvent({
      request: makeRequest(),
      routeArn: ROUTE_ARN,
      routeKey: ROUTE_KEY,
      authorizationToken: 'Bearer t',
      stage: 'dev',
      accountId: '000000000000',
      domainName: 'localhost',
      requestId: 'req-1',
    })
    expect(event.version).toBe('2.0')
    expect(event.type).toBe('REQUEST')
    expect(event.routeArn).toBe(ROUTE_ARN)
    expect(event.routeKey).toBe(ROUTE_KEY)
    expect(event.identitySource).toEqual(['Bearer t'])
  })

  it('surfaces headers (lowercased + comma-joined multi-value)', () => {
    const event = buildV2RequestEvent({
      request: makeRequest(),
      routeArn: ROUTE_ARN,
      routeKey: ROUTE_KEY,
      authorizationToken: 'Bearer t',
      stage: 'dev',
      accountId: '000000000000',
      domainName: 'localhost',
      requestId: 'req-1',
    })
    expect(event.headers.authorization).toBe('Bearer t')
    expect(event.headers['x-custom']).toBe('c')
  })

  it('emits queryStringParameters and pathParameters', () => {
    const event = buildV2RequestEvent({
      request: makeRequest(),
      routeArn: ROUTE_ARN,
      routeKey: ROUTE_KEY,
      authorizationToken: 'Bearer t',
      stage: 'dev',
      accountId: '000000000000',
      domainName: 'localhost',
      requestId: 'req-1',
    })
    expect(event.queryStringParameters).toEqual({ search: 'hi' })
    expect(event.pathParameters).toEqual({ id: '42' })
  })

  it('emits queryStringParameters / pathParameters as null when empty (v2 spec)', () => {
    const event = buildV2RequestEvent({
      request: makeRequest({ query: {}, params: {} }),
      routeArn: ROUTE_ARN,
      routeKey: ROUTE_KEY,
      authorizationToken: 'Bearer t',
      stage: 'dev',
      accountId: '000000000000',
      domainName: 'localhost',
      requestId: 'req-1',
    })
    // AWS v2 omits these fields entirely when empty rather than emitting
    // an empty object. We match that by setting them to null and letting the
    // caller spread conditionally.
    expect(event.queryStringParameters).toBeNull()
    expect(event.pathParameters).toBeNull()
  })

  it('surfaces an empty identitySource array when authorizationToken is null', () => {
    const event = buildV2RequestEvent({
      request: makeRequest(),
      routeArn: ROUTE_ARN,
      routeKey: ROUTE_KEY,
      authorizationToken: null,
      stage: 'dev',
      accountId: '000000000000',
      domainName: 'localhost',
      requestId: 'req-1',
    })
    expect(event.identitySource).toEqual([])
  })

  it('emits a minimal requestContext with stage + accountId + http.method/path + requestId', () => {
    const event = buildV2RequestEvent({
      request: makeRequest({ method: 'POST' }),
      routeArn: ROUTE_ARN,
      routeKey: ROUTE_KEY,
      authorizationToken: 'Bearer t',
      stage: 'dev',
      accountId: '000000000000',
      domainName: 'localhost',
      requestId: 'req-77',
    })
    expect(event.requestContext.accountId).toBe('000000000000')
    expect(event.requestContext.stage).toBe('dev')
    expect(event.requestContext.routeKey).toBe(ROUTE_KEY)
    expect(event.requestContext.http.method).toBe('POST')
    expect(event.requestContext.http.path).toBe('/items/42')
    expect(event.requestContext.http.sourceIp).toBe('127.0.0.1')
    expect(event.requestContext.requestId).toBe('req-77')
  })

  it('includes rawPath, rawQueryString, and cookies for a request with a query string and a Cookie header', () => {
    const event = buildV2RequestEvent({
      request: makeRequest({
        path: '/items/42',
        query: { search: 'hi' },
        url: new URL('http://localhost:3000/items/42?search=hi'),
        state: { session: 'abc', lang: 'en-US' },
        headers: {
          authorization: 'Bearer t',
          cookie: 'session=abc; lang=en-US',
        },
        raw: {
          req: {
            url: '/items/42?search=hi',
            rawHeaders: [
              'Authorization',
              'Bearer t',
              'Cookie',
              'session=abc; lang=en-US',
            ],
          },
        },
      }),
      routeArn: ROUTE_ARN,
      routeKey: ROUTE_KEY,
      authorizationToken: 'Bearer t',
      stage: 'dev',
      accountId: '000000000000',
      domainName: 'localhost',
      requestId: 'req-1',
    })
    // rawPath is the raw (undecoded, slash-preserving) wire path.
    expect(event.rawPath).toBe('/items/42')
    // rawQueryString is the raw query string with no leading '?'.
    expect(event.rawQueryString).toBe('search=hi')
    // cookies is the array of `name=value` strings.
    expect(Array.isArray(event.cookies)).toBe(true)
    expect(event.cookies).toEqual(['session=abc', 'lang=en-US'])
    // Existing fields stay intact.
    expect(event.headers.authorization).toBe('Bearer t')
  })
})
