import http from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { requireEnv } from './_preflight.js'
import { bootOffline } from './_harness.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const FIXTURE = path.join(__dirname, 'fixtures/resource-routes')

// Verifies the built-in `sls offline` resourceRoutes feature: an API Gateway
// HTTP_PROXY integration declared directly in CloudFormation `resources` is
// parsed, mounted at /<stage>/<path>, and forwards matching requests upstream
// (via @hapi/h2o2) with the path param substituted into the integration Uri and
// the query string passed through.
//
// The upstream lives on an ephemeral port chosen at test time, so the Uri can't
// be hardcoded. The fixture's Uri is `${env:RESOURCE_ROUTES_UPSTREAM}/up/{proxy}`;
// we set RESOURCE_ROUTES_UPSTREAM before booting, and the offline child inherits
// process.env from the harness (see _harness.js: env spreads ...process.env).
describe('resourceRoutes (HTTP_PROXY) integration', () => {
  let offline
  let stubServer
  let stubPort

  beforeAll(async () => {
    await requireEnv({}) // node-only fixture; no docker/runtimes needed

    // Stub upstream: echoes the method + received URL so the test can assert the
    // substituted path and forwarded query string.
    stubServer = http.createServer((req, res) => {
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ ok: true, method: req.method, url: req.url }))
    })
    await new Promise((resolve, reject) => {
      stubServer.once('error', reject)
      stubServer.listen(0, '127.0.0.1', resolve)
    })
    stubPort = stubServer.address().port

    process.env.RESOURCE_ROUTES_UPSTREAM = `http://127.0.0.1:${stubPort}`
    offline = await bootOffline({
      cwd: FIXTURE,
      extraArgs: ['--host', '127.0.0.1'],
    })
  })

  afterAll(async () => {
    await offline?.stop()
    await new Promise((resolve) => stubServer?.close(resolve))
    delete process.env.RESOURCE_ROUTES_UPSTREAM
  })

  it('forwards a proxied resource route to the upstream stub', async () => {
    // /dev/public/hello?x=1 → proxy param 'hello' substituted into the Uri →
    // upstream sees /up/hello, with the query string passed through.
    const res = await offline.http('/dev/public/hello?x=1')

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(body.url).toBe('/up/hello?x=1')
  })
})
