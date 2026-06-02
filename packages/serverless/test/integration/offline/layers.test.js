import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { requireEnv } from './_preflight.js'
import { bootOffline } from './_harness.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const FIXTURE = path.join(__dirname, 'fixtures/layers-mount')

// Booted-offline layer-mount integration. This drives the FULL boot path —
// resolveFunctionLayers → downloadLayerSet → buildLayerMount → Docker bind at
// /opt — and asserts a real handler reads layer content through `sls offline`,
// complementing the module-level downloader coverage in layers-download.test.js.
//
// LIMITATION (documented in the offline differences docs): our offline only mounts layers
// for Docker-backed functions, and it sources the layer tree by DOWNLOADING a
// published-ARN layer from real AWS (GetLayerVersionByArn). Locally-defined
// `layers:` entries are deliberately skipped offline. There is no local-path
// layer option in the boot, so a fully self-contained offline layer-mount test
// is not feasible without real AWS. This test is therefore opt-in, gated on a
// real published layer ARN the operator provides:
//   OFFLINE_LAYER_ARN=arn:aws:lambda:<region>:<acct>:layer:<name>:<version>
// with AWS credentials carrying lambda:GetLayerVersion on that ARN. When unset
// the suite is skipped (the always-on module-level downloader test still runs
// gated the same way in layers-download.test.js).
const describeMaybe = process.env.OFFLINE_LAYER_ARN ? describe : describe.skip

describeMaybe('layer mount integration (booted offline + Docker)', () => {
  let offline
  beforeAll(async () => {
    await requireEnv({ docker: true })
    offline = await bootOffline({ cwd: FIXTURE, readyMs: 180_000 })
  }, 240_000)
  afterAll(async () => offline?.stop())

  it('mounts the published layer at /opt and the handler reads it', async () => {
    const res = await offline.http('/opt-read')
    expect(res.status).toBe(200)
    const body = await res.json()
    // The layer tree is bind-mounted read-only at /opt inside the container.
    expect(body.optExists).toBe(true)
    // A published layer always extracts at least one top-level entry.
    expect(Array.isArray(body.optEntries)).toBe(true)
    expect(body.optEntries.length).toBeGreaterThan(0)
    expect(body.isOffline).toBe('true')
  }, 180_000)
})
