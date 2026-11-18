/**
 * The files of the record that are kept per request: the invocation files
 * (`.serverless/dev/invocations/<function>/`) and the web request files
 * (`.serverless/dev/requests/<web app>/`). Both kinds share one budget: at most a number of files
 * per function or web app (each writer says how many), and RECORD_BYTES_PER_SERVICE in all,
 * oldest removed first. One session's recorders share one `createRecordFiles` (`recordFilesOf`),
 * so each counts the other's files.
 */
import nodeFs from 'fs'
import path from 'path'
import { FILES } from './paths.js'
import { recordFilesIn } from './read.js'
import {
  ensureRealDir,
  isRealDir,
  isRegularFile,
  temporaryNameOf,
  writeNewFile,
} from './real-dir.js'

export const RECORD_BYTES_PER_SERVICE = 200 * 1024 * 1024
/** The trees of per-request files, by kind: each holds one directory per function or web app. */
export const RECORD_TREES = Object.freeze([FILES.invocations, FILES.requests])

const byAge = (a, b) => a.seconds - b.seconds || a.name.localeCompare(b.name)

/**
 * The files already kept in every tree (the readers' scan, with sizes), oldest first:
 * `{ tree, group, name, seconds, bytes }`. Only regular files count (never a link).
 */
const scanKept = (fs, dir) => {
  const kept = []
  for (const tree of RECORD_TREES) {
    for (const item of recordFilesIn({ dir, tree, fs })) {
      try {
        const stats = fs.lstatSync(path.join(dir, tree, item.group, item.name))
        if (!stats.isFile()) continue
        kept.push({
          tree,
          group: item.group,
          name: item.name,
          seconds: item.seconds,
          bytes: stats.size,
        })
      } catch {
        // Removed meanwhile.
      }
    }
  }
  return kept.sort(byAge)
}

/**
 * `dir` is the session's `.serverless/dev` directory. `write(...)` writes one file whole (or not at
 * all, and throws) and then removes the oldest files past the limits, never the one it wrote.
 * `onError` hears of a file that could not be removed.
 */
export const createRecordFiles = ({
  dir,
  fs = nodeFs,
  bytesPerService = RECORD_BYTES_PER_SERVICE,
  onError = () => {},
}) => {
  let kept = null
  let keptBytes = 0

  /**
   * Removes a kept file: only a regular file, in a directory that is a real one. Returns whether
   * it no longer counts: deleted, already gone, or not a file of the record. A file that could not
   * be deleted (one another process holds open, on Windows) stays counted, and a later prune tries
   * it again.
   */
  const remove = (item) => {
    const file = path.join(dir, item.tree, item.group, item.name)
    try {
      if (
        isRealDir({ dir, sub: [item.tree, item.group], fs }) &&
        isRegularFile(fs, file)
      ) {
        fs.rmSync(file, { force: true })
      }
    } catch (error) {
      if (error?.code !== 'ENOENT') {
        onError(error)
        return false
      }
    }
    keptBytes -= item.bytes
    return true
  }

  /**
   * Keeps at most `perGroup` files of the written file's function or web app and
   * `bytesPerService` in all, oldest first, and never the file just `written`: its record names it
   * (a request that started before another may end after it).
   */
  const prune = (written, perGroup) => {
    const others = kept.filter((item) => item !== written)
    const ofGroup = others.filter(
      (item) => item.tree === written.tree && item.group === written.group,
    )
    const over = new Set(
      ofGroup.slice(0, Math.max(0, ofGroup.length + 1 - perGroup)),
    )
    const removed = new Set()
    for (const item of over) if (remove(item)) removed.add(item)
    for (const item of others) {
      if (keptBytes <= bytesPerService) break
      if (over.has(item)) continue
      if (remove(item)) removed.add(item)
    }
    kept = kept.filter((item) => !removed.has(item))
  }

  return {
    /**
     * Writes `content` as `<dir>/<tree>/<group>/<name>` and keeps the limits (`perGroup` files of
     * this group). Throws when it could not be written; the file it would replace may be gone then.
     */
    write({ tree, group, name, seconds, content, perGroup }) {
      let temporary = null
      // The kept file this write replaces, once it was removed to make way (see below).
      let removed = null
      try {
        if (!kept) {
          // Files of earlier sessions count too: read once, then kept up to date here.
          kept = scanKept(fs, dir)
          keptBytes = kept.reduce((sum, item) => sum + item.bytes, 0)
        }
        const folder = ensureRealDir({ dir, sub: [tree, group], fs })
        const file = path.join(folder, name)
        const text = `${JSON.stringify(content, null, 2)}\n`
        temporary = temporaryNameOf(file)
        writeNewFile(fs, temporary, text)
        try {
          fs.renameSync(temporary, file)
        } catch {
          // Windows does not replace an existing file in a rename (an asynchronous retry keeps
          // its request id and may start in the same second).
          fs.rmSync(file, { force: true })
          removed = { tree, group, name }
          fs.renameSync(temporary, file)
        }
        temporary = null
        const previous = kept.findIndex(
          (item) =>
            item.tree === tree && item.group === group && item.name === name,
        )
        if (previous !== -1) keptBytes -= kept.splice(previous, 1)[0].bytes
        const size = Buffer.byteLength(text)
        const written = { tree, group, name, seconds, bytes: size }
        kept.push(written)
        keptBytes += size
        kept.sort(byAge)
        prune(written, perGroup)
      } catch (error) {
        // The file it replaced is gone even though this one could not take its place.
        const gone =
          removed && kept
            ? kept.findIndex(
                (item) =>
                  item.tree === removed.tree &&
                  item.group === removed.group &&
                  item.name === removed.name,
              )
            : -1
        if (gone !== -1) keptBytes -= kept.splice(gone, 1)[0].bytes
        if (temporary) {
          try {
            fs.rmSync(temporary, { force: true })
          } catch {
            // The write already failed and its caller hears of it.
          }
        }
        throw error
      }
    },
  }
}

/** The one record-files store of a session (`state.dir`), shared by its recorders. */
export const recordFilesOf = (state, options = {}) => {
  state.recordFiles ??= createRecordFiles({ dir: state.dir, ...options })
  return state.recordFiles
}
