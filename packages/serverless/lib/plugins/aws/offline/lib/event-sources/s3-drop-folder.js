/**
 * Drop-folder ↔ bucket-store sync for sls offline.
 *
 * Watches one on-disk folder per bucket so a developer can interact with a
 * local S3 bucket by dropping files into it (and see SDK writes appear there in
 * turn — that mirror lives in the wiring layer). A chokidar watcher maps
 * filesystem events onto the store:
 *   - `add` / `change` → `putObject(bucket, relKey, { body, contentType }, { origin: 'drop-folder' })`
 *   - `unlink`         → `deleteObject(bucket, relKey, { origin: 'drop-folder' })`
 * where `relKey` is the path relative to the folder, in POSIX form.
 *
 * Feedback-loop guard. The wiring mirror writes store → file for SDK-originated
 * mutations, which makes chokidar fire an `add`/`change` for a path that is
 * already in the store with identical bytes. Two defences prevent re-entry:
 *   1. a `suppress` set the mirror populates *before* it writes — the watcher
 *      skips (and clears) any path it finds there; and
 *   2. an idempotency check — if the file's bytes already equal the stored
 *      object's body, the watcher does nothing.
 * The `{ origin: 'drop-folder' }` tag on the store call lets the mirror tell
 * filesystem-originated mutations apart from SDK ones so it never writes a
 * dropped file straight back over itself.
 */

import fs from 'node:fs/promises'
import path from 'node:path'
import chokidar from 'chokidar'

/** Content-Type assigned when the extension is unknown (matches the store). */
const DEFAULT_CONTENT_TYPE = 'binary/octet-stream'

/** A small extension → Content-Type table covering common drop-folder files. */
const CONTENT_TYPES = {
  '.json': 'application/json',
  '.txt': 'text/plain',
  '.html': 'text/html',
  '.htm': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.xml': 'application/xml',
  '.csv': 'text/csv',
  '.pdf': 'application/pdf',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.zip': 'application/zip',
  '.gz': 'application/gzip',
}

/**
 * Resolve a Content-Type from a file path's extension, defaulting to the binary
 * octet-stream type S3 uses for unknown content.
 *
 * @param {string} filePath
 * @returns {string}
 */
function contentTypeFor(filePath) {
  return (
    CONTENT_TYPES[path.extname(filePath).toLowerCase()] ?? DEFAULT_CONTENT_TYPE
  )
}

/**
 * Create and start a drop-folder watcher for a single bucket.
 *
 * @param {object} params
 * @param {ReturnType<import('../aws-api-server/s3/bucket-store.js').createBucketStore>} params.store
 * @param {string} params.bucketName
 * @param {string} params.dir - the folder to watch (created if missing).
 * @param {{ error: Function, debug?: Function }} params.logger
 * @returns {Promise<{ stop(): Promise<void>, suppress: Set<string>, dir: string }>}
 */
export async function createDropFolderWatcher({
  store,
  bucketName,
  dir,
  logger,
}) {
  // Ensure the folder exists and carries a `.gitignore` that excludes its
  // contents — the drop folder holds developer scratch data, never source.
  await fs.mkdir(dir, { recursive: true })
  const gitignorePath = path.join(dir, '.gitignore')
  try {
    await fs.access(gitignorePath)
  } catch {
    await fs.writeFile(gitignorePath, '*\n')
  }

  /**
   * Paths (relative, POSIX) the mirror is about to write store → file. The
   * mirror adds a path here before writing; the watcher skips and clears it so
   * the resulting filesystem event never loops back into the store.
   *
   * @type {Set<string>}
   */
  const suppress = new Set()

  /**
   * Translate an absolute watched path into the object key: relative to the
   * watched folder, with POSIX separators.
   *
   * @param {string} filePath
   * @returns {string}
   */
  function toKey(filePath) {
    return path.relative(dir, filePath).split(path.sep).join('/')
  }

  /**
   * Handle an `add` / `change` event: read the bytes and put them into the
   * store unless the change originated from the mirror (suppressed) or is a
   * byte-for-byte repeat of what is already stored (idempotent).
   *
   * @param {string} filePath
   * @returns {Promise<void>}
   */
  async function onAddOrChange(filePath) {
    const key = toKey(filePath)
    // Never sync the .gitignore marker the watcher itself wrote.
    if (key === '.gitignore') return

    // Guard 1 — the mirror is writing this path; consume the suppression and
    // skip so we don't put the SDK's own bytes back into the store.
    if (suppress.has(key)) {
      suppress.delete(key)
      return
    }

    let body
    try {
      body = await fs.readFile(filePath)
    } catch (err) {
      // The file vanished between the event and the read (a quick create +
      // delete); nothing to sync.
      logger.debug?.(
        `[sls:offline:s3] Could not read dropped file "${filePath}": ${err.message}`,
      )
      return
    }

    // Guard 2 — the stored object already holds identical bytes (e.g. a
    // mirrored write that slipped past suppression); putting again would only
    // emit a redundant mutation, so short-circuit.
    const existing = store.getObject(bucketName, key)
    if (existing && existing.body.equals(body)) return

    store.putObject(
      bucketName,
      key,
      { body, contentType: contentTypeFor(filePath) },
      { origin: 'drop-folder' },
    )
  }

  /**
   * Handle an `unlink` event: remove the object from the store.
   *
   * @param {string} filePath
   * @returns {void}
   */
  function onUnlink(filePath) {
    const key = toKey(filePath)
    if (key === '.gitignore') return
    if (suppress.has(key)) {
      suppress.delete(key)
      return
    }
    store.deleteObject(bucketName, key, { origin: 'drop-folder' })
  }

  const watcher = chokidar.watch(dir, {
    persistent: false, // don't hold the Node event loop open
    ignoreInitial: false, // seed already-present files into the store on boot
    // Wait for writes to settle before reading so we never grab a partial file.
    awaitWriteFinish: { stabilityThreshold: 100, pollInterval: 50 },
  })

  watcher.on('add', (filePath) => {
    onAddOrChange(filePath).catch((err) => {
      logger.error(
        `[sls:offline:s3] Failed to sync added file "${filePath}": ${err.message}`,
      )
    })
  })
  watcher.on('change', (filePath) => {
    onAddOrChange(filePath).catch((err) => {
      logger.error(
        `[sls:offline:s3] Failed to sync changed file "${filePath}": ${err.message}`,
      )
    })
  })
  watcher.on('unlink', onUnlink)

  // Resolve once chokidar has finished its initial directory scan, so existing
  // files are seeded into the store before the caller proceeds.
  await new Promise((resolve) => watcher.once('ready', resolve))

  let stopped = false

  return {
    suppress,
    dir,

    /**
     * Close the watcher. Safe to call more than once.
     *
     * @returns {Promise<void>}
     */
    async stop() {
      if (stopped) return
      stopped = true
      await watcher.close()
    },
  }
}
