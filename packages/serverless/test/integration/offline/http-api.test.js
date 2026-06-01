import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { requireEnv } from './_preflight.js'
import { bootOffline } from './_harness.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const FIXTURE = path.join(__dirname, 'fixtures/http-api')

describe('http api v2 integration', () => {
  let offline
  beforeAll(async () => {
    await requireEnv({}) // node-only fixture; no docker/runtimes needed
    offline = await bootOffline({ cwd: FIXTURE })
  })
  afterAll(async () => offline?.stop())

  it('delivers an APIGW v2 event matching the captured plugin baseline', async () => {
    const res = await offline.http('/echo?q=1', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-test': 'abc' },
      body: JSON.stringify({ hello: 'world' }),
    })
    expect(res.status).toBe(200)
    const event = await res.json()
    // Assertions below are the captured-and-verified baseline (see
    // fixtures/http-api/.captured/echo.json): APIGW v2 (payload format 2.0).
    expect(event.version).toBe('2.0')
    expect(event.rawPath).toBe('/echo')
    expect(event.requestContext.http.method).toBe('POST')
    expect(event.rawQueryString).toBe('q=1')
    expect(event.headers['x-test']).toBe('abc')
    expect(event.isBase64Encoded).toBe(false)
    expect(JSON.parse(event.body)).toEqual({ hello: 'world' })
  })
})
