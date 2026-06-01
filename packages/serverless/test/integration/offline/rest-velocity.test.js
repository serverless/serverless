import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { requireEnv } from './_preflight.js'
import { bootOffline } from './_harness.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const FIXTURE = path.join(__dirname, 'fixtures/rest-velocity')

// The assertions below are the captured-and-verified baseline. The Lambda-proxy
// event and CORS preflight shapes were captured from the community
// serverless-offline plugin (see fixtures/rest-velocity/.captured/plugin.json)
// and validated against the AWS API Gateway REST API (v1) contract. Two fields
// are AWS-fidelity assertions where OUR offline is the AWS-correct one and the
// community plugin diverges (noted inline). The non-proxy response template and
// status-code mapping are AWS-fidelity assertions: the community plugin did not
// apply the response template or the status-code selection for this fixture, so
// there was no faithful plugin capture for those — the expected values come
// from the AWS mapping-template contract.
describe('rest api v1 integration', () => {
  let offline
  beforeAll(async () => {
    await requireEnv({}) // node-only fixture; no docker/runtimes needed
    offline = await bootOffline({ cwd: FIXTURE })
  })
  afterAll(async () => offline?.stop())

  it('delivers an APIGW REST v1 lambda-proxy event matching the captured baseline', async () => {
    const res = await offline.http('/dev/items/42?q=1&q=2&single=x', {
      method: 'GET',
      headers: { 'x-test': 'abc', accept: 'application/json' },
    })
    expect(res.status).toBe(200)
    const event = await res.json()

    // APIGW v1 proxy shape — distinct from v2: top-level multi-value maps,
    // `httpMethod`/`resource`, `path` is stage-LESS, `pathParameters` is `null`
    // (not absent) when empty.
    expect(event.resource).toBe('/items/{id}')
    expect(event.path).toBe('/items/42') // stage prefix stripped from event.path
    expect(event.httpMethod).toBe('GET')
    expect(event.isBase64Encoded).toBe(false)
    expect(event.body).toBeNull()
    expect(event.stageVariables).toBeNull()

    // Headers + multiValueHeaders (REST v1 preserves wire casing; here all
    // lowercase as sent). The single-value map mirrors the multi-value map.
    expect(event.headers['x-test']).toBe('abc')
    expect(event.multiValueHeaders['x-test']).toEqual(['abc'])

    // Query single- and multi-value maps. APIGW v1 keeps the LAST value for a
    // repeated key in the single-value map, all values in the multi-value map.
    expect(event.queryStringParameters).toEqual({ q: '2', single: 'x' })
    expect(event.multiValueQueryStringParameters).toEqual({
      q: ['1', '2'],
      single: ['x'],
    })

    // Path parameters from the `{id}` template.
    expect(event.pathParameters).toEqual({ id: '42' })

    // requestContext — REST-style flat shape.
    const ctx = event.requestContext
    expect(ctx.stage).toBe('dev')
    expect(ctx.httpMethod).toBe('GET')
    expect(ctx.resourcePath).toBe('/items/{id}') // stage-less (AWS-correct)
    // requestContext.path carries the FULL wire path WITH the stage prefix —
    // this is the AWS-correct value. The community plugin omits the stage here
    // (reports `/items/42`); OUR offline matches AWS (`/dev/items/42`).
    expect(ctx.path).toBe('/dev/items/42')
    expect(typeof ctx.requestId).toBe('string')
    expect(ctx.requestId.length).toBeGreaterThan(0)
    // identity is present with a sourceIp; userAgent echoes the client.
    expect(typeof ctx.identity).toBe('object')
    expect(typeof ctx.identity.sourceIp).toBe('string')
    expect(ctx.identity.userAgent).toBe('node')
  })

  it('applies the velocity request + response templates on the non-proxy route', async () => {
    const res = await offline.http('/dev/items', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-test': 'agent-9' },
      body: JSON.stringify({ name: 'neo' }),
    })
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toMatch(/application\/json/)

    // The handler received the velocity-MAPPED input (not the raw HTTP event):
    // it echoed the mapped `who` back as `echoedWho`, and the response template
    // rendered `{ message: <echoedWho>, wrapped: true }`. The captured plugin
    // baseline confirms the handler received the mapped input
    // ({ who: 'neo', method: 'POST', stage: 'dev', resourcePath: '/items',
    // agent: 'agent-9', ... }); the response-template render is an AWS-fidelity
    // assertion (the plugin did not apply the response template for this case).
    const body = await res.json()
    expect(body).toEqual({ message: 'neo', wrapped: true })
  })

  it('applies the non-proxy status-code mapping for a matching error', async () => {
    // The handler throws `item not found` when the mapped `who` is 'missing'.
    // The `statusCodes['404']` entry's pattern `.*not found.*` selects the 404
    // response and its template. AWS-fidelity assertion: the community plugin
    // returned 502 with the raw error envelope rather than applying the
    // status-code selection, so no faithful plugin capture was possible here.
    const res = await offline.http('/dev/items', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'missing' }),
    })
    expect(res.status).toBe(404)
    const body = await res.json()
    expect(body).toEqual({ error: 'missing' })
  })

  it('synthesizes a CORS preflight matching the captured baseline', async () => {
    const res = await offline.http('/dev/items/42', {
      method: 'OPTIONS',
      headers: {
        origin: 'https://example.com',
        'access-control-request-method': 'GET',
        'access-control-request-headers': 'content-type',
      },
    })
    // REST API answers a preflight (MOCK integration) with 200.
    expect(res.status).toBe(200)
    // `cors: true` allows any origin; with credentials off the allow-origin is
    // the `*` wildcard. (The community plugin echoes the request origin because
    // it always sets allow-credentials; OUR offline matches the AWS default for
    // `cors: true` — wildcard origin, no credentials.)
    expect(res.headers.get('access-control-allow-origin')).toBe('*')
    // Allow-Methods lists the path's declared method plus OPTIONS.
    const allowMethods = res.headers.get('access-control-allow-methods')
    expect(allowMethods.split(',').sort()).toEqual(['GET', 'OPTIONS'])
    // Allow-Headers is the AWS default CORS allow-list for `cors: true`.
    const allowHeaders = res.headers.get('access-control-allow-headers')
    expect(allowHeaders).toContain('Content-Type')
    expect(allowHeaders).toContain('Authorization')
    expect(allowHeaders).toContain('X-Api-Key')
  })
})
