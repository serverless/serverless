/**
 * Boot-time S3 wiring for sls offline.
 *
 * Ties the S3 emulator's three moving parts together for a running service:
 *  1. ensures every bucket the service references exists in the store —
 *     provisioned `AWS::S3::Bucket` resources (the registry) plus every bucket
 *     named by an `events: - s3` declaration;
 *  2. derives the notification configs from those `events: - s3` declarations
 *     and builds the notifier; and
 *  3. starts one drop-folder watcher per bucket, and returns the combined
 *     `onMutation` handler the boot layer wires onto the store.
 *
 * The combined `onMutation` does two things for each store mutation: it fans
 * the event out to the notifier (S3 → Lambda), and — unless the mutation came
 * from the drop folder itself — it mirrors the change onto the bucket's drop
 * folder so SDK writes show up on disk. The mirror registers the path in the
 * watcher's `suppress` set before touching the file, so the filesystem event
 * the write triggers is swallowed instead of looping back into the store.
 */

import fs from 'node:fs/promises'
import path from 'node:path'
import { allS3Buckets } from '../provisioner/registry.js'
import { FAKE_REGION } from '../constants.js'
import { createS3Notifier } from './s3-notifications.js'
import { createDropFolderWatcher } from './s3-drop-folder.js'

/** Default root, relative to the service dir, under which buckets are mirrored. */
const DEFAULT_BUCKETS_ROOT = '.serverless-offline/buckets'

/**
 * Resolve the bucket name an `events: - s3` entry refers to. The short form is
 * the bucket name string; the object form carries it on `.bucket` (which may be
 * a string or an unresolved CloudFormation intrinsic — the latter is skipped).
 *
 * @param {string|object} s3Event
 * @returns {string|undefined}
 */
function bucketNameFromEvent(s3Event) {
  if (typeof s3Event === 'string') return s3Event
  if (s3Event && typeof s3Event === 'object') {
    if (typeof s3Event.bucket === 'string') return s3Event.bucket
  }
  return undefined
}

/**
 * Wire the S3 emulator for a service.
 *
 * @param {object} params
 * @param {object} params.serverless - the Serverless instance.
 * @param {ReturnType<import('../provisioner/registry.js').createRegistry>} params.registry
 * @param {ReturnType<import('../aws-api-server/s3/bucket-store.js').createBucketStore>} params.store
 * @param {(functionKey: string) => { invoke(event: unknown): Promise<unknown> }} params.getLambdaFunction
 * @param {{ error: Function, debug?: Function }} params.logger
 * @param {string} [params.bucketsRoot] - root folder for the per-bucket drop folders.
 * @param {string} [params.region] - region stamped onto S3 events.
 * @returns {Promise<{
 *   bucketCount: number,
 *   watchers: { stop(): Promise<void>, suppress: Set<string>, dir: string }[],
 *   notifier: { notify(mutation: object): void },
 *   onMutation: (mutation: object) => void,
 * }>}
 */
export async function wireS3({
  serverless,
  registry,
  store,
  getLambdaFunction,
  logger,
  bucketsRoot = DEFAULT_BUCKETS_ROOT,
  region = FAKE_REGION,
}) {
  // ── 1. Collect the bucket set ──────────────────────────────────────────────
  const bucketNames = new Set()
  for (const bucket of allS3Buckets(registry)) {
    if (bucket?.name) bucketNames.add(bucket.name)
  }

  // ── 2. Build notification configs from each function's `events: - s3` ──────
  /** @type {{ functionKey: string, bucket: string, event: string, rules: object[] }[]} */
  const configs = []
  const functions = serverless.service.functions ?? {}
  for (const [functionKey, fn] of Object.entries(functions)) {
    for (const event of fn?.events ?? []) {
      if (!event || event.s3 === undefined) continue

      const bucket = bucketNameFromEvent(event.s3)
      if (!bucket) continue
      bucketNames.add(bucket)

      const detail = typeof event.s3 === 'object' ? event.s3 : {}
      configs.push({
        functionKey,
        bucket,
        event: detail.event ?? 's3:ObjectCreated:*',
        rules: detail.rules ?? [],
      })
    }
  }

  // ── 3. Ensure every bucket exists in the store ─────────────────────────────
  for (const name of bucketNames) {
    store.createBucket(name)
  }

  // ── 4. Build the notifier ──────────────────────────────────────────────────
  const notifier = createS3Notifier({
    configs,
    getLambdaFunction,
    logger,
    region,
  })

  // ── 5. Start a drop-folder watcher per bucket ──────────────────────────────
  /** @type {Map<string, { suppress: Set<string>, dir: string }>} */
  const watchersByBucket = new Map()
  const watchers = []
  for (const name of bucketNames) {
    const dir = path.join(bucketsRoot, name)
    const watcher = await createDropFolderWatcher({
      store,
      bucketName: name,
      dir,
      logger,
    })
    watchersByBucket.set(name, watcher)
    watchers.push(watcher)
  }

  /**
   * Mirror a store mutation onto the bucket's drop folder. Registers the path
   * in the watcher's `suppress` set first so the filesystem event the write (or
   * unlink) raises is swallowed rather than looping back into the store.
   *
   * @param {{ bucket: string, key: string, eventName: string }} mutation
   * @returns {Promise<void>}
   */
  async function mirror(mutation) {
    const watcher = watchersByBucket.get(mutation.bucket)
    if (!watcher) return

    const filePath = path.join(watcher.dir, mutation.key)

    if (mutation.eventName.startsWith('ObjectRemoved:')) {
      watcher.suppress.add(mutation.key)
      try {
        await fs.rm(filePath, { force: true })
      } catch (err) {
        watcher.suppress.delete(mutation.key)
        logger.error(
          `[sls:offline:s3] Failed to mirror delete of "${mutation.key}" ` +
            `from bucket "${mutation.bucket}": ${err.message}`,
        )
      }
      return
    }

    // Create/overwrite: read the freshly stored body and write it to disk.
    const object = store.getObject(mutation.bucket, mutation.key)
    if (!object) return
    watcher.suppress.add(mutation.key)
    try {
      await fs.mkdir(path.dirname(filePath), { recursive: true })
      await fs.writeFile(filePath, object.body)
    } catch (err) {
      watcher.suppress.delete(mutation.key)
      logger.error(
        `[sls:offline:s3] Failed to mirror "${mutation.key}" to bucket ` +
          `"${mutation.bucket}" drop folder: ${err.message}`,
      )
    }
  }

  /**
   * The combined store mutation handler: notify, then (for non-drop-folder
   * mutations) mirror to disk.
   *
   * @param {{ bucket: string, key: string, eventName: string, origin?: string }} mutation
   * @returns {void}
   */
  function onMutation(mutation) {
    notifier.notify(mutation)
    if (mutation.origin === 'drop-folder') return
    // Fire-and-forget the mirror; a disk failure is logged, never thrown back
    // into the store's data path.
    mirror(mutation).catch((err) => {
      logger.error(
        `[sls:offline:s3] Drop-folder mirror failed for "${mutation.key}": ${err.message}`,
      )
    })
  }

  return {
    bucketCount: bucketNames.size,
    watchers,
    notifier,
    onMutation,
  }
}
