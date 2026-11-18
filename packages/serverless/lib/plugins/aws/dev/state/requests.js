/**
 * The record of every web app request that runs on this machine, as state/invocations.js keeps
 * the invocations: one JSON file per request under
 * `.serverless/dev/requests/<web app>/<unix seconds>-<request id>.json` (credentials redacted,
 * bodies cut at REQUEST_BODY_BYTES), at most REQUEST_FILES_PER_WEB_APP files per web app and, with
 * the invocation files, RECORD_BYTES_PER_SERVICE in all (oldest removed first), and
 * `request.start` and `request.end` records in the event log.
 *
 * Its interface is the one the web relay and the HTTP dispatch call: `start(...)` when a request
 * was accepted (relayed; `source` missing) or sent to the local server (`local`, `replay`),
 * `note(...)` with what the dispatch saw of the request's body and the local server's response,
 * and `end(...)`. A request that did not run on this machine (`outcome: 'not_run'`) has no status
 * code, whoever reports it. The credentials request of a `--local-only` web app
 * (CREDENTIALS_PATH) is never recorded.
 */
import nodeFs from 'fs'
import {
  FILES,
  requestFileName,
  requestRecordPath,
  webAppDirOf,
} from './paths.js'
import { scrubLine } from './events.js'
import { RECORD_BYTES_PER_SERVICE, createRecordFiles } from './record-files.js'
import { REDACTED, REDACTED_HEADERS } from './redact.js'
import { LINKED_DIR_CODE } from './real-dir.js'
import { CREDENTIALS_PATH } from '../attach/naming.js'

export const REQUEST_FILES_PER_WEB_APP = 500
export const REQUEST_BODY_BYTES = 1024 * 1024
/** The path of a `--local-only` web app's credentials request, which is never recorded. */
export const UNRECORDED_PATH = CREDENTIALS_PATH

export const DEFAULT_REQUEST_LIMITS = Object.freeze({
  filesPerWebApp: REQUEST_FILES_PER_WEB_APP,
  bytesPerService: RECORD_BYTES_PER_SERVICE,
  bodyBytes: REQUEST_BODY_BYTES,
})

/**
 * The header values a request file never keeps: the function records' list (credentials,
 * cookies, API keys), and `x-amz-date`, which with a signature dates a SigV4-signed request.
 */
export const REDACTED_REQUEST_HEADERS = Object.freeze([
  ...REDACTED_HEADERS,
  'x-amz-date',
])
const SECRET_HEADERS = new Set(REDACTED_REQUEST_HEADERS)
/**
 * The query parameters a request file never keeps: those of a request signed in its URL (SigV4
 * query signing), and the tokens an OAuth or sign-in callback can carry. An authorization `code` is
 * kept: it is used once, and `code` names other things in many apps.
 */
export const REDACTED_QUERY_PARAMETERS = Object.freeze([
  'x-amz-signature',
  'x-amz-credential',
  'x-amz-security-token',
  'access_token',
  'id_token',
  'refresh_token',
  'token',
  'client_secret',
])
const SECRET_PARAMETERS = new Set(REDACTED_QUERY_PARAMETERS)

const isPlainObject = (value) =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value)

const decodeName = (name) => {
  try {
    return decodeURIComponent(name.replace(/\+/g, ' '))
  } catch {
    return name
  }
}

/**
 * `{ path, redacted }`: the path with the values of REDACTED_QUERY_PARAMETERS replaced
 * (`X-Amz-Signature=[redacted]`); `redacted` names each replaced parameter as the path wrote it.
 * Everything else of the path stays as it came.
 */
export const redactPath = (rawPath) => {
  const text = String(rawPath ?? '')
  const at = text.indexOf('?')
  if (at === -1) return { path: text, redacted: [] }
  const redacted = []
  const query = text
    .slice(at + 1)
    .split('&')
    .map((part) => {
      const equals = part.indexOf('=')
      const name = equals === -1 ? part : part.slice(0, equals)
      if (!SECRET_PARAMETERS.has(decodeName(name).toLowerCase())) return part
      redacted.push(name)
      return `${name}=${REDACTED}`
    })
    .join('&')
  return { path: `${text.slice(0, at)}?${query}`, redacted }
}

/** The path without the parameters `redactPath` replaced: what a replay sends. */
export const withoutRedactedParameters = (recordedPath) => {
  const text = String(recordedPath ?? '')
  const at = text.indexOf('?')
  if (at === -1) return { path: text, omitted: [] }
  const omitted = []
  const kept = text
    .slice(at + 1)
    .split('&')
    .filter((part) => {
      const equals = part.indexOf('=')
      const name = equals === -1 ? part : part.slice(0, equals)
      const secret = SECRET_PARAMETERS.has(decodeName(name).toLowerCase())
      if (secret) omitted.push(name)
      return !secret
    })
  return {
    path: kept.length
      ? `${text.slice(0, at)}?${kept.join('&')}`
      : text.slice(0, at),
    omitted,
  }
}

/**
 * `{ headers, redacted }`: the headers with credential values replaced (a list value element by
 * element), names as they came; `redacted` lists the replaced names.
 */
export const redactRequestHeaders = (headers) => {
  if (!isPlainObject(headers)) return { headers: {}, redacted: [] }
  const redacted = []
  const copy = {}
  for (const [name, value] of Object.entries(headers)) {
    if (SECRET_HEADERS.has(name.toLowerCase())) {
      copy[name] = Array.isArray(value) ? value.map(() => REDACTED) : REDACTED
      redacted.push(name)
    } else {
      copy[name] = value
    }
  }
  return { headers: copy, redacted }
}

/** The headers without the redacted ones: what a replay sends, and the names it left out. */
export const withoutRedactedHeaders = (headers) => {
  const kept = {}
  const omitted = []
  for (const [name, value] of Object.entries(
    isPlainObject(headers) ? headers : {},
  )) {
    const values = [value].flat()
    if (SECRET_HEADERS.has(name.toLowerCase()) || values.includes(REDACTED)) {
      omitted.push(name)
    } else {
      kept[name] = value
    }
  }
  return { headers: kept, omitted }
}

/**
 * A body as the file keeps it: `{ body, body_encoding, body_truncated, body_bytes }`. `head` is
 * the first bytes (at most the limit) of a body of `bytes` bytes; UTF-8 text stays text (a
 * character cut at the end is left out), anything else is base64. No body is `body: null`.
 */
export const bodyFieldsOf = ({ head, bytes } = {}) => {
  if (!Buffer.isBuffer(head)) {
    return {
      body: null,
      body_encoding: null,
      body_truncated: false,
      body_bytes: bytes ?? 0,
    }
  }
  const total = Math.max(bytes ?? head.length, head.length)
  const truncated = total > head.length
  let text = null
  try {
    text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(
      head,
      { stream: truncated },
    )
  } catch {
    text = null
  }
  return text === null
    ? {
        body: head.toString('base64'),
        body_encoding: 'base64',
        body_truncated: truncated,
        body_bytes: total,
      }
    : {
        body: text,
        body_encoding: 'text',
        body_truncated: truncated,
        body_bytes: total,
      }
}

/** The bytes of a recorded body (`bodyFieldsOf`), or undefined for none. */
export const bodyBytesOf = (fields) => {
  if (fields?.body === null || fields?.body === undefined) return undefined
  return fields.body_encoding === 'base64'
    ? Buffer.from(fields.body, 'base64')
    : Buffer.from(String(fields.body))
}

/** A header's first value, its name matched in any case. */
const headerOf = (headers, wanted) => {
  if (!isPlainObject(headers)) return undefined
  const found = Object.entries(headers).find(
    ([name]) => name.toLowerCase() === wanted,
  )
  return found ? [found[1]].flat()[0] : undefined
}

/**
 * Whether the headers say there is no body: no `transfer-encoding`, and no `content-length` or
 * one of 0.
 */
const saysNoBody = (headers) => {
  if (headerOf(headers, 'transfer-encoding') !== undefined) return false
  const length = headerOf(headers, 'content-length')
  return length === undefined || String(length).trim() === '0'
}

/**
 * A body the record never saw (its stream was not read: the local server was not reached, or
 * the stream failed): its size is unknown, and a replay of it is refused.
 */
export const UNKNOWN_BODY = Object.freeze({
  body: null,
  body_encoding: null,
  body_truncated: false,
  body_bytes: null,
  body_captured: false,
})

/** The request's body fields: what the dispatch saw of it, else none or unknown by its headers. */
const requestBodyFieldsOf = (entry) => {
  if (entry.requestBody) {
    return { ...bodyFieldsOf(entry.requestBody), body_captured: true }
  }
  // A body that existed but was never read (one the relay could not download): its headers may
  // say nothing of it (the bridge leaves out transfer-encoding).
  if (entry.requestBodyUnknown) return { ...UNKNOWN_BODY }
  if (saysNoBody(entry.headers)) {
    return {
      ...bodyFieldsOf({ head: Buffer.alloc(0), bytes: 0 }),
      body_captured: true,
    }
  }
  return { ...UNKNOWN_BODY }
}

const pathOnly = (text) => String(text ?? '').split('?')[0]

/**
 * `dir` is the session's `.serverless/dev` directory; `events` its event log; `stage` the
 * session's stage (each file names it); `files` the session's shared record files.
 */
export const createRequestRecorder = ({
  dir,
  now = Date.now,
  events,
  fs = nodeFs,
  limits = {},
  stage = null,
  files = null,
  onError = () => {},
  // Called once, with a line, when a directory of the record is a link (nothing is recorded then).
  onWarning = () => {},
}) => {
  const limit = { ...DEFAULT_REQUEST_LIMITS, ...limits }
  const store =
    files ??
    createRecordFiles({
      dir,
      fs,
      bytesPerService: limit.bytesPerService,
      onError,
    })
  const running = new Map()
  // Replays this session runs (`serverless dev replay`): request id → the id it replays.
  const replays = new Map()
  // Who waits for a request's file, by request id.
  const waiters = new Map()
  const totals = { total: 0, failed: 0 }
  // The last request that ended, as `dev status` names it.
  let last = null
  let warned = false

  const write = ({ key, startedAtMs, id, content }) => {
    try {
      const name = requestFileName({ startedAtMs, requestId: id })
      store.write({
        tree: FILES.requests,
        group: webAppDirOf(key),
        name,
        seconds: Math.floor(startedAtMs / 1000),
        content,
        perGroup: limit.filesPerWebApp,
      })
      return requestRecordPath({ webAppKey: key, fileName: name })
    } catch (error) {
      if (error?.code !== LINKED_DIR_CODE) onError(error)
      else if (!warned) {
        warned = true
        onWarning(
          `Dev Mode keeps no web request files: ${error.message}. Replace the link with a directory to keep them.`,
        )
      }
      return null
    }
  }

  const settle = (id, file) => {
    const waiter = waiters.get(id)
    waiters.delete(id)
    replays.delete(id)
    if (!waiter) return
    if (file) waiter.resolve({ file })
    else {
      waiter.reject(
        new Error('Dev Mode could not write the request file of the replay.'),
      )
    }
  }

  return {
    /** How many bytes of each body the dispatch keeps for the file. */
    captureBytes: limit.bodyBytes,
    start({ id, key, method, path, headers, source, at }) {
      if (pathOnly(path) === UNRECORDED_PATH) return
      const shown = redactPath(path)
      const entry = {
        key,
        startedAtMs: at ?? now(),
        // A relayed request is started by the relay, which names no source.
        source: source ?? 'relay',
        method: String(method ?? ''),
        path: shown.path,
        pathRedacted: shown.redacted,
        headers,
        requestBody: null,
        response: null,
        responseBody: null,
      }
      running.set(id, entry)
      events.emit('request.start', {
        web_app: key,
        request_id: id,
        method: entry.method,
        path: entry.path,
        source: entry.source,
      })
    },
    /**
     * What the dispatch saw: `headers` of the request as sent, `requestBody: { head, bytes }`
     * (or `requestBodyUnknown: true` from the relay, for a body it could not read),
     * `response: { status, headers }`, `responseBody: { head, bytes }`.
     */
    note({ id, ...fields }) {
      const entry = running.get(id)
      if (!entry) return
      for (const name of [
        'headers',
        'requestBody',
        'requestBodyUnknown',
        'response',
        'responseBody',
      ]) {
        if (fields[name] !== undefined) entry[name] = fields[name]
      }
    },
    end({ id, key, at, durationMs, outcome, status, bytes, reason }) {
      const entry = running.get(id)
      if (!entry) {
        // Never started here: the credentials request, or a start that failed.
        settle(id, null)
        return
      }
      running.delete(id)
      const endedAt = at ?? now()
      const notRun = outcome === 'not_run'
      const why =
        reason === undefined || reason === null ? null : scrubLine(reason)
      const statusCode = notRun || !Number.isInteger(status) ? null : status
      const request = redactRequestHeaders(entry.headers)
      const response =
        !notRun && entry.response
          ? redactRequestHeaders(entry.response.headers)
          : null
      const responseBody = bodyFieldsOf(entry.responseBody ?? { bytes })
      const content = {
        v: 1,
        request_id: id,
        web_app: entry.key ?? key,
        stage,
        source: entry.source,
        ...(replays.has(id) && { replay_of: replays.get(id) }),
        started_at: new Date(entry.startedAtMs).toISOString(),
        duration_ms: Math.round(durationMs ?? endedAt - entry.startedAtMs),
        outcome,
        status_code: statusCode,
        reason: why,
        request: {
          method: entry.method,
          path: entry.path,
          headers: request.headers,
          ...requestBodyFieldsOf(entry),
        },
        response: response
          ? {
              status_code: entry.response.status ?? statusCode,
              headers: response.headers,
              ...responseBody,
              body_bytes: Math.max(bytes ?? 0, responseBody.body_bytes),
            }
          : null,
        redacted: [
          ...entry.pathRedacted.map((name) => `request.query.${name}`),
          ...request.redacted.map((name) => `request.headers.${name}`),
          ...(response?.redacted ?? []).map(
            (name) => `response.headers.${name}`,
          ),
        ],
      }
      const file = write({
        key: content.web_app,
        startedAtMs: entry.startedAtMs,
        id,
        content,
      })
      totals.total += 1
      if (outcome !== 'answered') totals.failed += 1
      last = {
        request_id: id,
        web_app: content.web_app,
        outcome,
        ts: new Date(endedAt).toISOString(),
      }
      events.emit('request.end', {
        web_app: content.web_app,
        request_id: id,
        source: entry.source,
        method: entry.method,
        path: entry.path,
        outcome,
        status_code: statusCode,
        duration_ms: content.duration_ms,
        bytes: notRun ? 0 : (bytes ?? 0),
        reason: why ?? undefined,
        file,
      })
      // The file is written and its end recorded: whoever waits for this request learns it.
      settle(id, file)
    },
    counts: () => ({ ...totals }),
    /** `{ request_id, web_app, outcome, ts }` of the last request that ended, or null. */
    lastRequest: () => last,
    /** The request with this id is a replay of `replayOf`: its file says so (`replay_of`). */
    expectReplay({ requestId, replayOf }) {
      replays.set(requestId, replayOf)
    },
    /** Resolves `{ file }` once this request's file is written and its end recorded. */
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
