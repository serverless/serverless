import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { requireEnv } from './_preflight.js'
import { bootOffline } from './_harness.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const FIXTURE = path.join(__dirname, 'fixtures/lambda-invoke')

// Deployed names are `<service>-dev-<fnKey>` (service: it-lambda-invoke).
const SERVICE = 'it-lambda-invoke'
const WORKER = `${SERVICE}-dev-worker`
const THROWER = `${SERVICE}-dev-thrower`

// The invoke envelopes asserted below were captured from the community
// serverless-offline plugin (see fixtures/lambda-invoke/.captured/invoke.json)
// and validated against the AWS Lambda Invoke API contract
// (https://docs.aws.amazon.com/lambda/latest/dg/API_Invoke.html). The common,
// AWS-correct shapes match the captured baseline: a sync (RequestResponse)
// invoke returns 200 with the handler's JSON return as the body; an async
// (Event) invoke returns 202 with an empty body; an unhandled handler error
// returns 200 with an `X-Amz-Function-Error: Unhandled` header and an
// errorType/errorMessage/trace envelope; an unknown function name returns 404
// with `x-amzn-ErrorType: ResourceNotFoundException`. Two assertions are
// AWS-fidelity wins where the captured community baseline diverges and OUR
// offline is the AWS-correct side (see fixtures .captured + the recorded
// divergences): the sync response carries an `X-Amz-Executed-Version` header,
// and a DryRun invoke returns 204 (the plugin rejects DryRun with a 400).

describe('lambda invoke integration', () => {
  let offline
  beforeAll(async () => {
    await requireEnv({}) // node-only fixture; no docker/runtimes needed
    offline = await bootOffline({ cwd: FIXTURE })
  })
  afterAll(async () => offline?.stop())

  // Raw POST to the invoke endpoint, so the test can drive invocation-type
  // headers (DryRun) the harness invoke() helper doesn't expose.
  function raw(name, { headers = {}, body } = {}) {
    return fetch(
      `${offline.lambdaUrl}/2015-03-31/functions/${name}/invocations`,
      {
        method: 'POST',
        headers,
        body: body === undefined ? '' : JSON.stringify(body),
      },
    )
  }

  it('sync (RequestResponse): 200 + handler-return JSON + X-Amz-Executed-Version', async () => {
    const res = await offline.invoke(WORKER, { hello: 'world' })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, received: { hello: 'world' } })
    // AWS-fidelity assertion: AWS returns the executed version header on a
    // successful sync invoke; the captured community baseline omits it.
    expect(res.headers.get('x-amz-executed-version')).toBe('$LATEST')
  })

  it('async (Event): 202 + empty body', async () => {
    const res = await offline.invoke(
      WORKER,
      { hello: 'async' },
      { async: true },
    )
    expect(res.status).toBe(202)
    expect(await res.text()).toBe('')
  })

  it('handler error (sync): 200 + X-Amz-Function-Error: Unhandled + error envelope', async () => {
    const res = await offline.invoke(THROWER, {})
    expect(res.status).toBe(200)
    expect(res.headers.get('x-amz-function-error')).toBe('Unhandled')
    const body = await res.json()
    expect(body.errorMessage).toBe('boom from thrower')
    expect(typeof body.errorType).toBe('string')
    expect(Array.isArray(body.trace)).toBe(true)
    expect(body.trace.length).toBeGreaterThan(0)
  })

  it('unknown function name: 404 + x-amzn-ErrorType: ResourceNotFoundException', async () => {
    const res = await raw(`${SERVICE}-dev-nope`, { body: {} })
    expect(res.status).toBe(404)
    expect(res.headers.get('x-amzn-errortype')).toBe(
      'ResourceNotFoundException',
    )
  })

  it('DryRun: 204', async () => {
    // AWS-fidelity assertion: a DryRun invoke validates parameters/permissions
    // and returns 204 with no body. The captured community baseline rejects
    // DryRun with a 400 InvalidParameterValueException; OURS is AWS-correct.
    const res = await raw(WORKER, {
      headers: { 'x-amz-invocation-type': 'DryRun' },
      body: {},
    })
    expect(res.status).toBe(204)
  })
})
