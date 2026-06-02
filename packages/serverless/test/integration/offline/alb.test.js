import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { requireEnv } from './_preflight.js'
import { bootOffline } from './_harness.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const FIXTURE = path.join(__dirname, 'fixtures/alb')

// The ALB event shape below was captured from the community serverless-offline
// plugin (see fixtures/alb/.captured/plugin.json) and validated against the AWS
// ALB-to-Lambda contract. The common fields (requestContext.elb.targetGroupArn,
// httpMethod, path, lowercased headers, isBase64Encoded, body) match the
// captured baseline. Three points are AWS-fidelity assertions where OUR offline
// is the AWS-correct one and the community plugin diverges:
//   1. Single- vs multi-value variant selection: real ALB emits EXACTLY ONE
//      header/query variant, governed by the target group's
//      lambda.multi_value_headers.enabled attribute. The plugin always emits
//      BOTH variants regardless of the flag; OUR offline emits exactly one.
//   2. x-forwarded-* / x-amzn-trace-id: a real load balancer injects these
//      before the request reaches the target. The plugin does not synthesize
//      them; OUR offline does.
//   3. body for a bodyless request is "" (empty string), not omitted/null. The
//      plugin omits the body field on a GET; OUR offline emits "".
// The ALB RESPONSE contract is asserted against OUR offline: the community
// plugin's ALB server crashes marshalling a handler response that carries a
// `headers` object (TypeError: type.trim is not a function), so no faithful
// plugin response capture was possible — the expected response behavior comes
// from the AWS ALB response contract.
describe('alb integration', () => {
  let offline
  beforeAll(async () => {
    await requireEnv({}) // node-only fixture; no docker/runtimes needed
    offline = await bootOffline({ cwd: FIXTURE })
  })
  afterAll(async () => offline?.stop())

  it('delivers a single-value ALB event and honors the ALB response contract', async () => {
    const res = await offline.albHttp('/single?q=a&q=b&single=x', {
      method: 'GET',
      headers: { 'x-test': 'abc', accept: 'application/json' },
    })

    // ALB response contract: the handler returned statusCode/headers/body and
    // the offline ALB server reproduced them (statusDescription is accepted but
    // not surfaced as a wire header — Hapi reconstructs the status line).
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toMatch(/application\/json/)
    expect(res.headers.get('x-echo')).toBe('yes')

    const event = await res.json()

    // ALB-distinct requestContext: elb.targetGroupArn (NOT apiId / no stage).
    expect(event.requestContext.elb.targetGroupArn).toMatch(
      /^arn:aws:elasticloadbalancing:/,
    )
    expect(event.httpMethod).toBe('GET')
    // ALB has no stages: the event path is the literal request path, stage-less.
    expect(event.path).toBe('/single')
    expect(event.isBase64Encoded).toBe(false)
    // Bodyless request → "" (empty string), an ALB-specific quirk.
    expect(event.body).toBe('')

    // Single-value variant ONLY (multi_value_headers disabled): headers +
    // queryStringParameters present, the multi-value keys absent.
    expect(event.headers).toBeDefined()
    expect(event.multiValueHeaders).toBeUndefined()
    expect(event.multiValueQueryStringParameters).toBeUndefined()
    // Headers are lowercased.
    expect(event.headers['x-test']).toBe('abc')
    // Repeated query key keeps the LAST value in the single-value map.
    expect(event.queryStringParameters).toEqual({ q: 'b', single: 'x' })

    // A real load balancer injects forwarding + trace headers.
    expect(event.headers['x-forwarded-for']).toBeDefined()
    expect(event.headers['x-forwarded-proto']).toBe('http')
    expect(event.headers['x-amzn-trace-id']).toMatch(/^Root=1-/)
  })

  it('delivers the request body verbatim on a POST', async () => {
    const res = await offline.albHttp('/single', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ hello: 'world' }),
    })
    expect(res.status).toBe(200)
    const event = await res.json()
    expect(event.httpMethod).toBe('POST')
    expect(event.body).toBe('{"hello":"world"}')
    expect(event.isBase64Encoded).toBe(false)
    // No query string on this request.
    expect(event.queryStringParameters).toBeNull()
  })

  it('delivers a multi-value ALB event when the target group enables it', async () => {
    const res = await offline.albHttp('/multi?q=a&q=b&single=x', {
      method: 'GET',
      headers: { 'x-test': 'abc' },
    })
    expect(res.status).toBe(200)
    const event = await res.json()

    expect(event.requestContext.elb.targetGroupArn).toMatch(
      /^arn:aws:elasticloadbalancing:/,
    )
    expect(event.httpMethod).toBe('GET')
    expect(event.path).toBe('/multi')

    // Multi-value variant ONLY (multi_value_headers enabled): multiValueHeaders
    // + multiValueQueryStringParameters present, the single-value keys absent.
    expect(event.multiValueHeaders).toBeDefined()
    expect(event.multiValueQueryStringParameters).toBeDefined()
    expect(event.headers).toBeUndefined()
    expect(event.queryStringParameters).toBeUndefined()
    // Headers are lowercased; each value is an array.
    expect(event.multiValueHeaders['x-test']).toEqual(['abc'])
    // All values for a repeated query key are kept in the multi-value map.
    expect(event.multiValueQueryStringParameters).toEqual({
      q: ['a', 'b'],
      single: ['x'],
    })
  })
})
