import { Buffer } from 'node:buffer'
import fs from 'node:fs/promises'
import path from 'node:path'

import { GetLayerVersionByArnCommand } from '@aws-sdk/client-lambda'

import { extractZipBuffer } from '../docker-code-mount.js'

/**
 * Download + extract one ordered ARN set into a content-addressed cache dir.
 * Never throws — a per-layer failure is logged at warning level and skipped.
 *
 * @param {object} args
 * @param {string[]} args.arns          Ordered layer ARNs (later overlays earlier).
 * @param {string} args.setKey          sha256 of the ordered ARN list.
 * @param {string} args.layersDir       Cache root.
 * @param {{ send: Function }} args.lambdaClient
 * @param {{ warning?: Function, debug?: Function }} [args.logger]
 * @returns {Promise<{ optDir: string, ok: boolean }>}
 */
export async function downloadLayerSet({
  arns,
  setKey,
  layersDir,
  lambdaClient,
  logger,
}) {
  const optDir = path.join(layersDir, setKey)
  const markerPath = path.join(optDir, '.layers.json')

  try {
    await fs.stat(markerPath)
    return { optDir, ok: true }
  } catch {
    // cache miss
  }

  await fs.rm(optDir, { recursive: true, force: true })
  await fs.mkdir(optDir, { recursive: true })

  let ok = true
  for (const arn of arns) {
    try {
      const res = await lambdaClient.send(
        new GetLayerVersionByArnCommand({ Arn: arn }),
      )
      const location = res?.Content?.Location
      if (!location) {
        throw new Error('layer version has no downloadable content location')
      }
      const resp = await fetch(location)
      if (!resp.ok) {
        throw new Error(`download responded with status ${resp.status}`)
      }
      await extractZipBuffer(Buffer.from(await resp.arrayBuffer()), optDir)
    } catch (err) {
      logger?.warning?.(`Failed to load layer "${arn}": ${err.message ?? err}`)
      ok = false
    }
  }

  if (ok) {
    await fs.writeFile(markerPath, JSON.stringify({ arns, setKey }))
  }

  return { optDir, ok }
}
