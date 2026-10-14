/**
 * The commands' side of a session's control endpoint: `connectToSession` reads the service
 * directory's `session.json` and `control.token` and returns a client only when that session is
 * live (its process runs and its endpoint answers with its session id). Requests go over
 * `node:http` (no global fetch: Node.js 18 prints an experimental-feature warning for it).
 */
import http from 'http'
import nodeFs from 'fs'
import { devDirOf } from '../state/paths.js'
import {
  HEALTH_TIMEOUT_MS,
  readSession,
  readToken,
} from '../state/session-file.js'
import { processAlive } from '../local/leftovers.js'
import { GLOBAL_TIMERS } from '../attach/session-support.js'

const LOOPBACK_URL = /^http:\/\/(?:127\.0\.0\.1|localhost):([0-9]{1,5})$/
/**
 * A health check that gets no answer (an endpoint just starting to listen, a session busy for a
 * moment) is asked once more after this long before the session counts as not running; 0 asks
 * once.
 */
export const HEALTH_RETRY_MS = 250

/**
 * The endpoint a record names, only when it is on this machine: `http://127.0.0.1:<port>` or
 * `http://localhost:<port>`, exactly, always asked at `http://127.0.0.1:<port>` (the address the
 * endpoint listens on; `localhost` can resolve to ::1 first). Anything else (another host, a path,
 * credentials, https) is null: the token is never sent elsewhere.
 */
export const loopbackUrlOf = (record) => {
  const url = record?.control?.url
  const port = Number(
    LOOPBACK_URL.exec(typeof url === 'string' ? url : '')?.[1],
  )
  return port >= 1 && port <= 65_535 ? `http://127.0.0.1:${port}` : null
}

/** A minimal fetch for the loopback endpoint: resolves `{ status, json() }`, one connection per call. */
export const loopbackFetch = (
  url,
  { method = 'GET', headers = {}, body, signal } = {},
) =>
  new Promise((resolve, reject) => {
    const request = http.request(
      url,
      {
        method,
        agent: false,
        signal,
        headers: {
          ...headers,
          ...(body !== undefined && {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(body),
          }),
        },
      },
      (response) => {
        const chunks = []
        response.on('data', (chunk) => chunks.push(chunk))
        response.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8')
          resolve({
            status: response.statusCode,
            json: async () => (text ? JSON.parse(text) : null),
          })
        })
        response.on('error', reject)
      },
    )
    request.on('error', reject)
    request.end(body)
  })

/**
 * Calls one route; resolves `{ status, body }` (body null for 204 or a body that is not JSON).
 * `timeoutMs` 0 waits as long as the session takes.
 */
const callWith =
  ({ url, token, fetch, timers }) =>
  async (method, route, body, timeoutMs) => {
    const abort = new AbortController()
    const timer = timeoutMs
      ? timers.setTimeout(() => abort.abort(), timeoutMs)
      : null
    try {
      const response = await fetch(`${url}${route}`, {
        method,
        headers: { Authorization: `Bearer ${token}` },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: abort.signal,
      })
      const answer =
        response.status === 204 ? null : await response.json().catch(() => null)
      return { status: response.status, body: answer }
    } finally {
      if (timer) timers.clearTimeout(timer)
    }
  }

/**
 * The `health` that `claimSession` and `isSessionLive` take: asks the record's endpoint, with the
 * token in `dir`, and resolves its answer (`{ session_id, state }`) or null. Never rejects: an
 * endpoint that is gone, refuses the connection or does not answer in time is no answer.
 */
export const healthOf =
  ({ dir, fs = nodeFs, fetch = loopbackFetch, timers = GLOBAL_TIMERS }) =>
  async ({ record }) => {
    const token = readToken({ dir, fs })
    const url = loopbackUrlOf(record)
    if (!token || !url) return null
    const call = callWith({ url, token, fetch, timers })
    try {
      const answer = await call(
        'GET',
        '/v1/health',
        undefined,
        HEALTH_TIMEOUT_MS,
      )
      return answer.status === 200 ? answer.body : null
    } catch {
      return null
    }
  }

/**
 * A client for the live session of `serviceDir`, or null when there is none:
 * `{ record, health(), status(), stop({ keep }), replay(requestId, { timeoutMs }), touch() }`,
 * each resolving `{ status, body }` whatever the HTTP status (a 404 or 409 replay too); each
 * rejects only when the connection fails or its time limit passes.
 */
export const connectToSession = async ({
  serviceDir,
  fs = nodeFs,
  fetch = loopbackFetch,
  isAlive = processAlive,
  timeoutMs = HEALTH_TIMEOUT_MS,
  timers = GLOBAL_TIMERS,
  retryMs = HEALTH_RETRY_MS,
}) => {
  if (!serviceDir) return null
  const dir = devDirOf(serviceDir)
  const record = readSession({ dir, fs })
  const url = loopbackUrlOf(record)
  if (!url || !isAlive(Number(record.pid))) return null
  const token = readToken({ dir, fs })
  if (!token) return null
  const call = callWith({ url, token, fetch, timers })
  const session = {
    record,
    health: () => call('GET', '/v1/health', undefined, timeoutMs),
    status: () => call('GET', '/v1/status', undefined, timeoutMs),
    stop: ({ keep = false } = {}) =>
      call('POST', '/v1/stop', { keep }, timeoutMs),
    replay: (requestId, { timeoutMs: waitMs = 0 } = {}) =>
      call('POST', '/v1/replay', { request_id: requestId }, waitMs),
    touch: () => call('POST', '/v1/touch', undefined, timeoutMs),
  }
  // true: this session; false: another one answers; null: no answer.
  const ask = async () => {
    try {
      const answer = await session.health()
      if (answer.status !== 200) return null
      return answer.body?.session_id === record.session_id
    } catch {
      return null
    }
  }
  let answer = await ask()
  if (answer === null && retryMs > 0) {
    await new Promise((resolve) => timers.setTimeout(resolve, retryMs))
    answer = await ask()
  }
  return answer ? session : null
}
