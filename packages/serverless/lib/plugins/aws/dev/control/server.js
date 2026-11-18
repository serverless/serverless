/**
 * The running session's control endpoint, for the Dev Mode commands on this machine (`dev status`,
 * `dev stop`, `dev replay`, `dev wait`): HTTP on 127.0.0.1, a port the system picks, and a token
 * the session writes to `control.token`. Every request needs `Authorization: Bearer <token>`, a
 * `Host` of `127.0.0.1:<port>` or `localhost:<port>`, and no `Origin` (a web page cannot reach it);
 * anything else gets 403. JSON bodies are capped at CONTROL_BODY_LIMIT.
 *
 * GET /v1/health → { session_id, state }; GET /v1/status → the `dev status` fields;
 * POST /v1/stop { keep } → 202 { stopping: true }; POST /v1/replay { request_id, kind? } → 200
 * with the replay's fields, 404 or 409 { reason, message }; POST /v1/touch → 204. Status, replay
 * and touch count as activity (`handlers.touch`).
 */
import http from 'http'
import nodeFs from 'fs'
import { randomBytes as nodeRandomBytes } from 'crypto'
import { FILES } from '../state/paths.js'
import { writeToken } from '../state/session-file.js'
import {
  listenLoopback,
  readBody,
  sameToken,
  sendJson,
} from '../local/loopback.js'
import { GLOBAL_TIMERS } from '../attach/session-support.js'
import { shownPath } from '../commands/cli-names.js'

export const CONTROL_BODY_LIMIT = 64 * 1024
/**
 * How long a request may take to arrive in full (its headers and its body); the answer may take
 * longer (a replay runs for as long as the function's timeout).
 */
export const CONTROL_REQUEST_TIMEOUT_MS = 30_000
/** How long a closing endpoint lets a request still open finish. */
export const CLOSE_GRACE_MS = 1_000

const bearerOf = (header) => {
  const match = /^Bearer (\S+)$/.exec(String(header ?? ''))
  return match ? match[1] : null
}

const TOO_LARGE = Symbol('too large')

const pathOf = (url) => String(url ?? '').split('?')[0]

/**
 * A replay handler's error as its answer: the request id names nothing kept (404) or more than one
 * request (409), the request's body was cut in its file or never read (409), its web app does not
 * run here (409), or the session refuses the replay (409, reason 'error').
 */
// Refusals whose reason the command reports as it is.
const PASSED_ON = new Set([
  'ambiguous_request_id',
  'request_body_truncated',
  'request_body_not_captured',
  'web_app_not_local',
])
const replayRefusal = (error) => {
  const message = String(error?.message ?? error)
  if (error?.reason === 'invocation_not_found') {
    return { status: 404, body: { reason: error.reason, message } }
  }
  if (PASSED_ON.has(error?.reason)) {
    return { status: 409, body: { reason: error.reason, message } }
  }
  return { status: 409, body: { reason: 'error', message } }
}

/**
 * `handlers`: `health()` → `{ state }`; `status()` → fields; `stop({ keep })`; `replay({ request_id
 * })` → the `dev replay` fields, or a throw (see replayRefusal); `touch()`. Each may be async; any
 * other throw answers 500, except touch's, which changes no answer.
 */
export const startControlServer = async ({
  sessionId,
  token,
  handlers,
  logger,
  timers = GLOBAL_TIMERS,
  requestTimeoutMs = CONTROL_REQUEST_TIMEOUT_MS,
}) => {
  let port
  const debug = (text) => {
    try {
      logger?.debug?.(text)
    } catch {
      // Nothing to tell it with.
    }
  }
  // Activity is noted on the side: a failing hook changes no answer and never rejects unhandled.
  const touchFailed = (error) =>
    debug(
      `Dev Mode could not note activity on its control endpoint: ${error?.message ?? error}`,
    )
  const touch = () => {
    try {
      const noted = handlers.touch?.()
      if (typeof noted?.then === 'function') noted.then(undefined, touchFailed)
    } catch (error) {
      touchFailed(error)
    }
  }
  const routes = {
    'GET /v1/health': async () => ({
      status: 200,
      body: {
        session_id: sessionId,
        state: (await handlers.health?.())?.state ?? 'starting',
      },
    }),
    'GET /v1/status': async () => {
      touch()
      return { status: 200, body: await handlers.status() }
    },
    'POST /v1/stop': async (body) => {
      await handlers.stop({ keep: body.keep === true })
      return { status: 202, body: { stopping: true } }
    },
    'POST /v1/replay': async (body) => {
      touch()
      try {
        return {
          status: 200,
          body: await handlers.replay({
            request_id: body.request_id,
            ...(body.kind === 'request' && { kind: 'request' }),
          }),
        }
      } catch (error) {
        return replayRefusal(error)
      }
    },
    'POST /v1/touch': async () => {
      touch()
      return { status: 204 }
    },
  }
  // The request's body, or TOO_LARGE the moment it passes CONTROL_BODY_LIMIT (not at its end).
  const bodyWithin = (req) =>
    new Promise((resolve, reject) => {
      readBody(req, {
        limit: CONTROL_BODY_LIMIT,
        onLimit: () => resolve(TOO_LARGE),
      }).then(resolve, reject)
    })
  // A request must arrive in full within requestTimeoutMs (408); its answer may take longer.
  const server = http.createServer(
    {
      requestTimeout: requestTimeoutMs,
      headersTimeout: requestTimeoutMs,
      connectionsCheckingInterval: Math.min(1_000, requestTimeoutMs),
    },
    async (req, res) => {
      try {
        const host = String(req.headers.host ?? '').toLowerCase()
        if (
          req.headers.origin !== undefined ||
          (host !== `127.0.0.1:${port}` && host !== `localhost:${port}`) ||
          !sameToken(bearerOf(req.headers.authorization), token)
        ) {
          req.resume()
          return sendJson(res, 403, { error: 'forbidden' })
        }
        const route = routes[`${req.method} ${pathOf(req.url)}`]
        if (!route) {
          req.resume()
          return sendJson(res, 404, { error: 'not_found' })
        }
        let body = {}
        if (req.method === 'POST') {
          const raw = await bodyWithin(req)
          if (raw === TOO_LARGE) {
            // Answered as soon as the cap is passed; the rest is never read. The socket is closed
            // after the answer, so a client still sending may see the connection reset before it
            // reads the 413 (on macOS more often): best effort, the request is refused either way.
            res.setHeader('Connection', 'close')
            res.on('finish', () => req.socket?.destroy())
            return sendJson(res, 413, { error: 'too_large' })
          }
          if (raw.length) {
            try {
              body = JSON.parse(raw.toString('utf8'))
            } catch {
              return sendJson(res, 400, { error: 'invalid_json' })
            }
          }
          if (!body || typeof body !== 'object' || Array.isArray(body)) {
            return sendJson(res, 400, { error: 'invalid_json' })
          }
        } else {
          req.resume()
        }
        const answer = await route(body)
        if (answer.status === 204 || answer.body === undefined) {
          res.writeHead(answer.status)
          return res.end()
        }
        return sendJson(res, answer.status, answer.body)
      } catch (error) {
        debug(
          `Dev Mode could not answer a control request: ${error?.message ?? error}`,
        )
        if (!res.headersSent) return sendJson(res, 500, { error: 'internal' })
        return res.end()
      }
    },
  )
  ;({ port } = await listenLoopback(server))
  let closing = null
  return {
    url: `http://127.0.0.1:${port}`,
    /**
     * Stops listening; answers being written finish (a `dev stop` gets its 202), and a request still
     * open after CLOSE_GRACE_MS is cut.
     */
    close() {
      closing ??= new Promise((resolve) => {
        const grace = timers.setTimeout(
          () => server.closeAllConnections?.(),
          CLOSE_GRACE_MS,
        )
        server.close(() => {
          timers.clearTimeout(grace)
          resolve()
        })
        server.closeIdleConnections?.()
      })
      return closing
    },
  }
}

/**
 * The session's side: a new token (32 random bytes, hex) written to `control.token` only, the
 * endpoint started, and its address put in the session file. Resolves the server (`{ url, close }`).
 * An address the session file cannot take (no longer writable, or no longer this session's) leaves
 * the endpoint unreachable to every command: it is closed, and the call rejects.
 */
export const openSessionControl = async ({
  dir,
  sessionFile,
  sessionId,
  handlers,
  logger,
  timers,
  fs = nodeFs,
  randomBytes = nodeRandomBytes,
}) => {
  const token = randomBytes(32).toString('hex')
  writeToken({ dir, token, fs })
  const server = await startControlServer({
    sessionId,
    token,
    handlers,
    logger,
    timers,
  })
  if (
    !sessionFile.update({
      control: { url: server.url, token_file: FILES.token },
    })
  ) {
    await server.close()
    throw new Error(
      `its address could not be written to ${shownPath(`.serverless/dev/${FILES.session}`)}`,
    )
  }
  return server
}
