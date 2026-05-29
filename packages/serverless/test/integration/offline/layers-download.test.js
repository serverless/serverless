import { mkdtemp, rm, readdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { LambdaClient } from '@aws-sdk/client-lambda'
import {
  downloadLayerSet,
  // eslint-disable-next-line import/extensions
} from '../../../lib/plugins/aws/offline/lib/runners/layers/layer-downloader.js'
import { layerSetKey } from '../../../lib/plugins/aws/offline/lib/runners/layers/layer-resolver.js'

// Opt-in integration test: hits real AWS (GetLayerVersionByArn) and downloads a
// real published layer archive. Skipped unless both env vars are set:
//   OFFLINE_LAYERS_IT=1
//   OFFLINE_LAYER_ARN=arn:aws:lambda:<region>:<acct>:layer:<name>:<version>
// Requires real AWS credentials with lambda:GetLayerVersion on that ARN.
const enabled =
  process.env.OFFLINE_LAYERS_IT === '1' && !!process.env.OFFLINE_LAYER_ARN
const describeMaybe = enabled ? describe : describe.skip

describeMaybe('downloadLayerSet (real AWS)', () => {
  const arn = process.env.OFFLINE_LAYER_ARN
  const region = process.env.AWS_REGION ?? 'us-east-1'
  let layersDir

  beforeAll(async () => {
    layersDir = await mkdtemp(path.join(tmpdir(), 'layer-it-'))
  })

  afterAll(async () => {
    if (layersDir) await rm(layersDir, { recursive: true, force: true })
  })

  it('downloads and extracts a published layer into a cached /opt dir', async () => {
    const arns = [arn]
    const setKey = layerSetKey(arns)
    const lambdaClient = new LambdaClient({ region })
    const warnings = []
    const logger = { warning: (m) => warnings.push(m) }

    const { optDir, ok } = await downloadLayerSet({
      arns,
      setKey,
      layersDir,
      lambdaClient,
      logger,
    })

    expect(warnings).toEqual([])
    expect(ok).toBe(true)
    const entries = await readdir(optDir)
    // A published layer always extracts at least one top-level entry (the
    // marker file is filtered out of readdir only if it is the sole entry).
    expect(entries.filter((e) => e !== '.layers.json').length).toBeGreaterThan(
      0,
    )
  }, 60000)
})
