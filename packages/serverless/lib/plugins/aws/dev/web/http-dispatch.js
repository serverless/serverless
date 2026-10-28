/**
 * Sends a web app's requests to its server on this machine, as a reverse proxy does (D8): the
 * relayed ones (web/relay.js), the ones made to the CLI's local listener (local-proxy.js) and the
 * replayed ones. The local server sees Host set to its own address and the public host, scheme and
 * caller in X-Forwarded-Host, X-Forwarded-Proto and X-Forwarded-For, so a dev server that checks
 * the host accepts the request. Bodies stream both ways; nothing is decompressed.
 *
 * A request nothing reached (the web app's server is not serving, or refused the connection) goes
 * different ways by where it came from: a relayed one is rejected with `notRun`, so the bridge
 * gives it to the deployed code; a local or replayed one has no other place to go and gets a 503
 * saying the web app is not running on this machine.
 *
 * Recording: the relay records the requests it accepted itself (start, and end once the response
 * was relayed); this module records the local and replayed ones through the same recorder, so
 * every request is recorded once, the same way.
 */
import http from 'http'
import { Readable, Transform, pipeline } from 'stream'
import { endToEndHeaders } from './bridge/http.mjs'

// The headers AWS adds to each request of a Web Function: they describe that invocation only.
const PLATFORM_HEADER = /^lambda-web-/

/** The body of the 502 a request gets when its local server failed before it answered. */
export const FAILED_BODY = Buffer.from(
  "Dev Mode could not get a response from this web app's local server.\n",
)

/**
 * The body of the 503 a local or replayed request gets while its web app's server is not serving.
 */
export const notRunningMessage = (key) =>
  `web app ${key} is not running on this machine`

/**
 * The headers a request is sent to the local server on `localPort` with: hop-by-hop headers (and
 * the ones Connection names) and the platform's `lambda-web-*` headers removed, names lower-cased,
 * `host` set to `127.0.0.1:<localPort>`. An X-Forwarded-Host or X-Forwarded-Proto already there
 * (the platform's: the real URL) is kept; otherwise the original host and `proto` are set.
 * `remoteAddress`, when given, is appended to X-Forwarded-For.
 */
export const forwardHeaders = (
  headers = {},
  { localPort, remoteAddress, proto = 'http' } = {},
) => {
  const forwarded = Object.fromEntries(
    Object.entries(endToEndHeaders(headers)).filter(
      ([name]) => !PLATFORM_HEADER.test(name),
    ),
  )
  const originalHost = [forwarded.host].flat()[0]
  forwarded.host = `127.0.0.1:${localPort}`
  if (!forwarded['x-forwarded-host'] && originalHost) {
    forwarded['x-forwarded-host'] = originalHost
  }
  if (!forwarded['x-forwarded-proto']) forwarded['x-forwarded-proto'] = proto
  if (remoteAddress) {
    const before = [forwarded['x-forwarded-for'] ?? []].flat().join(', ')
    forwarded['x-forwarded-for'] = before
      ? `${before}, ${remoteAddress}`
      : remoteAddress
  }
  return forwarded
}

const notRunError = (message, cause) => {
  const error = new Error(message)
  error.notRun = true
  if (cause?.code) error.code = cause.code
  return error
}

const describe = (error) => error?.code ?? error?.message ?? String(error)

/**
 * `servers` maps each web app's key to its LocalWebServer (local-server.js: `port`, `serving`);
 * `recorder` gets `start(...)` and `end(...)` of each local and replayed request (the relay records
 * its own), and, when it keeps bodies (`captureBytes`), `note(...)` of every request: its headers,
 * and the first `captureBytes` and the size of its body and of the response's, with the response's
 * status and headers. `dispatch({ key, id, method, path, headers, body, source, signal,
 * remoteAddress })` resolves `{ status, headers, body }` (body a Readable) once the local server
 * answered; `source` is 'relay', 'local' or 'replay'. `body` may be a Buffer, a string, a Readable
 * or any (async) iterable. `signal` aborts the request to the local server and destroys its
 * response.
 */
export const createHttpDispatch = ({
  servers,
  recorder = { start: () => {}, end: () => {} },
  now = Date.now,
}) => {
  const tell = (method, fields) => {
    try {
      recorder[method]?.(fields)
    } catch {
      // A recorder that fails never fails the request.
    }
  }
  // How much of each body the recorder keeps: nothing is held for a recorder that keeps none.
  const captureBytes = Math.max(0, Number(recorder.captureBytes) || 0)
  const noting = captureBytes > 0 && typeof recorder.note === 'function'
  /** The first `captureBytes` of a body and its size, as it passes. */
  const bodyTap = () => {
    const head = []
    let held = 0
    let bytes = 0
    return {
      add(chunk) {
        bytes += chunk.length
        if (held >= captureBytes) return
        const piece = chunk.subarray(0, captureBytes - held)
        head.push(piece)
        held += piece.length
      },
      value: () => ({ head: Buffer.concat(head), bytes }),
    }
  }

  const dispatch = ({
    key,
    id,
    method,
    path,
    headers = {},
    body,
    source,
    signal,
    remoteAddress,
  }) => {
    const relayed = source === 'relay'
    const recorded = !relayed
    const startedAt = now()
    if (recorded) {
      tell('start', { id, key, method, path, headers, source, at: startedAt })
    }
    // What the recorder keeps of each request (the relay's too): the headers as they came, and
    // the head of each body.
    if (noting) {
      tell('note', { id, headers })
      // A body already in memory (the relay's, an empty one) is known before anything runs, so
      // its record keeps it even when the local server is not reached; a streamed one is known
      // only once it was read through.
      if (body === undefined || body === null) {
        tell('note', {
          id,
          requestBody: { head: Buffer.alloc(0), bytes: 0 },
        })
      } else if (Buffer.isBuffer(body) || typeof body === 'string') {
        const bytes = Buffer.isBuffer(body) ? body : Buffer.from(body)
        tell('note', {
          id,
          requestBody: {
            head: bytes.subarray(0, captureBytes),
            bytes: bytes.length,
          },
        })
      }
    }
    let finished = false
    const end = (fields) => {
      if (!recorded || finished) return
      finished = true
      const at = now()
      tell('end', { id, key, at, durationMs: at - startedAt, ...fields })
    }

    const notRunning = (cause) => {
      if (relayed) {
        return Promise.reject(notRunError(notRunningMessage(key), cause))
      }
      const text = Buffer.from(notRunningMessage(key))
      // Not run here: the record has no status code, as the relay's has none.
      end({
        outcome: 'not_run',
        status: null,
        bytes: 0,
        reason: cause ? describe(cause) : notRunningMessage(key),
      })
      return Promise.resolve({
        status: 503,
        headers: {
          'content-type': 'text/plain; charset=utf-8',
          'content-length': String(text.length),
        },
        body: Readable.from([text]),
      })
    }

    const server = servers.get(key)
    if (!server?.serving || !server.port) return notRunning()

    return new Promise((resolve, reject) => {
      let answered = false
      let response
      const fail = (error) => {
        end({
          outcome: 'failed',
          status: null,
          bytes: 0,
          reason: describe(error),
        })
        reject(error)
      }
      const outgoing = http.request({
        host: '127.0.0.1',
        port: server.port,
        method,
        path,
        headers: forwardHeaders(headers, {
          localPort: server.port,
          remoteAddress,
          proto: relayed ? 'https' : 'http',
        }),
        agent: false,
      })
      const onAbort = () => {
        const error = new Error('the request was aborted')
        error.name = 'AbortError'
        outgoing.destroy(error)
        response?.destroy(error)
      }
      if (signal?.aborted) onAbort()
      signal?.addEventListener('abort', onAbort, { once: true })
      const done = () => signal?.removeEventListener('abort', onAbort)

      outgoing.on('error', (error) => {
        if (answered) return
        answered = true
        done()
        if (error.code === 'ECONNREFUSED' && !signal?.aborted) {
          // Nothing reached the local server: it stopped listening since it last served.
          if (relayed) {
            reject(
              notRunError(
                `${key}'s local server refused the connection`,
                error,
              ),
            )
          } else {
            notRunning(error).then(resolve)
          }
          return
        }
        fail(error)
      })
      outgoing.on('response', (incoming) => {
        answered = true
        response = incoming
        if (signal?.aborted) return onAbort()
        let bytes = 0
        let body = incoming
        if (noting) {
          tell('note', {
            id,
            response: {
              status: incoming.statusCode,
              headers: endToEndHeaders(incoming.headers),
            },
          })
        }
        if (recorded || noting) {
          const tap = noting ? bodyTap() : null
          body = new Transform({
            transform(chunk, encoding, callback) {
              bytes += chunk.length
              tap?.add(chunk)
              callback(null, chunk)
            },
          })
          pipeline(incoming, body, (error) => {
            done()
            if (tap) tell('note', { id, responseBody: tap.value() })
            end(
              error
                ? {
                    outcome: 'failed',
                    status: incoming.statusCode,
                    bytes,
                    reason: describe(error),
                  }
                : { outcome: 'answered', status: incoming.statusCode, bytes },
            )
          })
        } else {
          incoming.once('close', done)
        }
        resolve({
          status: incoming.statusCode,
          headers: endToEndHeaders(incoming.headers),
          body,
        })
      })

      if (body === undefined || body === null) return outgoing.end()
      if (Buffer.isBuffer(body) || typeof body === 'string') {
        return outgoing.end(body)
      }
      const stream = body instanceof Readable ? body : Readable.from(body)
      // A request body that fails ends the request with it; the error surfaces on `outgoing`.
      if (!noting) return pipeline(stream, outgoing, () => {})
      const tap = bodyTap()
      const tee = new Transform({
        transform(chunk, encoding, callback) {
          // Copied only while the recorder still keeps its first bytes (bodyTap).
          tap.add(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
          callback(null, chunk)
        },
        flush(callback) {
          tell('note', { id, requestBody: tap.value() })
          callback()
        },
      })
      return pipeline(stream, tee, outgoing, () => {})
    })
  }

  return { dispatch }
}
