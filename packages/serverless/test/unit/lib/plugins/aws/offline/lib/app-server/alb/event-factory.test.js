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

  const TRACE_ID_PATTERN = /^Root=1-[0-9a-f]{8}-[0-9a-f]{24}$/

  it('emits only single-value headers (no multi-value maps) by default', () => {
    const event = buildAlbEvent({
      request: makeRequest(),
      targetGroupArn: TARGET_GROUP_ARN,
    })
    expect(event.headers).toEqual({
      'user-agent': 'curl/8',
      'x-foo': 'bar',
      'x-forwarded-for': '127.0.0.1',
      'x-forwarded-port': '3000',
      'x-forwarded-proto': 'http',
      'x-amzn-trace-id': expect.stringMatching(TRACE_ID_PATTERN),
    })
    expect('multiValueHeaders' in event).toBe(false)
    expect('multiValueQueryStringParameters' in event).toBe(false)
  })

  it('emits only multi-value headers (no single-value maps) when multiValueHeaders is true', () => {
    const event = buildAlbEvent({
      request: makeRequest(),
      targetGroupArn: TARGET_GROUP_ARN,
      multiValueHeaders: true,
    })
    expect(event.multiValueHeaders).toEqual({
      'user-agent': ['curl/8'],
      'x-foo': ['bar'],
      'x-forwarded-for': ['127.0.0.1'],
      'x-forwarded-port': ['3000'],
      'x-forwarded-proto': ['http'],
      'x-amzn-trace-id': [expect.stringMatching(TRACE_ID_PATTERN)],
    })
    expect('headers' in event).toBe(false)
    expect('queryStringParameters' in event).toBe(false)
  })

  it('injects forwarding + trace headers into the single-value map by default', () => {
    const event = buildAlbEvent({
      request: makeRequest(),
      targetGroupArn: TARGET_GROUP_ARN,
    })
    expect(event.headers['x-forwarded-for']).toBe('127.0.0.1')
    expect(event.headers['x-forwarded-port']).toBe('3000')
    expect(event.headers['x-forwarded-proto']).toBe('http')
    expect(event.headers['x-amzn-trace-id']).toMatch(TRACE_ID_PATTERN)
  })

  it('injects forwarding + trace headers into the multi-value map when multiValueHeaders is true', () => {
    const event = buildAlbEvent({
      request: makeRequest(),
      targetGroupArn: TARGET_GROUP_ARN,
      multiValueHeaders: true,
    })
    expect(event.multiValueHeaders['x-forwarded-for']).toEqual(['127.0.0.1'])
    expect(event.multiValueHeaders['x-forwarded-port']).toEqual(['3000'])
    expect(event.multiValueHeaders['x-forwarded-proto']).toEqual(['http'])
    expect(event.multiValueHeaders['x-amzn-trace-id']).toHaveLength(1)
    expect(event.multiValueHeaders['x-amzn-trace-id'][0]).toMatch(
      TRACE_ID_PATTERN,
    )
  })

  it('a client-supplied forwarding header (any casing) suppresses the default', () => {
    const event = buildAlbEvent({
      request: makeRequest({
        raw: {
          req: {
            rawHeaders: [
              'X-Forwarded-For',
              '9.9.9.9',
              'X-Forwarded-Proto',
              'https',
            ],
          },
        },
      }),
      targetGroupArn: TARGET_GROUP_ARN,
    })
    expect(event.headers['x-forwarded-for']).toBe('9.9.9.9')
    expect(event.headers['x-forwarded-proto']).toBe('https')
    // The unsent forwarding headers are still synthesized.
    expect(event.headers['x-forwarded-port']).toBe('3000')
    expect(event.headers['x-amzn-trace-id']).toMatch(TRACE_ID_PATTERN)
  })

  it('multiValueHeaders preserves duplicates from rawHeaders when enabled', () => {
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
      multiValueHeaders: true,
    })
    expect(event.multiValueHeaders['x-multi']).toEqual(['a', 'b'])
  })

  it('emits queryStringParameters null when no query (single-value mode)', () => {
    const event = buildAlbEvent({
      request: makeRequest(),
      targetGroupArn: TARGET_GROUP_ARN,
    })
    expect(event.queryStringParameters).toBeNull()
    expect('multiValueQueryStringParameters' in event).toBe(false)
  })

  it('emits multiValueQueryStringParameters null when no query (multi-value mode)', () => {
    const event = buildAlbEvent({
      request: makeRequest(),
      targetGroupArn: TARGET_GROUP_ARN,
      multiValueHeaders: true,
    })
    expect(event.multiValueQueryStringParameters).toBeNull()
    expect('queryStringParameters' in event).toBe(false)
  })

  it('emits only single-value queryStringParameters by default', () => {
    const event = buildAlbEvent({
      request: makeRequest({
        url: new URL('http://localhost:3000/orders?status=open&tag=a&tag=b'),
      }),
      targetGroupArn: TARGET_GROUP_ARN,
    })
    expect(event.queryStringParameters).toEqual({ status: 'open', tag: 'b' })
    expect('multiValueQueryStringParameters' in event).toBe(false)
  })

  it('emits only multiValueQueryStringParameters when multiValueHeaders is true', () => {
    const event = buildAlbEvent({
      request: makeRequest({
        url: new URL('http://localhost:3000/orders?status=open&tag=a&tag=b'),
      }),
      targetGroupArn: TARGET_GROUP_ARN,
      multiValueHeaders: true,
    })
    expect(event.multiValueQueryStringParameters).toEqual({
      status: ['open'],
      tag: ['a', 'b'],
    })
    expect('queryStringParameters' in event).toBe(false)
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
