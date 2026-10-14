/**
 * The record of every invocation that runs on this machine: one JSON file per invocation under
 * `.serverless/dev/invocations/<function>/<unix seconds>-<request id>.json` (redacted, bodies cut
 * at BODY_INLINE_BYTES, at most INVOCATION_FILES_PER_FUNCTION files per function and
 * INVOCATION_BYTES_PER_SERVICE in all, oldest removed first), `invocation.start` and
 * `invocation.end` records in the event log, and, in memory only, the raw events of the latest
 * invocations for `dev replay`. It has the invocation output's interface (`start`, `log`, `end`,
 * `workerExited`) and runs beside it. Never written: the function's environment, credentials, the
 * Lambda-Runtime headers other than the request id and deadline, and the session key.
 */
import nodeFs from 'fs'
import path from 'path'
import {
  FILES,
  REQUEST_ID_PREFIX_MIN,
  fnDirOf,
  invocationFileName,
  invocationRecordPath,
} from './paths.js'
import { cutText } from './events.js'
import { invocationFilesIn } from './read.js'
import { redactEvent, redactResponse } from './redact.js'
import {
  LINKED_DIR_CODE,
  ensureRealDir,
  isRealDir,
  isRegularFile,
  temporaryNameOf,
  writeNewFile,
} from './real-dir.js'
import { TIMED_OUT } from '../local/replies.js'
import {
  PRELUDE_CONTENT_TYPE,
  PRELUDE_DELIMITER,
  callerReceived,
  errorStatusCode,
  eventLabel,
  outcomeOf,
  preludeStatusCode,
} from '../local/invocation-output.js'

export const INVOCATION_FILES_PER_FUNCTION = 500
export const INVOCATION_BYTES_PER_SERVICE = 200 * 1024 * 1024
export const BODY_INLINE_BYTES = 1024 * 1024
export const LOG_LINES_PER_INVOCATION = 1_000
export const LOG_BYTES_PER_INVOCATION = 256 * 1024
export const REPLAY_EVENTS_PER_FUNCTION = 50
export const REPLAY_BYTES = 64 * 1024 * 1024

export const DEFAULT_LIMITS = Object.freeze({
  filesPerFunction: INVOCATION_FILES_PER_FUNCTION,
  bytesPerService: INVOCATION_BYTES_PER_SERVICE,
  bodyInlineBytes: BODY_INLINE_BYTES,
  logLines: LOG_LINES_PER_INVOCATION,
  logBytes: LOG_BYTES_PER_INVOCATION,
  replayPerFunction: REPLAY_EVENTS_PER_FUNCTION,
  replayBytes: REPLAY_BYTES,
})

const json = (buffer) => {
  try {
    return JSON.parse(buffer.toString('utf8'))
  } catch {
    return undefined
  }
}

/**
 * The bytes as UTF-8 text, or null when they are not. A `cut` buffer (the first bytes of a longer
 * body) may end inside a character: that partial character is left out instead.
 */
const textOf = (buffer, { cut = false } = {}) => {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buffer, {
      stream: cut,
    })
  } catch {
    return null
  }
}

/**
 * A body as the file keeps it: parsed JSON (redacted by `redact`), else text, else `{ base64 }`;
 * past `limit` bytes it is cut (JSON as its redacted text) and marked truncated. `cut` says the
 * bytes are only the first part of the body (their last character may be incomplete). `encoding`
 * is 'base64' for the `{ base64 }` form and 'json' otherwise (the value is the body itself), so a
 * JSON body shaped like `{ base64 }` is never taken for bytes. `text: false` keeps a body that is
 * not JSON as its bytes even when it is text: an event, so a replay sends exactly those bytes.
 */
export const bodyOf = (
  bytes,
  redact,
  limit,
  { cut = false, text: keepText = true } = {},
) => {
  const total = bytes.length
  const parsed = json(bytes)
  if (parsed !== undefined) {
    const { value, paths } = redact(parsed)
    const text = JSON.stringify(value)
    return Buffer.byteLength(text) <= limit
      ? { value, truncated: false, bytes: total, paths, encoding: 'json' }
      : {
          value: cutText(text, limit),
          truncated: true,
          bytes: total,
          paths,
          encoding: 'json',
        }
  }
  const text = keepText ? textOf(bytes, { cut }) : null
  if (text !== null) {
    return total <= limit
      ? {
          value: text,
          truncated: false,
          bytes: total,
          paths: [],
          encoding: 'json',
        }
      : {
          value: cutText(text, limit),
          truncated: true,
          bytes: total,
          paths: [],
          encoding: 'json',
        }
  }
  return {
    value: { base64: bytes.subarray(0, limit).toString('base64') },
    truncated: total > limit,
    bytes: total,
    paths: [],
    encoding: 'base64',
  }
}

/** A stream's kept head as a response: its HTTP prelude (status, headers, cookies) and its body. */
const streamBodyOf = ({ bodyHead, bodyBytes, contentType }, limit) => {
  const head = bodyHead ?? Buffer.alloc(0)
  const truncated = (bodyBytes ?? head.length) > head.length
  if (contentType === PRELUDE_CONTENT_TYPE) {
    const at = head.indexOf(PRELUDE_DELIMITER)
    const prelude = at === -1 ? undefined : json(head.subarray(0, at))
    if (prelude && typeof prelude === 'object') {
      const rest = head.subarray(at + PRELUDE_DELIMITER.length)
      const { value, paths } = redactResponse(prelude)
      const text = textOf(rest, { cut: truncated })
      return {
        value: {
          ...value,
          body: text ?? { base64: rest.toString('base64') },
        },
        truncated,
        bytes: bodyBytes ?? head.length,
        paths,
      }
    }
  }
  const body = bodyOf(head, (value) => ({ value, paths: [] }), limit, {
    cut: truncated,
  })
  return {
    ...body,
    truncated: truncated || body.truncated,
    bytes: bodyBytes ?? head.length,
  }
}

const outcomeCodeOf = ({ reply, trailers, exited, error }) => {
  const type = reply.kind === 'stream' ? trailers?.errorType : reply.errorType
  if (type === TIMED_OUT) return 'timeout'
  if (exited) return 'worker_exited'
  return error ? 'error' : 'ok'
}

const statusCodeOf = ({
  reply,
  event,
  head,
  contentType,
  firstByteMs,
  outcome,
}) => {
  if (reply.kind === 'response') {
    const code = json(reply.body)?.statusCode
    return typeof code === 'number' ? code : undefined
  }
  if (reply.kind === 'stream') {
    const code = preludeStatusCode({
      contentType: contentType ?? reply.contentType,
      head,
    })
    if (outcome === 'ok') return code
    return errorStatusCode(event, {
      streamed: firstByteMs !== undefined,
      statusCode: code,
    })
  }
  return errorStatusCode(event)
}

const byAge = (a, b) => a.seconds - b.seconds || a.name.localeCompare(b.name)

/**
 * The files already kept (the readers' scan, with sizes), oldest first:
 * `{ fnDir, name, seconds, bytes }`. Only regular files count (never a link).
 */
const scanKept = (fs, dir) => {
  const kept = []
  for (const item of invocationFilesIn({ dir, fs })) {
    try {
      const stats = fs.lstatSync(
        path.join(dir, FILES.invocations, item.fnDir, item.name),
      )
      if (!stats.isFile()) continue
      const size = stats.size
      kept.push({
        fnDir: item.fnDir,
        name: item.name,
        seconds: item.seconds,
        bytes: size,
      })
    } catch {
      // Removed meanwhile.
    }
  }
  return kept.sort(byAge)
}

/**
 * `dir` is the session's `.serverless/dev` directory; `events` its event log; `functions` maps each
 * function key to `{ name, memoryMb }` (its deployed name and memory, for the file's `context`);
 * `mcpFunctions` names the MCP server functions (for the trigger label); `stage` the session's stage.
 */
export const createInvocationRecorder = ({
  dir,
  now = Date.now,
  events,
  fs = nodeFs,
  limits = {},
  functions = new Map(),
  mcpFunctions = new Set(),
  // The session's stage, which each file names: one service directory keeps the invocations of
  // every stage run from it.
  stage = null,
  onError = () => {},
  // Called once, with a line, when a directory of the record is a link (nothing is recorded then).
  onWarning = () => {},
}) => {
  const limit = { ...DEFAULT_LIMITS, ...limits }
  const root = path.join(dir, FILES.invocations)
  const running = new Map()
  // Raw events for replay, oldest first (a Map keeps insertion order).
  const raw = new Map()
  let rawBytes = 0
  let kept = null
  let keptBytes = 0
  let last = null
  const totals = { total: 0, errors: 0 }
  // Replays this session runs (`serverless dev replay`): request id → the id it replays.
  const replays = new Map()
  // Who waits for an invocation's file, by request id.
  const waiters = new Map()
  let warned = false

  const remember = (entry) => {
    const old = raw.get(entry.requestId)
    if (old) {
      raw.delete(entry.requestId)
      rawBytes -= old.eventBytes.length
    }
    raw.set(entry.requestId, entry)
    rawBytes += entry.eventBytes.length
    const ofFunction = [...raw.values()].filter(
      (item) => item.functionKey === entry.functionKey,
    )
    for (const item of ofFunction.slice(0, -limit.replayPerFunction)) {
      raw.delete(item.requestId)
      rawBytes -= item.eventBytes.length
    }
    for (const [requestId, item] of raw) {
      if (rawBytes <= limit.replayBytes) break
      raw.delete(requestId)
      rawBytes -= item.eventBytes.length
    }
  }

  /**
   * Removes a kept file: only a regular file, in a function directory that is a real one. Returns
   * whether it no longer counts: deleted, already gone, or not a file of the record. A file that
   * could not be deleted (one another process holds open, on Windows) stays counted, and a later
   * prune tries it again.
   */
  const remove = (item) => {
    const file = path.join(root, item.fnDir, item.name)
    try {
      if (
        isRealDir({ dir, sub: [FILES.invocations, item.fnDir], fs }) &&
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
   * Keeps at most `filesPerFunction` files per function and `bytesPerService` in all, oldest
   * first, and never the file just `written`: its record names it (an invocation that started
   * before another may end after it).
   */
  const prune = (written) => {
    const others = kept.filter((item) => item !== written)
    const ofFunction = others.filter((item) => item.fnDir === written.fnDir)
    const over = new Set(
      ofFunction.slice(
        0,
        Math.max(0, ofFunction.length + 1 - limit.filesPerFunction),
      ),
    )
    const removed = new Set()
    for (const item of over) if (remove(item)) removed.add(item)
    for (const item of others) {
      if (keptBytes <= limit.bytesPerService) break
      if (over.has(item)) continue
      if (remove(item)) removed.add(item)
    }
    kept = kept.filter((item) => !removed.has(item))
  }

  /** Writes the file (whole or not at all) and returns its record path, or null. */
  const write = ({ functionKey, startedAtMs, requestId, content }) => {
    let temporary = null
    // The kept file this write replaces, once it was removed to make way (see below).
    let removed = null
    try {
      if (!kept) {
        // Files of earlier sessions count too: read once, then kept up to date here.
        kept = scanKept(fs, dir)
        keptBytes = kept.reduce((sum, item) => sum + item.bytes, 0)
      }
      const fnDir = fnDirOf(functionKey)
      const name = invocationFileName({ startedAtMs, requestId })
      const folder = ensureRealDir({
        dir,
        sub: [FILES.invocations, fnDir],
        fs,
      })
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
        removed = { fnDir, name }
        fs.renameSync(temporary, file)
      }
      temporary = null
      const previous = kept.findIndex(
        (item) => item.fnDir === fnDir && item.name === name,
      )
      if (previous !== -1) keptBytes -= kept.splice(previous, 1)[0].bytes
      const size = Buffer.byteLength(text)
      const written = {
        fnDir,
        name,
        seconds: Math.floor(startedAtMs / 1000),
        bytes: size,
      }
      kept.push(written)
      keptBytes += size
      kept.sort(byAge)
      prune(written)
      return invocationRecordPath({ functionKey, fileName: name })
    } catch (error) {
      if (error?.code !== LINKED_DIR_CODE) onError(error)
      else if (!warned) {
        warned = true
        onWarning(
          `Dev Mode keeps no invocation files: ${error.message}. Replace the link with a directory to keep them.`,
        )
      }
      // The file it replaced is gone even though this one could not take its place.
      const gone = removed
        ? kept.findIndex(
            (item) =>
              item.fnDir === removed.fnDir && item.name === removed.name,
          )
        : -1
      if (gone !== -1) keptBytes -= kept.splice(gone, 1)[0].bytes
      if (temporary) {
        try {
          fs.rmSync(temporary, { force: true })
        } catch {
          // The write already failed and onError has it.
        }
      }
      return null
    }
  }

  return {
    start({
      functionKey,
      requestId,
      event,
      newWorker,
      eventBytes,
      environmentId,
      headers,
      source = 'caller',
    }) {
      const startedAtMs = now()
      const label = eventLabel(event, { mcp: mcpFunctions.has(functionKey) })
      running.set(requestId, {
        functionKey,
        startedAtMs,
        label,
        source,
        logs: { lines: [], bytes: 0, truncated: false },
        exited: false,
      })
      if (Buffer.isBuffer(eventBytes)) {
        remember({
          requestId,
          functionKey,
          eventBytes,
          environmentId,
          headers,
          source,
        })
      }
      events.emit('invocation.start', {
        function: functionKey,
        request_id: requestId,
        label,
        new_worker: Boolean(newWorker),
        source,
      })
    },
    log({ requestId, text }) {
      const logs = running.get(requestId)?.logs
      if (!logs || logs.truncated) return
      const line = String(text)
      const size = Buffer.byteLength(line)
      if (
        logs.lines.length >= limit.logLines ||
        logs.bytes + size > limit.logBytes
      ) {
        logs.truncated = true
        return
      }
      logs.lines.push(line)
      logs.bytes += size
    },
    workerExited({ requestId }) {
      const entry = running.get(requestId)
      if (entry) entry.exited = true
    },
    end(details) {
      const {
        functionKey,
        requestId,
        event,
        eventBytes,
        reply,
        durationMs,
        initMs,
        deadlineMs,
        timeoutSeconds,
        trailers,
        firstByteMs,
        head,
        contentType,
      } = details
      const entry = running.get(requestId) ?? {
        functionKey,
        startedAtMs: now() - (durationMs ?? 0),
        label: eventLabel(event, { mcp: mcpFunctions.has(functionKey) }),
        source: details.source ?? 'caller',
        logs: { lines: [], bytes: 0, truncated: false },
        exited: false,
      }
      running.delete(requestId)
      const shown = outcomeOf({ reply, trailers, head, contentType, event })
      const outcome = outcomeCodeOf({
        reply,
        trailers,
        exited: entry.exited,
        error: shown.error,
      })
      const statusCode = statusCodeOf({
        reply,
        event,
        head,
        contentType,
        firstByteMs,
        outcome,
      })
      const eventBody = bodyOf(
        Buffer.isBuffer(eventBytes)
          ? eventBytes
          : Buffer.from(JSON.stringify(event ?? null)),
        redactEvent,
        limit.bodyInlineBytes,
        { text: false },
      )
      const response =
        reply.kind === 'response'
          ? bodyOf(
              reply.body ?? Buffer.alloc(0),
              redactResponse,
              limit.bodyInlineBytes,
            )
          : reply.kind === 'stream'
            ? streamBodyOf(details, limit.bodyInlineBytes)
            : null
      const streamed =
        reply.kind === 'stream' && firstByteMs !== undefined
          ? {
              streamed: true,
              statusCode: preludeStatusCode({
                contentType: contentType ?? reply.contentType,
                head,
              }),
            }
          : undefined
      const info = functions.get(functionKey) ?? {}
      const content = {
        v: 1,
        request_id: requestId,
        function: functionKey,
        stage,
        source: entry.source,
        ...(replays.has(requestId) && { replay_of: replays.get(requestId) }),
        label: entry.label,
        started_at: new Date(entry.startedAtMs).toISOString(),
        duration_ms: Math.round(durationMs ?? 0),
        init_ms: initMs === undefined ? null : Math.round(initMs),
        deployed_timeout_s: timeoutSeconds ?? null,
        outcome,
        status_code: statusCode ?? null,
        caller_received: shown.error ? callerReceived(event, streamed) : null,
        error: shown.error
          ? {
              type: shown.error.type,
              message: shown.error.message,
              stack: shown.error.trace.map(String),
            }
          : null,
        logs: { lines: entry.logs.lines, truncated: entry.logs.truncated },
        event: eventBody.value,
        event_encoding: eventBody.encoding,
        event_truncated: eventBody.truncated,
        event_bytes: eventBody.bytes,
        response: response?.value ?? null,
        response_truncated: response?.truncated ?? false,
        response_bytes: response?.bytes ?? 0,
        context: {
          function_name: info.name ?? null,
          memory_mb: info.memoryMb ?? null,
          deadline_ms: deadlineMs ?? null,
        },
        redacted: [
          ...eventBody.paths.map((at) => `event.${at}`),
          ...(response?.paths ?? []).map((at) => `response.${at}`),
        ],
      }
      const file = write({
        functionKey,
        startedAtMs: entry.startedAtMs,
        requestId,
        content,
      })
      totals.total += 1
      if (outcome !== 'ok') totals.errors += 1
      last = {
        request_id: requestId,
        function: functionKey,
        outcome,
        ts: new Date(now()).toISOString(),
      }
      events.emit('invocation.end', {
        function: functionKey,
        request_id: requestId,
        source: entry.source,
        outcome,
        status_code: statusCode,
        error_type: shown.error?.type,
        duration_ms: content.duration_ms,
        file,
      })
      // The file is written and its end recorded: whoever waits for this invocation learns it.
      const waiter = waiters.get(requestId)
      waiters.delete(requestId)
      replays.delete(requestId)
      if (waiter) {
        if (file) waiter.resolve({ file })
        else {
          waiter.reject(
            new Error(
              'Dev Mode could not write the invocation file of the replay.',
            ),
          )
        }
      }
    },
    /**
     * The raw event an invocation of this session ran with: `{ requestId, functionKey, eventBytes,
     * environmentId, headers, source }`, or null. An exact id of any length is found first;
     * otherwise a prefix needs REQUEST_ID_PREFIX_MIN characters. A shorter prefix, or a prefix of
     * two ids, throws with `reason: 'ambiguous_request_id'`.
     */
    rawEventOf(idOrPrefix) {
      const id = String(idOrPrefix ?? '').trim()
      if (raw.has(id)) return raw.get(id)
      if (id.length < REQUEST_ID_PREFIX_MIN) {
        throw Object.assign(
          new Error(
            `Give the full request id, or at least its first ${REQUEST_ID_PREFIX_MIN} characters.`,
          ),
          { reason: 'ambiguous_request_id' },
        )
      }
      const found = [...raw.values()].filter((item) =>
        item.requestId.startsWith(id),
      )
      if (found.length > 1) {
        throw Object.assign(
          new Error(
            `"${id}" matches more than one request: ${found.map((item) => item.requestId).join(', ')}.`,
          ),
          { reason: 'ambiguous_request_id' },
        )
      }
      return found[0] ?? null
    },
    lastInvocation: () => last,
    counts: () => ({ ...totals }),
    /** The invocation with this id is a replay of `replayOf`: its file says so (`replay_of`). */
    expectReplay({ requestId, replayOf }) {
      replays.set(requestId, replayOf)
    },
    /** Resolves `{ file }` once this invocation's file is written and its end recorded. */
    whenEnded(requestId) {
      return new Promise((resolve, reject) => {
        waiters.set(requestId, { resolve, reject })
      })
    },
    /** A replay that will not run, or that its caller gave up on: nothing more waits for it. */
    forgetReplay(requestId) {
      replays.delete(requestId)
      waiters.delete(requestId)
    },
  }
}
