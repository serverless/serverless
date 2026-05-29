import { buildAlbEvent } from '../../../../../../../../../lib/plugins/aws/offline/lib/app-server/alb/event-factory.js'

function makeRequest(overrides = {}) {
  return {
    method: 'GET',
    path: '/orders',
    headers: { 'user-agent': 'curl/8', 'x-foo': 'bar' },
    info: { remoteAddress: '127.0.0.1', received: 0 },
    raw: {
      req: {
        rawHeaders: ['User-Agent', 'curl/8', 'X-Foo', 'bar'],
      },
    },
    url: new URL('http://localhost:3000/orders'),
    payload: undefined,
    ...overrides,
  }
}

const TARGET_GROUP_ARN =
  'arn:aws:elasticloadbalancing:us-east-1:000000000000:targetgroup/offline/abcdef1234567890'

describe('buildAlbEvent', () => {
  it('emits httpMethod uppercased + literal path', () => {
    const event = buildAlbEvent({
      request: makeRequest({ method: 'get', path: '/orders' }),
      targetGroupArn: TARGET_GROUP_ARN,
    })
    expect(event.httpMethod).toBe('GET')
    expect(event.path).toBe('/orders')
  })

  it('emits requestContext.elb.targetGroupArn from the supplied arn', () => {
    const event = buildAlbEvent({
      request: makeRequest(),
      targetGroupArn: TARGET_GROUP_ARN,
    })
    expect(event.requestContext).toEqual({
      elb: { targetGroupArn: TARGET_GROUP_ARN },
    })
  })

  it('emits headers lowercased single-value', () => {
    const event = buildAlbEvent({
      request: makeRequest(),
      targetGroupArn: TARGET_GROUP_ARN,
    })
    expect(event.headers).toEqual({
      'user-agent': 'curl/8',
      'x-foo': 'bar',
    })
  })

  it('emits multiValueHeaders with each header as array', () => {
    const event = buildAlbEvent({
      request: makeRequest(),
      targetGroupArn: TARGET_GROUP_ARN,
    })
    expect(event.multiValueHeaders).toEqual({
      'user-agent': ['curl/8'],
      'x-foo': ['bar'],
    })
  })

  it('multiValueHeaders preserves duplicates from rawHeaders', () => {
    const event = buildAlbEvent({
      request: makeRequest({
        raw: {
          req: {
            rawHeaders: ['X-Multi', 'a', 'X-Multi', 'b'],
          },
        },
        headers: { 'x-multi': 'a,b' },
      }),
      targetGroupArn: TARGET_GROUP_ARN,
    })
    expect(event.multiValueHeaders['x-multi']).toEqual(['a', 'b'])
  })

  it('emits queryStringParameters null when no query', () => {
    const event = buildAlbEvent({
      request: makeRequest(),
      targetGroupArn: TARGET_GROUP_ARN,
    })
    expect(event.queryStringParameters).toBeNull()
    expect(event.multiValueQueryStringParameters).toBeNull()
  })

  it('emits queryStringParameters + multiValueQueryStringParameters when query present', () => {
    const event = buildAlbEvent({
      request: makeRequest({
        url: new URL('http://localhost:3000/orders?status=open&tag=a&tag=b'),
      }),
      targetGroupArn: TARGET_GROUP_ARN,
    })
    expect(event.queryStringParameters).toEqual({ status: 'open', tag: 'b' })
    expect(event.multiValueQueryStringParameters).toEqual({
      status: ['open'],
      tag: ['a', 'b'],
    })
  })

  it('body is empty string when payload absent (real ALB behavior)', () => {
    const event = buildAlbEvent({
      request: makeRequest(),
      targetGroupArn: TARGET_GROUP_ARN,
    })
    expect(event.body).toBe('')
    expect(event.isBase64Encoded).toBe(false)
  })

  it('body is the raw string when payload is a string', () => {
    const event = buildAlbEvent({
      request: makeRequest({
        method: 'POST',
        payload: 'hello world',
      }),
      targetGroupArn: TARGET_GROUP_ARN,
    })
    expect(event.body).toBe('hello world')
    expect(event.isBase64Encoded).toBe(false)
  })

  it('body is JSON-stringified when payload is an object', () => {
    const event = buildAlbEvent({
      request: makeRequest({
        method: 'POST',
        payload: { hello: 'world' },
      }),
      targetGroupArn: TARGET_GROUP_ARN,
    })
    expect(event.body).toBe('{"hello":"world"}')
    expect(event.isBase64Encoded).toBe(false)
  })

  it('body is base64-encoded when payload is a Buffer with a binary content-type', () => {
    const event = buildAlbEvent({
      request: makeRequest({
        method: 'POST',
        headers: { 'content-type': 'application/octet-stream' },
        payload: Buffer.from([0xff, 0xfe, 0xfd]),
      }),
      targetGroupArn: TARGET_GROUP_ARN,
    })
    expect(event.isBase64Encoded).toBe(true)
    expect(event.body).toBe('//79')
  })

  it('body is UTF-8 verbatim when payload is a Buffer with a non-binary content-type', () => {
    const payload = '{ "a":  1 ,  "b": 2 }'
    const event = buildAlbEvent({
      request: makeRequest({
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        payload: Buffer.from(payload, 'utf8'),
      }),
      targetGroupArn: TARGET_GROUP_ARN,
    })
    expect(event.isBase64Encoded).toBe(false)
    expect(event.body).toBe(payload)
  })

  it('event has NO pathParameters field (ALB literal-path only)', () => {
    const event = buildAlbEvent({
      request: makeRequest(),
      targetGroupArn: TARGET_GROUP_ARN,
    })
    expect('pathParameters' in event).toBe(false)
  })
})
