/**
 * Readers of a service directory's Dev Mode record, for the commands that run next to a session
 * (or after it): the event log of the current or last session, and the invocation files. Every
 * reader tolerates a file being written meanwhile: a line not finished yet is skipped. This module
 * imports only the record's names and the event log's helpers, so the finite commands and
 * `serverless invoke` load nothing of the running session.
 */
import nodeFs from 'fs'
import path from 'path'
import {
  FILES,
  REQUEST_ID_PREFIX_MIN,
  fnDirOf,
  invocationRecordPath,
  parseInvocationFileName,
  rotatedEventsFile,
} from './paths.js'
import { formatCursor } from './cursor.js'
import { firstSessionIdOf, firstSessionIdOfFd } from './events.js'
import { isRealDir } from './real-dir.js'
import { GLOBAL_TIMERS } from '../attach/session-support.js'
import { shownPath } from '../commands/cli-names.js'

const parseLines = (text) => {
  const records = []
  for (const line of text.split('\n')) {
    if (!line.trim()) continue
    try {
      const record = JSON.parse(line)
      if (record && typeof record === 'object') records.push(record)
    } catch {
      // A line still being written.
    }
  }
  return records
}

const readText = (fs, file) => {
  try {
    return fs.readFileSync(file, 'utf8')
  } catch (error) {
    if (error.code === 'ENOENT') return ''
    throw error
  }
}

/** Every record of the current (or last) session's log, in order. */
export const readRecords = ({ dir, fs = nodeFs }) =>
  parseLines(readText(fs, path.join(dir, FILES.events)))

/** The records of the session `sessionId`: from the current log, or from its rotated log. */
export const readSessionRecords = ({ dir, sessionId, fs = nodeFs }) => {
  const current = path.join(dir, FILES.events)
  // Only this session's records: the next session may rename the log between the check of its
  // first line and the read, and then the session's records are in the renamed file.
  const ours = (records) =>
    records.filter((record) => record.session_id === sessionId)
  if (firstSessionIdOf(fs, current) === sessionId) {
    const records = ours(parseLines(readText(fs, current)))
    if (records.length) return records
  }
  return ours(
    parseLines(readText(fs, path.join(dir, rotatedEventsFile(sessionId)))),
  )
}

/** The session id of the current (or last) session's log, or null. */
export const currentSessionId = ({ dir, fs = nodeFs }) =>
  firstSessionIdOf(fs, path.join(dir, FILES.events))

/** The cursor of the last record of the current (or last) session's log, or null. */
export const lastCursor = ({ dir, fs = nodeFs }) => {
  const last = readRecords({ dir, fs }).at(-1)
  return last ? formatCursor(last.session_id, last.seq) : null
}

/**
 * Follows the log of the session `sessionId`: calls `onRecord(record)` for each of its records
 * with a `seq` above `afterSeq`, in order, as they are written, checking every `pollMs`. Only new
 * bytes are read each time; a log renamed by the next session's start is followed under its new
 * name. Resolves when `signal` aborts (`onRecord` may abort it).
 */
export const followRecords = ({
  dir,
  afterSeq = 0,
  sessionId,
  onRecord,
  timers = GLOBAL_TIMERS,
  signal,
  pollMs = 200,
  fs = nodeFs,
}) =>
  new Promise((resolve) => {
    const current = path.join(dir, FILES.events)
    const rotated = path.join(dir, rotatedEventsFile(sessionId))
    let file = null
    let offset = 0
    // The bytes after the last newline read so far: a line still being written, kept as bytes so
    // a character split between two reads is decoded whole.
    let rest = Buffer.alloc(0)
    let seen = afterSeq
    let timer = null
    let done = false
    const firstIdOf = (name) => firstSessionIdOf(fs, name)
    const pick = () => {
      if (file === current && firstIdOf(current) === sessionId) return current
      if (file === null && firstIdOf(current) === sessionId) return current
      return fs.existsSync(rotated) ? rotated : null
    }
    // The new bytes of the session's log. The file is opened first and then measured and read
    // through that one descriptor, and its first line must still name the session: a log renamed
    // after `pick()` (the next session's start) is never read as this session's.
    const readChunk = (name) => {
      let fd
      try {
        fd = fs.openSync(name, 'r')
      } catch {
        return null
      }
      try {
        if (firstSessionIdOfFd(fs, fd) !== sessionId) return null
        const size = fs.fstatSync(fd).size
        if (size < offset) {
          offset = 0
          rest = Buffer.alloc(0)
        }
        if (size === offset) return null
        const buffer = Buffer.alloc(size - offset)
        const read = fs.readSync(fd, buffer, 0, buffer.length, offset)
        offset += read
        return buffer.subarray(0, read)
      } catch {
        return null
      } finally {
        try {
          fs.closeSync(fd)
        } catch {
          // Already closed with the file gone.
        }
      }
    }
    const readNew = () => {
      const next = pick()
      if (!next) return []
      file = next
      // A file that moved or went away is looked at again at the next poll.
      const chunk = readChunk(next)
      if (!chunk?.length) return []
      const bytes = Buffer.concat([rest, chunk])
      const cut = bytes.lastIndexOf(0x0a)
      rest = bytes.subarray(cut + 1)
      if (cut < 0) return []
      return parseLines(bytes.subarray(0, cut + 1).toString('utf8')).filter(
        (record) => record.session_id === sessionId,
      )
    }
    const finish = () => {
      if (done) return
      done = true
      timers.clearTimeout(timer)
      timer = null
      signal?.removeEventListener?.('abort', finish)
      resolve()
    }
    const poll = () => {
      timer = null
      if (signal?.aborted) return finish()
      for (const record of readNew()) {
        if (!(record.seq > seen)) continue
        seen = record.seq
        try {
          onRecord(record)
        } catch {
          // A reader's failure does not stop the following.
        }
        if (signal?.aborted) return finish()
      }
      timer = timers.setTimeout(poll, pollMs)
      return undefined
    }
    if (signal?.aborted) return resolve()
    signal?.addEventListener?.('abort', finish, { once: true })
    poll()
    return undefined
  })

/**
 * The invocation files of one function directory (`fnDir`), or of all, newest first:
 * `{ fnDir, name, seconds, requestId }`. The one scan of `invocations/`: the readers and the
 * recorder's retention use it. Only real directories are listed (never through a link) and only
 * regular files are returned.
 */
export const invocationFilesIn = ({ dir, fnDir, fs = nodeFs }) => {
  const root = path.join(dir, FILES.invocations)
  if (!isRealDir({ dir, sub: [FILES.invocations], fs })) return []
  let fnDirs
  try {
    fnDirs = fnDir
      ? [fnDir]
      : fs
          .readdirSync(root, { withFileTypes: true })
          .filter((entry) => entry.isDirectory())
          .map((entry) => entry.name)
  } catch {
    return []
  }
  const files = []
  for (const name of fnDirs) {
    if (!isRealDir({ dir, sub: [FILES.invocations, name], fs })) continue
    let entries = []
    try {
      entries = fs.readdirSync(path.join(root, name), { withFileTypes: true })
    } catch {
      continue
    }
    for (const entry of entries) {
      if (!entry.isFile()) continue
      const parsed = parseInvocationFileName(entry.name)
      if (parsed) files.push({ fnDir: name, name: entry.name, ...parsed })
    }
  }
  return files.sort(
    (a, b) => b.seconds - a.seconds || b.name.localeCompare(a.name),
  )
}

const readInvocation = (fs, dir, item) => {
  try {
    return JSON.parse(
      fs.readFileSync(
        path.join(dir, FILES.invocations, item.fnDir, item.name),
        'utf8',
      ),
    )
  } catch {
    return null
  }
}

const recordPathOf = (item) =>
  invocationRecordPath({ fnDir: item.fnDir, fileName: item.name })

/**
 * The newest invocations kept (of `functionKey` only, when given), at most `limit`:
 * `{ ts, function, stage, request_id, outcome, duration_ms, status_code?, file }`.
 */
export const listRequests = ({ dir, functionKey, limit = 20, fs = nodeFs }) => {
  const requests = []
  for (const item of invocationFilesIn({
    dir,
    fnDir: functionKey && fnDirOf(functionKey),
    fs,
  })) {
    if (requests.length >= limit) break
    const invocation = readInvocation(fs, dir, item)
    if (!invocation) continue
    // Keys that differ only by case share a directory where file names ignore case.
    if (functionKey && invocation.function !== functionKey) continue
    requests.push({
      ts: invocation.started_at,
      function: invocation.function,
      // A file written before files named their stage has none.
      stage: typeof invocation.stage === 'string' ? invocation.stage : null,
      request_id: invocation.request_id,
      outcome: invocation.outcome,
      duration_ms: invocation.duration_ms,
      status_code: invocation.status_code ?? undefined,
      file: recordPathOf(item),
    })
  }
  return requests
}

const notFound = (message) =>
  Object.assign(new Error(message), { reason: 'invocation_not_found' })
const ambiguous = (message) =>
  Object.assign(new Error(message), { reason: 'ambiguous_request_id' })

/**
 * The kept invocation a request id names: `{ file, record }` (`record` is the parsed file), the
 * newest file when an id has more than one (an asynchronous retry keeps its request id). An exact
 * id of any length is found first; otherwise a prefix needs REQUEST_ID_PREFIX_MIN characters.
 * Throws with `reason` 'invocation_not_found', or 'ambiguous_request_id' for a shorter prefix or
 * a prefix of more than one request.
 */
export const findInvocation = ({ dir, idOrPrefix, fs = nodeFs }) => {
  const id = String(idOrPrefix ?? '').trim()
  const files = invocationFilesIn({ dir, fs })
  let matches = id ? files.filter((item) => item.requestId === id) : []
  if (matches.length === 0) {
    if (id.length < REQUEST_ID_PREFIX_MIN) {
      throw ambiguous(
        `Give the full request id, or at least its first ${REQUEST_ID_PREFIX_MIN} characters.`,
      )
    }
    matches = files.filter((item) => item.requestId.startsWith(id))
  }
  const ids = [...new Set(matches.map((item) => item.requestId))]
  if (ids.length === 0) {
    throw notFound(
      `No invocation with request id ${id} is kept in ${shownPath('.serverless/dev/invocations')}.`,
    )
  }
  if (ids.length > 1) {
    throw ambiguous(
      `"${id}" matches more than one request: ${ids.slice(0, 5).join(', ')}${ids.length > 5 ? ', …' : ''}.`,
    )
  }
  const record = readInvocation(fs, dir, matches[0])
  if (!record) throw notFound(`The file of request ${id} could not be read.`)
  return { file: recordPathOf(matches[0]), record }
}
