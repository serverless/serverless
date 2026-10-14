/**
 * The session's event log, `session.ndjson`: one JSON record per line, at most MAX_RECORD_BYTES
 * each, numbered from 1 (`seq`) within the session. Opening it renames the previous session's log
 * to `session.<session id>.ndjson` and keeps the newest ROTATED_EVENT_FILES of those. No handler
 * log line and no event or response body is ever written here. Writing never fails the session:
 * a failed write goes to `onError`.
 */
import nodeFs from 'fs'
import path from 'path'
import { FILES, rotatedEventsFile, rotatedSessionIdOf } from './paths.js'
import { formatCursor } from './cursor.js'
import { ensureRealDir, isRegularFile } from './real-dir.js'

export const MAX_RECORD_BYTES = 4096
export const ROTATED_EVENT_FILES = 5
const ENVELOPE = ['v', 'seq', 'ts', 'session_id', 'type']
const FIRST_LINE_BYTES = 8192

const sizeOf = (value) => Buffer.byteLength(JSON.stringify(value))

/**
 * A text as a record keeps it: one line, with every URL written as `<url>` (a signed URL carries
 * credentials in its query). Quotes, brackets and punctuation that close the text around a URL
 * stay; everything else up to the next space goes with the URL.
 */
export const scrubLine = (text) =>
  String(text ?? '')
    .replace(/\r?\n/g, ' ')
    .replace(
      /\b(?:https?|wss?):\/\/\S+/g,
      (url) => `<url>${/["'`)\]}>.,;:!?]*$/.exec(url)[0]}`,
    )
    .trim()

/** The longest string or the largest non-empty array in `value`, outside the record's envelope. */
const largestPart = (value, top = true) => {
  let best = null
  const consider = (parent, key) => {
    const item = parent[key]
    if (typeof item === 'string' && item.length) {
      const size = Buffer.byteLength(item)
      if (!best || size > best.size) best = { parent, key, size }
    } else if (Array.isArray(item) || (item && typeof item === 'object')) {
      if (Array.isArray(item) && item.length) {
        const size = sizeOf(item)
        if (!best || size > best.size) best = { parent, key, size }
      }
      const inner = largestPart(item, false)
      if (inner && (!best || inner.size > best.size)) best = inner
    }
  }
  for (const key of Object.keys(value)) {
    if (top && ENVELOPE.includes(key)) continue
    consider(value, key)
  }
  return best
}

/** The first characters of `text` that fit in `bytes` bytes of UTF-8, whole characters only. */
export const cutText = (text, bytes) => {
  let used = 0
  let end = 0
  for (const char of text) {
    const size = Buffer.byteLength(char)
    if (used + size > bytes) break
    used += size
    end += char.length
  }
  return text.slice(0, end)
}

/**
 * The record as written: unchanged when it fits in `cap` bytes; otherwise the longest string is
 * cut (or the largest list shortened) until it fits, and the record says `truncated: true`.
 */
export const fitRecord = (record, cap = MAX_RECORD_BYTES) => {
  if (sizeOf(record) <= cap) return record
  const fitted = { ...structuredClone(record), truncated: true }
  for (;;) {
    const excess = sizeOf(fitted) - cap
    if (excess <= 0) return fitted
    const part = largestPart(fitted)
    if (!part) break
    const item = part.parent[part.key]
    if (typeof item === 'string') {
      // JSON escapes can make a character longer than its UTF-8 bytes: cut at least one.
      const keep = Math.min(
        Buffer.byteLength(item) - excess,
        Buffer.byteLength(item) - 1,
      )
      part.parent[part.key] = cutText(item, Math.max(0, keep))
    } else {
      part.parent[part.key] = item.slice(0, -1)
    }
  }
  return Object.fromEntries([
    ...ENVELOPE.map((key) => [key, record[key]]),
    ['truncated', true],
  ])
}

/**
 * The session id of the first record of the open file `fd` (read from its first bytes only), or
 * null.
 */
export const firstSessionIdOfFd = (fs, fd) => {
  try {
    const buffer = Buffer.alloc(FIRST_LINE_BYTES)
    const read = fs.readSync(fd, buffer, 0, FIRST_LINE_BYTES, 0)
    const line = buffer.subarray(0, read).toString('utf8').split('\n')[0]
    const id = JSON.parse(line)?.session_id
    return typeof id === 'string' && id ? id : null
  } catch {
    return null
  }
}

/**
 * The session id of the first record in `file` (read from its first bytes only), or null. The
 * readers (`state/read.js`) use it too.
 */
export const firstSessionIdOf = (fs, file) => {
  let fd
  try {
    fd = fs.openSync(file, 'r')
    return firstSessionIdOfFd(fs, fd)
  } catch {
    return null
  } finally {
    if (fd !== undefined) fs.closeSync(fd)
  }
}

/** Renames the previous session's log and keeps the newest ROTATED_EVENT_FILES of them. */
export const rotateEventLog = ({
  dir,
  fs = nodeFs,
  keep = ROTATED_EVENT_FILES,
}) => {
  const current = path.join(dir, FILES.events)
  let currentStats = null
  try {
    currentStats = fs.lstatSync(current)
  } catch {
    // No previous log.
  }
  if (currentStats) {
    // Only a regular file is a previous log; anything else (a link) is removed, never read.
    const id = currentStats.isFile() ? firstSessionIdOf(fs, current) : null
    if (id) fs.renameSync(current, path.join(dir, rotatedEventsFile(id)))
    else fs.rmSync(current, { force: true })
  }
  const rotated = fs
    .readdirSync(dir)
    .filter((name) => rotatedSessionIdOf(name) !== null)
    .map((name) => ({
      name,
      mtimeMs: fs.lstatSync(path.join(dir, name)).mtimeMs,
    }))
    .sort((a, b) => b.mtimeMs - a.mtimeMs || b.name.localeCompare(a.name))
  for (const { name } of rotated.slice(keep)) {
    fs.rmSync(path.join(dir, name), { force: true })
  }
}

/**
 * A new log file, created exclusively: a previous log that could not be renamed is removed first,
 * and a link in its place is removed, never written through. On Windows a removed file that
 * another process still has open can keep its name for a moment: a regular file there is emptied
 * instead.
 */
const openNewLog = (fs, file) => {
  fs.rmSync(file, { force: true })
  try {
    return fs.openSync(file, 'wx', 0o600)
  } catch (error) {
    if (error.code === 'ENOENT' || !isRegularFile(fs, file)) throw error
    return fs.openSync(file, 'w', 0o600)
  }
}

/**
 * Opens the log for the session `sessionId`: `emit(type, fields)` appends one record and returns
 * `{ seq, cursor }`; `lastCursor()` is the cursor of the last record (null before the first);
 * `close()` ends writing (later records are dropped).
 */
export const openEventLog = ({
  dir,
  sessionId,
  now = Date.now,
  fs = nodeFs,
  onError = () => {},
}) => {
  ensureRealDir({ dir, fs })
  try {
    rotateEventLog({ dir, fs })
  } catch (error) {
    onError(error)
  }
  const file = path.join(dir, FILES.events)
  const fd = openNewLog(fs, file)
  let seq = 0
  let closed = false
  const cursor = () => (seq ? formatCursor(sessionId, seq) : null)
  return {
    file,
    emit(type, fields = {}) {
      if (closed) return { seq, cursor: cursor() }
      seq += 1
      const record = {
        v: 1,
        seq,
        ts: new Date(now()).toISOString(),
        session_id: sessionId,
        type,
      }
      for (const [key, value] of Object.entries(fields)) {
        if (value !== undefined && !ENVELOPE.includes(key)) record[key] = value
      }
      try {
        fs.writeSync(fd, `${JSON.stringify(fitRecord(record))}\n`)
      } catch (error) {
        onError(error)
      }
      return { seq, cursor: cursor() }
    },
    lastCursor: cursor,
    close() {
      if (closed) return
      closed = true
      try {
        fs.closeSync(fd)
      } catch (error) {
        onError(error)
      }
    },
  }
}

/**
 * Counts the requests this machine saw but left to the deployed code, per function and reason, and
 * writes one `invocation.passed_through` record per pair at most once per `windowMs` (a burst is
 * one record, not hundreds). `stop()` writes what is counted and leaves no timer.
 */
export const coalescePassedThrough = ({ emit, timers, windowMs = 1_000 }) => {
  const counts = new Map()
  let timer = null
  const flush = () => {
    timers.clearTimeout(timer)
    timer = null
    for (const [key, count] of counts) {
      const [functionKey, reason] = JSON.parse(key)
      emit('invocation.passed_through', {
        function: functionKey ?? undefined,
        count,
        reason,
      })
    }
    counts.clear()
  }
  return {
    add({ functionKey, reason }) {
      const key = JSON.stringify([functionKey ?? null, reason])
      counts.set(key, (counts.get(key) ?? 0) + 1)
      timer ??= timers.setTimeout(flush, windowMs)
    },
    flush,
    stop: flush,
  }
}
