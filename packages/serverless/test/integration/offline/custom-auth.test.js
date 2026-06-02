import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { requireEnv } from './_preflight.js'
import { bootOffline } from './_harness.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const CUSTOM_REST_FIXTURE = path.join(
  __dirname,
  'fixtures/authorizers/custom-rest',
)
const CUSTOM_HTTPAPI_FIXTURE = path.join(
  __dirname,
  'fixtures/authorizers/custom-httpapi',
)

// The echo handlers return the received event as the response body (AWS_PROXY
// unwraps statusCode/headers/body), so the HTTP body IS the event.
async function event(res) {
  return JSON.parse(await res.text())
}

// ---------------------------------------------------------------------------
// customAuthenticationProvider — STRICT parity with the community
// serverless-offline plugin (v14.6.0). A configured provider authenticates
// EVERY route, overriding per-route authorizers, and its plugin-shape
// credentials `{ principalId, context }` map into requestContext.authorizer.
//
// The expected values below are the captured-and-verified baseline. Both
// flavors were captured from the community plugin against these exact fixtures
// (see _capture-custom.mjs) and validated against the AWS API Gateway
// Lambda-authorizer context contract:
//   - REST v1: the authorizer context is the function's returned context spread
//     at the root of requestContext.authorizer, plus principalId.
//   - HTTP API v2: the authorizer context is namespaced under
//     requestContext.authorizer.lambda.
// Where the community plugin diverges from AWS (it emits an empty `jwt: {}`
// sibling on the v2 authorizer), OUR offline omits it — the same AWS-fidelity
// position recorded for the jwt/lambda authorizers.
// ---------------------------------------------------------------------------

describe('customAuthenticationProvider — REST API (v1), global application', () => {
  let offline
  beforeAll(async () => {
    await requireEnv({}) // node-only fixture; no docker/runtimes needed
    offline = await bootOffline({ cwd: CUSTOM_REST_FIXTURE })
  })
  afterAll(async () => offline?.stop())

  it('applies the provider to a route that declares NO authorizer (proves global scope)', async () => {
    const res = await offline.http('/dev/echo')
    expect(res.status).toBe(200)
    const ev = await event(res)
    // The custom provider authenticated the route even though the route
    // declares no `authorizer:` of its own.
    expect(ev.requestContext.authorizer).toBeDefined()
  })

  it('maps plugin-shape credentials into the REST v1 authorizer (context spread + principalId)', async () => {
    const res = await offline.http('/dev/echo')
    expect(res.status).toBe(200)
    const ev = await event(res)
    expect(ev.requestContext.authorizer).toEqual({
      source: 'custom-provider',
      expected: 'it works',
      count: 7,
      principalId: 'user-123',
    })
  })
})

describe('customAuthenticationProvider — HTTP API (v2), global application', () => {
  let offline
  beforeAll(async () => {
    await requireEnv({})
    offline = await bootOffline({ cwd: CUSTOM_HTTPAPI_FIXTURE })
  })
  afterAll(async () => offline?.stop())

  it('applies the provider to a route that declares NO authorizer (proves global scope)', async () => {
    const res = await offline.http('/echo')
    expect(res.status).toBe(200)
    const ev = await event(res)
    expect(ev.requestContext.authorizer).toBeDefined()
  })

  it('maps plugin-shape credentials into the v2 authorizer (authorizer.lambda = context)', async () => {
    const res = await offline.http('/echo')
    expect(res.status).toBe(200)
    const ev = await event(res)
    expect(ev.requestContext.authorizer.lambda).toEqual({
      source: 'custom-provider',
      expected: 'it works',
      count: 7,
    })
    // AWS-fidelity assertion: OUR offline surfaces ONLY the `lambda` block; the
    // community plugin adds a spurious empty `jwt: {}` sibling.
    expect(ev.requestContext.authorizer.jwt).toBeUndefined()
  })
})
