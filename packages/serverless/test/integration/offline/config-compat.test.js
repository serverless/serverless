import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { requireEnv } from './_preflight.js'
import { bootOffline } from './_harness.js'
import { freePort } from './_ports.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const FIXTURE = path.join(__dirname, 'fixtures/config-compat')

// Fixed ports declared in the fixture's custom.serverless-offline block.
const FIXTURE_HTTP_PORT = 4170
const FIXTURE_LAMBDA_PORT = 4172

const APP_RE = /App endpoint:\s*\S*:(\d+)/i
const LAMBDA_RE = /Lambda endpoint:\s*\S*:(\d+)/i

// This suite asserts OUR built-in offline's serverless-offline config
// compatibility behavior directly — the fixture lists NO serverless-offline
// plugin, so the built-in command runs. No plugin capture/parity is involved.
describe('offline serverless-offline config compatibility', () => {
  describe('custom.serverless-offline (fixture-declared ports)', () => {
    let offline
    beforeAll(async () => {
      await requireEnv({}) // node-only fixture; no docker/runtimes needed
      // injectPorts:false so the fixture's own httpPort/lambdaPort take effect.
      offline = await bootOffline({ cwd: FIXTURE, injectPorts: false })
    })
    afterAll(async () => offline?.stop())

    it('honors the httpPort alias on the app server', () => {
      const port = Number(offline.logs().match(APP_RE)?.[1])
      expect(port).toBe(FIXTURE_HTTP_PORT)
    })

    it('binds the lambda endpoint to the fixture lambdaPort', () => {
      const port = Number(offline.logs().match(LAMBDA_RE)?.[1])
      expect(port).toBe(FIXTURE_LAMBDA_PORT)
    })

    it('warns once that websocketPort is ignored', () => {
      const logs = offline.logs()
      const matches = logs.match(
        /Ignoring serverless-offline option\(s\)[^\n]*websocketPort/gi,
      )
      expect(matches).toHaveLength(1)
    })

    it('does not emit a framework unrecognized-configuration warning', () => {
      const logs = offline.logs()
      expect(logs).not.toMatch(/Invalid configuration encountered/i)
      expect(logs).not.toMatch(/unrecognized property/i)
    })

    it('serves the declared httpApi route', async () => {
      const res = await offline.http('/ping')
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body).toEqual({ ok: true })
    })
  })

  describe('CLI --httpPort alias', () => {
    let offline
    beforeAll(async () => {
      await requireEnv({})
      // Boot with the CLI flag --httpPort (alias of --appPort). A distinct free
      // lambda port is injected so the appPort !== lambdaPort guard is satisfied
      // and concurrent boots never collide.
      const httpPort = await freePort()
      let lambdaPort = await freePort()
      while (lambdaPort === httpPort) lambdaPort = await freePort()
      offline = await bootOffline({
        cwd: FIXTURE,
        injectPorts: false,
        extraArgs: [
          '--httpPort',
          String(httpPort),
          '--lambdaPort',
          String(lambdaPort),
        ],
      })
      offline.expectedHttpPort = httpPort
    })
    afterAll(async () => offline?.stop())

    it('binds the app server to the CLI --httpPort value', () => {
      const port = Number(offline.logs().match(APP_RE)?.[1])
      expect(port).toBe(offline.expectedHttpPort)
    })
  })
})
