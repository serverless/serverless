/**
 * The record of every invocation that runs on this machine: one JSON file per invocation under
 * `.serverless/dev/invocations/<function>/<unix seconds>-<request id>.json` (redacted, bodies cut
 * at BODY_INLINE_BYTES, at most INVOCATION_FILES_PER_FUNCTION files per function and
 * INVOCATION_BYTES_PER_SERVICE in all with the web request files, oldest removed first),
 * `invocation.start` and `invocation.end` records in the event log, and, in memory only, the raw
 * events of the latest invocations for `dev replay`. It has the invocation output's interface
 * (`start`, `log`, `end`, `workerExited`) and runs beside it. Never written: the function's
 * environment, credentials, the Lambda-Runtime headers other than the request id and deadline, and
 * the session key.
 */
import nodeFs from 'fs'
import {
  FILES,
  REQUEST_ID_PREFIX_MIN,
  fnDirOf,
  invocationFileName,
  invocationRecordPath,
} from './paths.js'
import { cutText } from './events.js'
import { RECORD_BYTES_PER_SERVICE, createRecordFiles } from './record-files.js'
import { redactEvent, redactResponse } from './redact.js'
import { LINKED_DIR_CODE } from './real-dir.js'
import { TIMED_OUT } from '../local/replies.js'
import {
  callerReceived,
  errorStatusCode,
  eventLabel,
  outcomeOf,
  preludeStatusCode,
  splitPrelude,
} from '../local/invocation-output.js'

export const INVOCATION_FILES_PER_FUNCTION = 500
// Shared with the web request files (record-files.js).
export const INVOCATION_BYTES_PER_SERVICE = RECORD_BYTES_PER_SERVICE
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
  const { prelude, body: rest } = splitPrelude({ contentType, head })
  if (prelude) {
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
  // The shared record files (record-files.js); one of its own otherwise.
  files = null,
}) => {
  const limit = { ...DEFAULT_LIMITS, ...limits }
  const running = new Map()
  // Raw events for replay, oldest first (a Map keeps insertion order).
  const raw = new Map()
  let rawBytes = 0
  // The files of the record, shared with the session's request recorder when it passes them.
  const store =
    files ??
    createRecordFiles({
      dir,
      fs,
      bytesPerService: limit.bytesPerService,
      onError,
    })
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

  /** Writes the file (whole or not at all) and returns its record path, or null. */
  const write = ({ functionKey, startedAtMs, requestId, content }) => {
    try {
      const name = invocationFileName({ startedAtMs, requestId })
      store.write({
        tree: FILES.invocations,
        group: fnDirOf(functionKey),
        name,
        seconds: Math.floor(startedAtMs / 1000),
        content,
        perGroup: limit.filesPerFunction,
      })
      return invocationRecordPath({ functionKey, fileName: name })
    } catch (error) {
      if (error?.code !== LINKED_DIR_CODE) onError(error)
      else if (!warned) {
        warned = true
        onWarning(
          `Dev Mode keeps no invocation files: ${error.message}. Replace the link with a directory to keep them.`,
        )
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
