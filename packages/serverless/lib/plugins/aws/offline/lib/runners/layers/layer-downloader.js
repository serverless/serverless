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
 * @param {{ warning?: Function }} [args.logger]
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

  // Prepare a clean cache dir. A failure here (e.g. an unwritable layersDir)
  // degrades to ok:false rather than crashing boot — the handler simply runs
  // without its layers, matching the per-layer soft-warn posture.
  try {
    await fs.rm(optDir, { recursive: true, force: true })
    await fs.mkdir(optDir, { recursive: true })
  } catch (err) {
    logger?.warning?.(
      `Failed to prepare layer cache "${optDir}": ${err.message ?? err}`,
    )
    return { optDir, ok: false }
  }

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

  // Write the cache marker only when every layer succeeded, so a partial or
  // failed set is re-downloaded on the next boot rather than served stale.
  if (ok) {
    try {
      await fs.writeFile(markerPath, JSON.stringify({ arns, setKey }))
    } catch (err) {
      logger?.warning?.(
        `Failed to write layer cache marker "${markerPath}": ${err.message ?? err}`,
      )
      ok = false
    }
  }

  return { optDir, ok }
}
