import {
  buildConnectEvent,
  buildDisconnectEvent,
  buildMessageEvent,
  buildAuthorizerEvent,
} from '../../../../../../../../../lib/plugins/aws/offline/lib/app-server/websocket/event-factory.js'

function makeRequest(overrides = {}) {
  return {
    headers: { 'user-agent': 'wscat/1.0', host: 'localhost:3000' },
    rawHeaders: ['User-Agent', 'wscat/1.0', 'Host', 'localhost:3000'],
    socket: { remoteAddress: '127.0.0.1' },
    url: '/dev',
    ...overrides,
  }
}

describe('buildConnectEvent', () => {
  it('emits eventType=CONNECT and routeKey=$connect', () => {
    const event = buildConnectEvent({
      connectionId: 'c-1',
      request: makeRequest(),
      stage: 'dev',
      accountId: '000000000000',
      region: 'us-east-1',
      apiId: 'private',
    })
    expect(event.requestContext.eventType).toBe('CONNECT')
    expect(event.requestContext.routeKey).toBe('$connect')
    expect(event.requestContext.connectionId).toBe('c-1')
  })

  it('emits headers lowercased + multiValueHeaders preserves duplicates', () => {
    const event = buildConnectEvent({
      connectionId: 'c-1',
      request: makeRequest({
        rawHeaders: ['X-Auth', 'a', 'X-Auth', 'b', 'Host', 'localhost:3000'],
      }),
      stage: 'dev',
      accountId: '000000000000',
      region: 'us-east-1',
      apiId: 'private',
    })
    expect(event.headers['x-auth']).toBe('b')
    expect(event.multiValueHeaders['x-auth']).toEqual(['a', 'b'])
  })

  it('emits queryStringParameters when query present, omits when absent', () => {
    const withQuery = buildConnectEvent({
      connectionId: 'c-1',
      request: makeRequest({ url: '/dev?token=abc&tag=a&tag=b' }),
      stage: 'dev',
      accountId: '000000000000',
      region: 'us-east-1',
      apiId: 'private',
    })
    expect(withQuery.queryStringParameters).toEqual({
      token: 'abc',
      tag: 'b',
    })
    expect(withQuery.multiValueQueryStringParameters).toEqual({
      token: ['abc'],
      tag: ['a', 'b'],
    })

    const noQuery = buildConnectEvent({
      connectionId: 'c-1',
      request: makeRequest({ url: '/dev' }),
      stage: 'dev',
      accountId: '000000000000',
      region: 'us-east-1',
      apiId: 'private',
    })
    expect('queryStringParameters' in noQuery).toBe(false)
    expect('multiValueQueryStringParameters' in noQuery).toBe(false)
  })

  it('requestContext.identity.sourceIp comes from socket.remoteAddress', () => {
    const event = buildConnectEvent({
      connectionId: 'c-1',
      request: makeRequest({ socket: { remoteAddress: '203.0.113.7' } }),
      stage: 'dev',
      accountId: '000000000000',
      region: 'us-east-1',
      apiId: 'private',
    })
    expect(event.requestContext.identity.sourceIp).toBe('203.0.113.7')
  })

  it('requestContext.identity.userAgent comes from User-Agent header', () => {
    const event = buildConnectEvent({
      connectionId: 'c-1',
      request: makeRequest(),
      stage: 'dev',
      accountId: '000000000000',
      region: 'us-east-1',
      apiId: 'private',
    })
    expect(event.requestContext.identity.userAgent).toBe('wscat/1.0')
  })
})

describe('buildDisconnectEvent', () => {
  it('emits eventType=DISCONNECT and routeKey=$disconnect', () => {
    const event = buildDisconnectEvent({
      connectionId: 'c-1',
      request: makeRequest(),
      stage: 'dev',
      accountId: '000000000000',
      region: 'us-east-1',
      apiId: 'private',
    })
    expect(event.requestContext.eventType).toBe('DISCONNECT')
    expect(event.requestContext.routeKey).toBe('$disconnect')
    expect(event.requestContext.connectionId).toBe('c-1')
  })

  it('does not emit a disconnectStatusCode field (AWS shape parity)', () => {
    const event = buildDisconnectEvent({
      connectionId: 'c-1',
      request: makeRequest(),
      stage: 'dev',
      accountId: '000000000000',
      region: 'us-east-1',
      apiId: 'private',
    })
    expect('disconnectStatusCode' in event.requestContext).toBe(false)
  })
})

describe('buildMessageEvent', () => {
  it('emits body verbatim + isBase64Encoded=false + correct route', () => {
    const event = buildMessageEvent({
      connectionId: 'c-1',
      route: 'broadcast',
      payload: '{"action":"broadcast","msg":"hi"}',
      stage: 'dev',
      accountId: '000000000000',
      region: 'us-east-1',
      apiId: 'private',
    })
    expect(event.body).toBe('{"action":"broadcast","msg":"hi"}')
    expect(event.isBase64Encoded).toBe(false)
    expect(event.requestContext.eventType).toBe('MESSAGE')
    expect(event.requestContext.routeKey).toBe('broadcast')
    expect(event.requestContext.connectionId).toBe('c-1')
  })

  it('emits routeKey=$default when route is $default', () => {
    const event = buildMessageEvent({
      connectionId: 'c-1',
      route: '$default',
      payload: 'plain text',
      stage: 'dev',
      accountId: '000000000000',
      region: 'us-east-1',
      apiId: 'private',
    })
    expect(event.requestContext.routeKey).toBe('$default')
  })
})

describe('buildAuthorizerEvent', () => {
  it('emits type=REQUEST + methodArn with $connect suffix', () => {
    const event = buildAuthorizerEvent({
      connectionId: 'c-1',
      request: makeRequest({ url: '/dev?token=t' }),
      stage: 'dev',
      accountId: '000000000000',
      region: 'us-east-1',
      apiId: 'private',
    })
    expect(event.type).toBe('REQUEST')
    expect(event.methodArn).toBe(
      'arn:aws:execute-api:us-east-1:000000000000:private/dev/$connect',
    )
  })

  it('emits headers + multiValueHeaders', () => {
    const event = buildAuthorizerEvent({
      connectionId: 'c-1',
      request: makeRequest(),
      stage: 'dev',
      accountId: '000000000000',
      region: 'us-east-1',
      apiId: 'private',
    })
    expect(event.headers['user-agent']).toBe('wscat/1.0')
    expect(event.multiValueHeaders['user-agent']).toEqual(['wscat/1.0'])
  })

  it('emits queryStringParameters when present + omits when absent', () => {
    const withQuery = buildAuthorizerEvent({
      connectionId: 'c-1',
      request: makeRequest({ url: '/dev?token=t' }),
      stage: 'dev',
      accountId: '000000000000',
      region: 'us-east-1',
      apiId: 'private',
    })
    expect(withQuery.queryStringParameters).toEqual({ token: 't' })

    const noQuery = buildAuthorizerEvent({
      connectionId: 'c-1',
      request: makeRequest({ url: '/dev' }),
      stage: 'dev',
      accountId: '000000000000',
      region: 'us-east-1',
      apiId: 'private',
    })
    expect('queryStringParameters' in noQuery).toBe(false)
  })

  it('requestContext.routeKey is $connect (auth runs on $connect handshake)', () => {
    const event = buildAuthorizerEvent({
      connectionId: 'c-1',
      request: makeRequest(),
      stage: 'dev',
      accountId: '000000000000',
      region: 'us-east-1',
      apiId: 'private',
    })
    expect(event.requestContext.routeKey).toBe('$connect')
    expect(event.requestContext.eventType).toBe('CONNECT')
  })
})

describe('common: requestContext fields', () => {
  it('apiId, domainName, stage, region pass through', () => {
    const event = buildConnectEvent({
      connectionId: 'c-1',
      request: makeRequest(),
      stage: 'staging',
      accountId: '000000000000',
      region: 'eu-west-1',
      apiId: 'private',
    })
    expect(event.requestContext.apiId).toBe('private')
    expect(event.requestContext.stage).toBe('staging')
    expect(event.requestContext.domainName).toBe('localhost:3000')
  })

  it('identity carries placeholder fields matching REST v1 (accountId, caller, etc.)', () => {
    const event = buildConnectEvent({
      connectionId: 'c-1',
      request: makeRequest(),
      stage: 'dev',
      accountId: '000000000000',
      region: 'us-east-1',
      apiId: 'private',
    })
    expect(event.requestContext.identity.accessKey).toBeNull()
    expect(event.requestContext.identity.accountId).toBeNull()
    expect(event.requestContext.identity.caller).toBeNull()
  })

  it('requestId and extendedRequestId are uuids (one per event)', () => {
    const event = buildConnectEvent({
      connectionId: 'c-1',
      request: makeRequest(),
      stage: 'dev',
      accountId: '000000000000',
      region: 'us-east-1',
      apiId: 'private',
    })
    expect(event.requestContext.requestId).toMatch(/^[0-9a-f-]{36}$/)
    expect(event.requestContext.extendedRequestId).toMatch(/^[0-9a-f-]{36}$/)
  })
})
