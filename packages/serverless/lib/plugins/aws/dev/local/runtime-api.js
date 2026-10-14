/**
 * The Lambda Runtime API, served on loopback for the handler processes Dev Mode runs on this
 * machine. Every process gets its own namespace, /lambda/<workerId>/2018-06-01/runtime/…, and its
 * AWS_LAMBDA_RUNTIME_API points there. Invocations are handed out one at a time per process, in
 * order, the way Lambda serves one execution environment; different processes run in parallel.
 * Streamed responses pass through unbuffered, and their error trailers are kept.
 *
 * The worker id is the only secret on this listener, so it is always 32 random bytes as hex: a
 * process that finds the port cannot read events or post results without it.
 */
import http from 'http'
import { PassThrough } from 'stream'
import { listenLoopback, readBody, sendJson } from './loopback.js'

const WORKER_ID = /^[0-9a-f]{64}$/
const ROUTE =
  /^\/lambda\/([0-9a-f]{64})\/2018-06-01\/runtime\/(?:(invocation\/next)|invocation\/([^/]+)\/(response|error)|(init\/error))$/

const ACCEPTED = { status: 'OK' }

/** The largest buffered response Lambda accepts from a runtime, in bytes (6 MB). */
export const RESPONSE_SIZE_LIMIT = 6_291_556

/** The Lambda-Runtime-* headers of a /next response, lowercased; nothing else passes. */
export const runtimeHeaders = (headers = {}) =>
  Object.fromEntries(
    Object.entries(headers ?? {})
      .filter(
        ([name, value]) =>
          name.toLowerCase().startsWith('lambda-runtime-') &&
          value !== undefined &&
          value !== null,
      )
      .map(([name, value]) => [name.toLowerCase(), String(value)]),
  )

const errorTypeOf = (req, body) => {
  const header = req.headers['lambda-runtime-function-error-type']
  if (header) return String(header)
  try {
    return JSON.parse(body.toString('utf8')).errorType ?? 'Runtime.Unknown'
  } catch {
    return 'Runtime.Unknown'
  }
}

const stoppedReply = () => {
  const body = {
    errorType: 'Runtime.Unknown',
    errorMessage: 'The local worker for this invocation has stopped',
  }
  return {
    kind: 'error',
    errorType: body.errorType,
    body: Buffer.from(JSON.stringify(body)),
  }
}

/**
 * What Lambda answers for a result over its limit, byte for byte as its callers get it: indented
 * JSON with the message first, unlike the runtime's other errors.
 */
const responseTooLarge = () => {
  const body = {
    errorMessage: `Response payload size exceeded maximum allowed payload size (${RESPONSE_SIZE_LIMIT} bytes).`,
    errorType: 'Function.ResponseSizeTooLarge',
  }
  return {
    kind: 'error',
    errorType: body.errorType,
    body: Buffer.from(JSON.stringify(body, null, 2)),
  }
}

/** What the handler process gets for a body over the limit, as from Lambda's Runtime API. */
const tooLarge = (res) =>
  sendJson(res, 413, {
    errorMessage: `Exceeded maximum allowed payload size (${RESPONSE_SIZE_LIMIT} bytes).`,
    errorType: 'RequestEntityTooLarge',
  })

const invalidRequestId = (res) =>
  sendJson(res, 400, {
    errorMessage: 'Invalid request ID',
    errorType: 'InvalidRequestID',
  })

const decode = (segment) => {
  try {
    return decodeURIComponent(segment)
  } catch {
    return null
  }
}

export const createRuntimeApi = () => {
  const channels = new Map()
  let authority = null

  const createChannel = (workerId) => {
    const queue = []
    let waiting = null
    let current = null
    let pendingInitError = null
    let closed = false

    const deliver = () => {
      if (waiting?.destroyed) waiting = null
      if (!waiting || current || queue.length === 0) return
      const item = queue.shift()
      const res = waiting
      waiting = null
      current = item
      res.writeHead(200, {
        ...item.headers,
        'Content-Type': 'application/json',
      })
      res.end(item.event)
      // The caller's hook runs inside a request handler or a dispatch; whatever it throws must
      // not crash the process, reject the dispatch or reset an accepted result's connection.
      // The invocation is already with the handler and goes on regardless.
      try {
        item.onStarted?.()
      } catch {
        // Ignored, see above.
      }
    }
    // Settling the invocation in flight frees the worker: a /next already waiting gets the next one.
    const finish = (item, reply) => {
      if (current === item) current = null
      item.settle(reply)
      deliver()
    }

    const streamReply = (req, res) => {
      const body = new PassThrough()
      const ended = new Promise((resolve) => {
        req.on('end', () =>
          resolve({
            errorType:
              req.trailers['lambda-runtime-function-error-type'] ?? null,
            errorBody:
              req.trailers['lambda-runtime-function-error-body'] ?? null,
          }),
        )
        // The handler process went away mid-stream: what arrived is all there is.
        req.on('close', () => {
          if (req.complete) return
          req.unpipe(body)
          body.end()
          resolve({
            errorType: 'Runtime.Unknown',
            errorBody: null,
            aborted: true,
          })
        })
        // An aborted request also errors; 'close' above settles it.
        req.on('error', () => {})
      })
      req.pipe(body)
      ended.then(() => {
        if (!res.headersSent && !res.destroyed) sendJson(res, 202, ACCEPTED)
      })
      return {
        kind: 'stream',
        contentType: req.headers['content-type'] ?? 'application/octet-stream',
        body,
        ended,
      }
    }

    return {
      workerId,
      get address() {
        return `${authority}/lambda/${workerId}`
      },
      get busy() {
        return Boolean(current) || queue.length > 0
      },
      /**
       * Settles the invocation dispatched with `token` with `reply`, whether it is in flight or still
       * queued, and says which it was ('current' or 'queued'), or null when it was already settled.
       * Nothing more is delivered for it: an in-flight one leaves the worker to be stopped.
       */
      abandon(token, reply) {
        if (token !== undefined && current?.token === token) {
          const item = current
          current = null
          item.settle(reply)
          return 'current'
        }
        const index = queue.findIndex((item) => item.token === token)
        if (token === undefined || index === -1) return null
        queue.splice(index, 1)[0].settle(reply)
        return 'queued'
      },
      dispatch({ headers, event, onStarted, token }) {
        return new Promise((settle) => {
          if (closed) {
            settle(stoppedReply())
            return
          }
          if (pendingInitError) {
            const reply = pendingInitError
            pendingInitError = null
            settle(reply)
            return
          }
          const normalized = runtimeHeaders(headers)
          queue.push({
            headers: normalized,
            requestId: normalized['lambda-runtime-aws-request-id'],
            invocationId: normalized['lambda-runtime-invocation-id'],
            event: Buffer.isBuffer(event) ? event : Buffer.from(event ?? ''),
            onStarted,
            token,
            settle,
            answering: false,
          })
          deliver()
        })
      },
      /** Settles every invocation in flight or queued with `reply`, or `reply(item)` per invocation. */
      fail(reply) {
        const replyFor = (item) =>
          typeof reply === 'function' ? reply(item) : reply
        const queued = queue.splice(0)
        if (current) finish(current, replyFor(current))
        for (const item of queued) item.settle(replyFor(item))
      },
      close() {
        closed = true
        channels.delete(workerId)
        if (waiting) {
          waiting.destroy()
          waiting = null
        }
        pendingInitError = null
        const left = [current, ...queue.splice(0)].filter(Boolean)
        current = null
        const reply = stoppedReply()
        for (const item of left) item.settle(reply)
      },
      handleNext(req, res) {
        if (waiting && !waiting.destroyed) {
          return sendJson(res, 400, {
            errorMessage: 'Another request for the next invocation is waiting',
            errorType: 'InvalidRequest',
          })
        }
        waiting = res
        res.on('close', () => {
          if (waiting === res) waiting = null
        })
        return deliver()
      },
      async handleResult(req, res, requestId, kind) {
        const item = current
        // One result per invocation: a second one, even while the first is still arriving, is
        // refused like a result for any request that is not in flight.
        if (!item || item.answering || item.requestId !== requestId) {
          return invalidRequestId(res)
        }
        const attempt = req.headers['lambda-runtime-invocation-id']
        if (item.invocationId && attempt && attempt !== item.invocationId) {
          return sendJson(res, 400, {
            errorMessage: 'Invalid invocation ID',
            errorType: 'InvalidInvocationId',
          })
        }
        item.answering = true
        const streaming =
          kind === 'response' &&
          String(
            req.headers['lambda-runtime-function-response-mode'] ?? '',
          ).toLowerCase() === 'streaming'
        if (streaming) return finish(item, streamReply(req, res))
        let body
        try {
          // Like Lambda, a buffered response (or error) over the limit fails the invocation; the
          // rest of it is read and dropped, so the handler process goes on to its next invocation.
          body = await readBody(req, {
            limit: RESPONSE_SIZE_LIMIT,
            onLimit: () => finish(item, responseTooLarge()),
          })
        } catch (error) {
          item.answering = false
          throw error
        }
        if (body === null) return tooLarge(res)
        finish(
          item,
          kind === 'response'
            ? {
                kind: 'response',
                contentType: req.headers['content-type'] ?? 'application/json',
                body,
              }
            : { kind: 'error', errorType: errorTypeOf(req, body), body },
        )
        return sendJson(res, 202, ACCEPTED)
      },
      async handleInitError(req, res) {
        // Bounded like a result: an init error over the limit is read and dropped.
        const body = await readBody(req, { limit: RESPONSE_SIZE_LIMIT })
        const reply =
          body === null
            ? { ...responseTooLarge(), kind: 'init_error' }
            : { kind: 'init_error', errorType: errorTypeOf(req, body), body }
        if (current) finish(current, reply)
        else if (queue.length) queue.shift().settle(reply)
        else pendingInitError = reply
        return body === null ? tooLarge(res) : sendJson(res, 202, ACCEPTED)
      },
    }
  }

  const server = http.createServer((req, res) => {
    const match = ROUTE.exec(String(req.url ?? '').split('?')[0])
    const channel = match && channels.get(match[1])
    if (!channel) {
      return sendJson(res, 404, {
        errorMessage: 'Not found',
        errorType: 'NotFound',
      })
    }
    const notAllowed = () =>
      sendJson(res, 405, {
        errorMessage: 'Method not allowed',
        errorType: 'MethodNotAllowed',
      })
    if (match[2]) {
      if (req.method !== 'GET') return notAllowed()
      return channel.handleNext(req, res)
    }
    if (req.method !== 'POST') return notAllowed()
    if (match[5]) {
      return channel.handleInitError(req, res).catch(() => res.destroy())
    }
    const requestId = decode(match[3])
    if (requestId === null) return invalidRequestId(res)
    return channel
      .handleResult(req, res, requestId, match[4])
      .catch(() => res.destroy())
  })
  // A streamed response can run as long as the function's timeout; a /next long-poll as long as
  // the environment is idle.
  server.requestTimeout = 0

  return {
    server,
    async listen() {
      const { host, port } = await listenLoopback(server)
      authority = `${host}:${port}`
      return authority
    },
    channel(workerId) {
      if (typeof workerId !== 'string' || !WORKER_ID.test(workerId)) {
        throw new TypeError('A worker id is 32 random bytes as lowercase hex')
      }
      const channel = createChannel(workerId)
      channels.set(workerId, channel)
      return channel
    },
    async close() {
      for (const channel of [...channels.values()]) channel.close()
      server.closeAllConnections?.()
      await new Promise((resolve) => server.close(() => resolve()))
    },
  }
}
