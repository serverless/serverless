import {
  buildTokenEvent,
  buildRequestEvent,
} from '../../../../../../../../../lib/plugins/aws/offline/lib/app-server/authorizers/lambda-authorizer-event.js'

function makeRequest(overrides = {}) {
  return {
    method: 'GET',
    path: '/items/42',
    params: { id: '42' },
    query: {},
    headers: { authorization: 'Bearer tok-1' },
    info: { remoteAddress: '127.0.0.1' },
    raw: { req: { rawHeaders: ['Authorization', 'Bearer tok-1'] } },
    payload: undefined,
    ...overrides,
  }
}

const METHOD_ARN =
  'arn:aws:execute-api:us-east-1:000000000000:offline/dev/GET/items/42'

describe('buildTokenEvent', () => {
  it('builds a TOKEN event with authorizationToken and methodArn', () => {
    const event = buildTokenEvent({
      request: makeRequest(),
      methodArn: METHOD_ARN,
      authorizationToken: 'Bearer tok-1',
    })
    expect(event).toEqual({
      type: 'TOKEN',
      authorizationToken: 'Bearer tok-1',
      methodArn: METHOD_ARN,
    })
  })

  it('passes the supplied authorizationToken through verbatim (no trimming)', () => {
    const event = buildTokenEvent({
      request: makeRequest(),
      methodArn: METHOD_ARN,
      authorizationToken: '  spaced  ',
    })
    expect(event.authorizationToken).toBe('  spaced  ')
  })
})

describe('buildRequestEvent', () => {
  it('builds a REQUEST event with type=REQUEST and identitySource as array', () => {
    const event = buildRequestEvent({
      request: makeRequest(),
      methodArn: METHOD_ARN,
      authorizationToken: 'Bearer tok-1',
    })
    expect(event.type).toBe('REQUEST')
    expect(event.identitySource).toEqual(['Bearer tok-1'])
    expect(event.methodArn).toBe(METHOD_ARN)
  })

  it('surfaces headers, queryStringParameters, pathParameters, multiValueHeaders, multiValueQueryStringParameters', () => {
    const event = buildRequestEvent({
      request: makeRequest({
        query: { search: 'hello' },
        params: { id: '42' },
        headers: { authorization: 'Bearer tok-1', accept: 'application/json' },
        raw: {
          req: {
            rawHeaders: [
              'Authorization',
              'Bearer tok-1',
              'Accept',
              'application/json',
            ],
          },
        },
      }),
      methodArn: METHOD_ARN,
      authorizationToken: 'Bearer tok-1',
    })
    expect(event.headers).toEqual({
      Authorization: 'Bearer tok-1',
      Accept: 'application/json',
    })
    expect(event.multiValueHeaders).toEqual({
      Authorization: ['Bearer tok-1'],
      Accept: ['application/json'],
    })
    expect(event.queryStringParameters).toEqual({ search: 'hello' })
    expect(event.multiValueQueryStringParameters).toEqual({ search: ['hello'] })
    expect(event.pathParameters).toEqual({ id: '42' })
  })

  it('emits pathParameters as null (not empty object) when no params are present', () => {
    const event = buildRequestEvent({
      request: makeRequest({ params: {} }),
      methodArn: METHOD_ARN,
      authorizationToken: 'Bearer tok-1',
    })
    expect(event.pathParameters).toBeNull()
  })

  it('emits queryStringParameters as null when no query is present', () => {
    const event = buildRequestEvent({
      request: makeRequest({ query: {} }),
      methodArn: METHOD_ARN,
      authorizationToken: 'Bearer tok-1',
    })
    expect(event.queryStringParameters).toBeNull()
    expect(event.multiValueQueryStringParameters).toBeNull()
  })

  it('falls back to authorizationToken=null when no identitySource resolved', () => {
    const event = buildRequestEvent({
      request: makeRequest(),
      methodArn: METHOD_ARN,
      authorizationToken: null,
    })
    expect(event.identitySource).toEqual([])
  })
})
