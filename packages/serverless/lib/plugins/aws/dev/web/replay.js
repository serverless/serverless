/**
 * Replays a recorded web app request on this machine, for `serverless dev replay`: the request in
 * its file (`.serverless/dev/requests/`) is sent again to the web app's local server through the
 * session's HTTP dispatch, which records it with `source: "replay"` in a file of its own. No caller
 * gets the response.
 *
 * The file keeps no credentials, so the replay leaves out the headers and the signed-URL query
 * parameters it redacted, and its result names them (`note: "redacted_values_omitted"`). A request
 * whose body the file cut at 1 MiB, or never saw, is not replayed: the local server would get
 * another request. Neither is one to a web app that does not run on this machine.
 * One replay runs at a time, and the wait for its response is bounded.
 */
import fs from 'fs'
import { randomUUID as nodeRandomUUID } from 'crypto'
// Subpath import: tests that load every plugin mock '@serverless/util' wholesale.
import { style } from '@serverless/util/src/logger/index.js'
import { GLOBAL_TIMERS } from '../attach/session-support.js'
import { devDirOf, fromRecordPath } from '../state/paths.js'
import { findRequest } from '../state/read.js'
import {
  bodyBytesOf,
  withoutRedactedHeaders,
  withoutRedactedParameters,
} from '../state/requests.js'
import { REPLAY_RESPONSE_LIMIT } from '../local/replay.js'

/** How long a replayed request's response is waited for: a Web Function's longest request. */
export const REQUEST_REPLAY_TIMEOUT_MS = 15 * 60_000
/** Beyond that, how long `serverless dev replay` waits for the session's answer. */
export const REQUEST_REPLAY_MARGIN_MS = 30_000

/** The `reason` of a refusal to replay a request whose body the file cut. */
export const BODY_TRUNCATED = 'request_body_truncated'
/** The `reason` of a refusal to replay a request whose body was never seen (its file says so). */
export const BODY_NOT_CAPTURED = 'request_body_not_captured'
/** The `reason` of a refusal to replay a request to a web app that does not run here. */
export const WEB_APP_NOT_LOCAL = 'web_app_not_local'

const notLocal = (message) =>
  Object.assign(new Error(message), {
    reason: WEB_APP_NOT_LOCAL,
    code: 'DEV_MODE_WEB_APP_NOT_LOCAL',
  })

/**
 * `runtime()` returns the session's web runtime (`{ dispatch, runs(key) }`) and `recorder()` its
 * request recorder, or null before they exist. Returns `replay(idOrPrefix) → Promise<fields>`: the
 * `dev replay` fields of the run. A request id that names nothing, or more than one request,
 * throws with `.reason` 'invocation_not_found' or 'ambiguous_request_id'; a cut body with
 * BODY_TRUNCATED, a body never seen with BODY_NOT_CAPTURED, a web app not running here with
 * WEB_APP_NOT_LOCAL; any other refusal with a message only.
 */
export const createRequestReplayHandler = ({
  serviceDir,
  runtime,
  recorder,
  logger,
  isStopping = () => false,
  timers = GLOBAL_TIMERS,
  randomUUID = nodeRandomUUID,
  fs: fsRef = fs,
  find = findRequest,
  timeoutMs = REQUEST_REPLAY_TIMEOUT_MS,
}) => {
  const replayOnce = async (idOrPrefix) => {
    if (isStopping()) {
      throw new Error(
        'Dev Mode is stopping; nothing more runs on this machine.',
      )
    }
    if (!serviceDir) {
      throw new Error(
        'This Dev Mode session has no service directory, so it keeps no requests to replay.',
      )
    }
    const web = runtime()
    const records = recorder()
    if (!web || !records) {
      throw notLocal(
        'This Dev Mode session runs no web app on this machine, so it replays no web request.',
      )
    }
    const { record } = await find({
      dir: devDirOf(serviceDir),
      idOrPrefix: String(idOrPrefix ?? ''),
      fs: fsRef,
    })
    const key = record.web_app
    if (!web.runs(key)) {
      throw notLocal(
        `The web app ${key} does not run on this machine in this session.`,
      )
    }
    const request = record.request ?? {}
    if (request.body_truncated) {
      throw Object.assign(
        new Error(
          `The body of request ${record.request_id} was larger than 1 MiB and its file keeps only the first 1 MiB, so it is not replayed.`,
        ),
        { reason: BODY_TRUNCATED },
      )
    }
    if (request.body_captured === false) {
      throw Object.assign(
        new Error(
          `The body of request ${record.request_id} was never read on this machine (the local server was not reached, or the body failed), so its file does not keep it and it is not replayed.`,
        ),
        { reason: BODY_NOT_CAPTURED },
      )
    }
    const headers = withoutRedactedHeaders(request.headers)
    const route = withoutRedactedParameters(request.path ?? '/')
    const omitted = [...headers.omitted, ...route.omitted]
    const requestId = randomUUID()
    records.expectReplay({ requestId, replayOf: record.request_id })
    const ended = records.whenEnded(requestId)
    ended.catch(() => {})
    const abort = new AbortController()
    let timer = null
    try {
      logger.notice(
        `${style.aside('↻')} Replaying ${record.request_id.slice(0, 8)} on ${key} as ${requestId.slice(0, 8)}; no caller receives the response`,
      )
      const run = async () => {
        try {
          const response = await web.dispatch({
            key,
            id: requestId,
            method: request.method || 'GET',
            path: route.path || '/',
            headers: headers.headers,
            body: bodyBytesOf(request),
            source: 'replay',
            signal: abort.signal,
          })
          // The response is read for the request to end; nobody else reads it.
          for await (const chunk of response.body ?? []) void chunk
        } catch {
          // The dispatch recorded the failure; its file says what happened.
        }
        return ended
      }
      const { file } = await new Promise((resolve, reject) => {
        timer = timers.setTimeout(() => {
          abort.abort()
          reject(
            new Error(
              `The replay of ${record.request_id} on ${key} did not end within ${Math.round(timeoutMs / 1000)}s.`,
            ),
          )
        }, timeoutMs)
        run().then(resolve, reject)
      })
      const saved = JSON.parse(
        fsRef.readFileSync(fromRecordPath(serviceDir, file), 'utf8'),
      )
      const response = saved.response ?? null
      const responseFits =
        response !== null &&
        Buffer.byteLength(JSON.stringify(response)) <= REPLAY_RESPONSE_LIMIT
      return {
        kind: 'request',
        request_id: requestId,
        replay_of: record.request_id,
        web_app: key,
        method: saved.request?.method ?? request.method,
        path: saved.request?.path ?? route.path,
        outcome: saved.outcome,
        ...(saved.status_code !== null &&
          saved.status_code !== undefined && {
            status_code: saved.status_code,
          }),
        duration_ms: saved.duration_ms,
        ...(saved.reason && { outcome_reason: saved.reason }),
        ...(responseFits && { response }),
        ...(response !== null && !responseFits && { response_omitted: true }),
        file,
        ...(omitted.length && {
          note: 'redacted_values_omitted',
          omitted,
        }),
      }
    } finally {
      timers.clearTimeout(timer)
      records.forgetReplay(requestId)
    }
  }

  let running = false
  return async (idOrPrefix) => {
    if (running) {
      throw new Error(
        'Another replay is running. Run dev replay again when it finishes.',
      )
    }
    running = true
    try {
      return await replayOnce(idOrPrefix)
    } finally {
      running = false
    }
  }
}
