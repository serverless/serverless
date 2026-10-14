/**
 * Dev Mode writes, reads and removes files only in real directories of the service:
 * `.serverless`, `.serverless/dev` and the directories under it. A symbolic link in the place of
 * one of them (or a Windows junction, which `lstat` reports as a link) would put those files
 * somewhere else, so it is refused and never followed. Files are created exclusively, under a
 * name nobody can predict, readable by their owner only, so an existing file or link is never
 * written through.
 */
import { randomBytes } from 'crypto'
import path from 'path'

/** The error code of a directory that is a link, or a file where a directory belongs. */
export const LINKED_DIR_CODE = 'EDEVLINK'

const linkedError = (at) =>
  Object.assign(
    new Error(
      `${at} is a link or a file, not a directory; Dev Mode writes only into real directories inside the service`,
    ),
    { code: LINKED_DIR_CODE },
  )

/** `.serverless`, `.serverless/dev` (= `dir`), then each of `sub` below it, in that order. */
const chainOf = (dir, sub) => {
  const chain = [path.dirname(dir), dir]
  let at = dir
  for (const name of sub) {
    at = path.join(at, name)
    chain.push(at)
  }
  return chain
}

/** 'dir' for a real directory, 'missing', or 'other' (a link, a file, anything else). */
const kindOf = (fs, at) => {
  try {
    const stats = fs.lstatSync(at)
    return stats.isDirectory() && !stats.isSymbolicLink() ? 'dir' : 'other'
  } catch (error) {
    if (error.code === 'ENOENT') return 'missing'
    throw error
  }
}

/**
 * Makes sure `dir` (a service's `.serverless/dev`) and `dir/...sub` are real directories, creating
 * the missing ones from the top down, and returns the last one. Each is checked before anything is
 * created inside it. Throws with `code: LINKED_DIR_CODE` at the first one that is not.
 */
export const ensureRealDir = ({ dir, sub = [], fs }) => {
  const chain = chainOf(dir, sub)
  for (const [index, at] of chain.entries()) {
    // `.serverless/dev` and everything below it are readable by their owner only, like the files
    // in them; `.serverless` itself stays as the Framework makes it.
    const private_ = index > 0
    let kind = kindOf(fs, at)
    let created = false
    if (kind === 'missing') {
      // Its parent is checked already (the service directory itself is the person's own). A
      // private directory is created owner-only, never wider first. `recursive` returns quietly
      // when another process (a second session starting) created it meanwhile, and returns
      // undefined then: that one is checked and tightened like any existing one.
      created =
        fs.mkdirSync(
          at,
          private_ ? { recursive: true, mode: 0o700 } : { recursive: true },
        ) !== undefined
      kind = kindOf(fs, at)
    }
    if (kind !== 'dir') throw linkedError(at)
    // One that existed already (an earlier session's, say) is tightened.
    if (private_ && !created) ownerOnly(fs, at)
  }
  return chain.at(-1)
}

/** Drops group and other access from a directory; a directory the person does not own is left. */
const ownerOnly = (fs, at) => {
  try {
    const mode = fs.statSync(at).mode & 0o777
    if (mode & 0o077) fs.chmodSync(at, mode & 0o700)
  } catch {
    // Not the owner, or a file system without POSIX modes: nothing to tighten.
  }
}

/** Whether `dir/...sub` exists and it and every directory above it up to `.serverless` is real. */
export const isRealDir = ({ dir, sub = [], fs }) => {
  try {
    return chainOf(dir, sub).every((at) => kindOf(fs, at) === 'dir')
  } catch {
    return false
  }
}

/** Whether `file` is a regular file (not a link to one). */
export const isRegularFile = (fs, file) => {
  try {
    return fs.lstatSync(file).isFile()
  } catch {
    return false
  }
}

/** A temporary name beside `file` that nobody can predict. */
export const temporaryNameOf = (file) =>
  path.join(
    path.dirname(file),
    `.${path.basename(file)}.${randomBytes(8).toString('hex')}.tmp`,
  )

/**
 * Writes `text` to a new file: created exclusively (an existing file or link at that name fails
 * the write, never followed), readable by its owner only.
 */
export const writeNewFile = (fs, file, text) => {
  const fd = fs.openSync(file, 'wx', 0o600)
  try {
    fs.writeSync(fd, text)
  } finally {
    fs.closeSync(fd)
  }
}
