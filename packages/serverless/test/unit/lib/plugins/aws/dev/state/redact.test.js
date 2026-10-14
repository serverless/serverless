import { describe, expect, test } from '@jest/globals'
import {
  REDACTED,
  REDACTED_HEADERS,
  redactEvent,
  redactResponse,
} from '../../../../../../../lib/plugins/aws/dev/state/redact.js'

const SECRET = 'sk-test-0123456789'
// A placeholder account, built in code so no account-id-shaped literal sits in the source.
const ACCOUNT = '0'.repeat(12)

describe('redactEvent', () => {
  test('lists the headers it replaces', () => {
    expect(REDACTED).toBe('[redacted]')
    expect(REDACTED_HEADERS).toEqual([
      'authorization',
      'proxy-authorization',
      'cookie',
      'set-cookie',
      'x-api-key',
      'x-amz-security-token',
      'x-amzn-oidc-accesstoken',
      'x-amzn-oidc-data',
      'x-amzn-oidc-identity',
    ])
  })

  test('an Application Load Balancer event behind OIDC or Amazon Cognito sign-in: the tokens and identity it forwards', () => {
    const event = {
      requestContext: { elb: { targetGroupArn: 'arn' } },
      httpMethod: 'GET',
      path: '/orders',
      headers: {
        'x-amzn-oidc-accesstoken': SECRET,
        'x-amzn-oidc-data': `header.${SECRET}.signature`,
        'x-amzn-oidc-identity': 'user-sub-1234',
        'x-forwarded-for': '203.0.113.7',
      },
      multiValueHeaders: {
        'X-Amzn-Oidc-Accesstoken': [SECRET],
      },
    }
    const { value, paths } = redactEvent(event)
    expect(value.headers).toEqual({
      'x-amzn-oidc-accesstoken': REDACTED,
      'x-amzn-oidc-data': REDACTED,
      'x-amzn-oidc-identity': REDACTED,
      'x-forwarded-for': '203.0.113.7',
    })
    expect(value.multiValueHeaders).toEqual({
      'X-Amzn-Oidc-Accesstoken': [REDACTED],
    })
    expect(paths).toEqual([
      'headers.x-amzn-oidc-accesstoken',
      'headers.x-amzn-oidc-data',
      'headers.x-amzn-oidc-identity',
      'multiValueHeaders.X-Amzn-Oidc-Accesstoken',
    ])
    expect(JSON.stringify(value)).not.toContain(SECRET)
  })

  test('a REST API event: headers, multiValueHeaders and the API key, in any case', () => {
    const event = {
      httpMethod: 'POST',
      headers: {
        Authorization: `Bearer ${SECRET}`,
        'X-Api-Key': SECRET,
        Accept: 'text/plain',
      },
      multiValueHeaders: {
        Authorization: [`Bearer ${SECRET}`],
        Cookie: ['a=1', `b=${SECRET}`],
        Accept: ['text/plain'],
      },
      requestContext: { identity: { apiKey: SECRET, sourceIp: '192.0.2.1' } },
    }
    const before = JSON.stringify(event)
    const { value, paths } = redactEvent(event)
    expect(JSON.stringify(value)).not.toContain(SECRET)
    expect(value.headers).toEqual({
      Authorization: REDACTED,
      'X-Api-Key': REDACTED,
      Accept: 'text/plain',
    })
    expect(value.multiValueHeaders).toEqual({
      Authorization: [REDACTED],
      Cookie: [REDACTED, REDACTED],
      Accept: ['text/plain'],
    })
    expect(value.requestContext.identity).toEqual({
      apiKey: REDACTED,
      sourceIp: '192.0.2.1',
    })
    expect(paths).toEqual([
      'headers.Authorization',
      'headers.X-Api-Key',
      'multiValueHeaders.Authorization',
      'multiValueHeaders.Cookie',
      'requestContext.identity.apiKey',
    ])
    // The input is never changed: replay runs the raw event.
    expect(JSON.stringify(event)).toBe(before)
  })

  test('an HTTP API or function URL event: lower-case headers and every cookie', () => {
    const event = {
      version: '2.0',
      headers: {
        authorization: SECRET,
        'x-amz-security-token': SECRET,
        'proxy-authorization': SECRET,
        'content-type': 'application/json',
      },
      cookies: [`session=${SECRET}`, 'theme=dark'],
      requestContext: {
        http: { method: 'GET' },
        domainName: 'abc.lambda-url.us-east-1.on.aws',
      },
    }
    const { value, paths } = redactEvent(event)
    expect(JSON.stringify(value)).not.toContain(SECRET)
    expect(value.cookies).toEqual([REDACTED, REDACTED])
    expect(value.headers['content-type']).toBe('application/json')
    expect(paths).toEqual([
      'headers.authorization',
      'headers.x-amz-security-token',
      'headers.proxy-authorization',
      'cookies',
    ])
  })

  test('an Application Load Balancer event with multi-value headers', () => {
    const { value } = redactEvent({
      requestContext: { elb: { targetGroupArn: 'arn' } },
      multiValueHeaders: { cookie: [`a=${SECRET}`] },
    })
    expect(value.multiValueHeaders.cookie).toEqual([REDACTED])
  })

  test("a TOKEN authorizer's event: the token is replaced", () => {
    const event = {
      type: 'TOKEN',
      authorizationToken: `Bearer ${SECRET}`,
      methodArn: `arn:aws:execute-api:us-east-1:${ACCOUNT}:abc/dev/GET/orders`,
    }
    const { value, paths } = redactEvent(event)
    expect(value).toEqual({ ...event, authorizationToken: REDACTED })
    expect(paths).toEqual(['authorizationToken'])
    expect(event.authorizationToken).toContain(SECRET)
  })

  test("an HTTP API Lambda authorizer's identity sources (payload 2.0): every value is replaced", () => {
    const event = {
      version: '2.0',
      type: 'REQUEST',
      routeArn: `arn:aws:execute-api:us-east-1:${ACCOUNT}:abc/$default/GET/`,
      identitySource: [`Bearer ${SECRET}`, 'tenant-a'],
      headers: { authorization: `Bearer ${SECRET}` },
      requestContext: { http: { method: 'GET' } },
    }
    const before = JSON.stringify(event)
    const { value, paths } = redactEvent(event)
    expect(JSON.stringify(value)).not.toContain(SECRET)
    expect(value.identitySource).toEqual([REDACTED, REDACTED])
    expect(paths).toEqual(['headers.authorization', 'identitySource'])
    expect(JSON.stringify(event)).toBe(before)
  })

  test("an HTTP API Lambda authorizer's identity source (payload 1.0): the joined string is replaced", () => {
    const event = {
      version: '1.0',
      type: 'REQUEST',
      identitySource: `Bearer ${SECRET},tenant-a`,
      headers: { Authorization: `Bearer ${SECRET}` },
    }
    const { value, paths } = redactEvent(event)
    expect(JSON.stringify(value)).not.toContain(SECRET)
    expect(value.identitySource).toBe(REDACTED)
    expect(paths).toEqual(['headers.Authorization', 'identitySource'])
    expect(event.identitySource).toContain(SECRET)
  })

  test('an empty identity source is kept as it is', () => {
    for (const identitySource of [[], '']) {
      const event = { type: 'REQUEST', identitySource }
      expect(redactEvent(event)).toEqual({ value: event, paths: [] })
    }
    expect(redactEvent({ type: 'REQUEST' })).toEqual({
      value: { type: 'REQUEST' },
      paths: [],
    })
  })

  test('query strings and bodies are kept as they are', () => {
    const event = {
      rawQueryString: 'q=1',
      queryStringParameters: { q: '1' },
      body: '{"password":"x"}',
    }
    expect(redactEvent(event)).toEqual({ value: event, paths: [] })
  })

  test('events without HTTP headers, and values that are not objects, pass unchanged', () => {
    const sqs = { Records: [{ body: 'hello', messageAttributes: {} }] }
    expect(redactEvent(sqs)).toEqual({ value: sqs, paths: [] })
    expect(redactEvent('text')).toEqual({ value: 'text', paths: [] })
    expect(redactEvent(null)).toEqual({ value: null, paths: [] })
  })
})

describe('redactResponse', () => {
  test('response headers, multiValueHeaders and cookies', () => {
    const { value, paths } = redactResponse({
      statusCode: 200,
      headers: { 'Set-Cookie': `id=${SECRET}`, 'content-type': 'text/plain' },
      multiValueHeaders: { 'set-cookie': [`a=${SECRET}`, 'b=2'] },
      cookies: [`c=${SECRET}`],
      body: 'ok',
    })
    expect(JSON.stringify(value)).not.toContain(SECRET)
    expect(value.body).toBe('ok')
    expect(paths).toEqual([
      'headers.Set-Cookie',
      'multiValueHeaders.set-cookie',
      'cookies',
    ])
  })
})
