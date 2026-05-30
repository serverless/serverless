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
    headers: { authorization: 'Bearer tok-1', 'user-agent': 'jest' },
    info: { remoteAddress: '127.0.0.1' },
    raw: { req: { rawHeaders: ['Authorization', 'Bearer tok-1'] } },
    payload: undefined,
    ...overrides,
  }
}

const METHOD_ARN =
  'arn:aws:execute-api:us-east-1:000000000000:offline/dev/GET/items/42'

const REQUEST_ARGS = {
  methodArn: METHOD_ARN,
  resourcePath: '/items/{id}',
  path: '/items/42',
  requestContextPath: '/dev/items/42',
  httpMethod: 'GET',
  stage: 'dev',
  accountId: '000000000000',
}

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
  it('builds a REQUEST event with type=REQUEST, methodArn, and top-level resource/path/httpMethod', () => {
    const event = buildRequestEvent({
      request: makeRequest(),
      ...REQUEST_ARGS,
    })
    expect(event.type).toBe('REQUEST')
    expect(event.methodArn).toBe(METHOD_ARN)
    expect(event.resource).toBe('/items/{id}')
    expect(event.path).toBe('/items/42')
    expect(event.httpMethod).toBe('GET')
  })

  it('does NOT include identitySource (REST v1 REQUEST events carry no such field)', () => {
    const event = buildRequestEvent({
      request: makeRequest(),
      ...REQUEST_ARGS,
    })
    expect(event).not.toHaveProperty('identitySource')
  })

  it('builds a requestContext mirroring the REST v1 proxy shape', () => {
    const event = buildRequestEvent({
      request: makeRequest(),
      ...REQUEST_ARGS,
    })
    expect(event.requestContext.httpMethod).toBe('GET')
    expect(event.requestContext.identity.sourceIp).toBe('127.0.0.1')
    expect(event.requestContext.identity.userAgent).toBe('jest')
    expect(typeof event.requestContext.requestId).toBe('string')
    expect(event.requestContext.requestId.length).toBeGreaterThan(0)
    expect(event.requestContext.resourcePath).toBe('/items/{id}')
    expect(event.requestContext.path).toBe('/dev/items/42')
    expect(event.requestContext.stage).toBe('dev')
    expect(event.requestContext.accountId).toBe('000000000000')
    expect(event.requestContext.apiId).toBe('offline')
    expect(event.requestContext.protocol).toBe('HTTP/1.1')
    expect(event.requestContext.resourceId).toBe('offline')
  })

  it('keeps top-level path stage-stripped while requestContext.path carries the stage prefix', () => {
    const event = buildRequestEvent({
      request: makeRequest(),
      ...REQUEST_ARGS,
    })
    expect(event.path).toBe('/items/42')
    expect(event.requestContext.path).toBe('/dev/items/42')
  })

  it('does NOT include an authorizer field in requestContext', () => {
    const event = buildRequestEvent({
      request: makeRequest(),
      ...REQUEST_ARGS,
    })
    expect(event.requestContext).not.toHaveProperty('authorizer')
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
      ...REQUEST_ARGS,
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
      ...REQUEST_ARGS,
    })
    expect(event.pathParameters).toBeNull()
  })

  it('emits queryStringParameters as null when no query is present', () => {
    const event = buildRequestEvent({
      request: makeRequest({ query: {} }),
      ...REQUEST_ARGS,
    })
    expect(event.queryStringParameters).toBeNull()
    expect(event.multiValueQueryStringParameters).toBeNull()
  })

  it('emits stageVariables as null', () => {
    const event = buildRequestEvent({
      request: makeRequest(),
      ...REQUEST_ARGS,
    })
    expect(event.stageVariables).toBeNull()
  })
})
