// Runs inside the user's Lambda: no framework imports, plain Errors.
//
// The bridge between Lambda's response streaming and a web-standard `fetch`
// app. Hono ships one (`streamHandle`), and this replaces it for two reasons
// that matter to a long-lived MCP stream and to nothing else Hono targets:
//
//   1. Backpressure. Hono's bridge writes every chunk and discards what
//      `write()` returns (`hono/src/adapter/aws-lambda/handler.ts:132`), so a
//      client reading slower than the server produces has its response buffered
//      in the function's memory with nothing to stop it. Here a `false` from
//      `write()` suspends the pump until 'drain', which stops pulling from the
//      response body, which is what a well-behaved MCP handler observes as
//      backpressure.
//
//   2. Cancellation. Hono's bridge builds the `Request` with no signal and
//      never listens to the response stream (same file, lines 146-192), so a
//      client that hangs up leaves the handler running — an MCP `tools/call`
//      keeps burning wall-clock and tokens until the Lambda timeout, and every
//      write it makes goes nowhere. Here the stream's 'close'/'error' aborts
//      `request.signal` and cancels the body reader, which is the standard way
//      a `fetch` handler is told to stop.
//
// Routing stays with Hono: this bridge only calls `app.fetch`, with the same
// `{ event, requestContext, context }` environment `streamHandle` passes, so
// `c.env.event` keeps working for `./compose.mjs`.

// Only characters a header value may carry verbatim; anything else is
// percent-encoded rather than thrown on, matching Hono's own handling of the
// non-ASCII header values API Gateway is willing to deliver.
const headerSafe = (value) => {
  for (let index = 0; index < value.length; index += 1) {
    if (value.charCodeAt(index) > 127) return encodeURIComponent(value)
  }
  return value
}

const isV2 = (event) => typeof event?.requestContext?.http?.method === 'string'

const queryString = (event) => {
  if (isV2(event)) return event.rawQueryString ?? ''
  // API Gateway hands over decoded values, so rebuilding the query means
  // re-encoding them. Either map is present, never both.
  if (event?.multiValueQueryStringParameters) {
    return Object.entries(event.multiValueQueryStringParameters)
      .filter(([, values]) => values)
      .map(([key, values]) =>
        values
          .map(
            (value) =>
              `${encodeURIComponent(key)}=${encodeURIComponent(value)}`,
          )
          .join('&'),
      )
      .join('&')
  }
  return Object.entries(event?.queryStringParameters ?? {})
    .filter(([, value]) => value)
    .map(
      ([key, value]) =>
        `${encodeURIComponent(key)}=${encodeURIComponent(value ?? '')}`,
    )
    .join('&')
}

const requestHeaders = (event) => {
  const headers = new Headers()
  if (Array.isArray(event?.cookies)) {
    headers.set('Cookie', event.cookies.join('; '))
  }
  // A multi-value entry is the authoritative one when API Gateway sends both:
  // the single-value map keeps only the last value of each name.
  for (const [name, values] of Object.entries(event?.multiValueHeaders ?? {})) {
    if (!values) continue
    for (const value of values) headers.append(name, headerSafe(value))
  }
  for (const [name, value] of Object.entries(event?.headers ?? {})) {
    if (value && !headers.has(name)) headers.set(name, headerSafe(value))
  }
  return headers
}

const domainName = (event) =>
  event?.requestContext?.domainName ??
  Object.entries(event?.headers ?? {}).find(
    ([name]) => name.toLowerCase() === 'host',
  )?.[1]

/**
 * The `Request` for one Lambda event.
 *
 * Deliberately built the way Hono's adapter builds it — `https` plus the API
 * Gateway domain and the event's own path, the query string reassembled from
 * the event, the body decoded and its length stated — because `./compose.mjs`
 * reads this URL to work out the client-facing one, and every rule it applies
 * was written against that shape. What Hono's has and this does not is a
 * signal.
 */
export const lambdaRequest = ({ event, signal }) => {
  const path = isV2(event) ? event.rawPath : (event?.path ?? '/')
  const search = queryString(event)
  const url = `https://${domainName(event)}${path}${search ? `?${search}` : ''}`
  const headers = requestHeaders(event)
  const init = {
    method: isV2(event)
      ? event.requestContext.http.method
      : (event?.httpMethod ?? 'GET'),
    headers,
    signal,
  }
  if (event?.body) {
    const body = Buffer.from(
      event.body,
      event.isBase64Encoded ? 'base64' : 'utf8',
    )
    init.body = body
    headers.set('content-length', String(body.length))
  }
  return new Request(url, init)
}

/**
 * Resolves once the stream can take more, or once the request is aborted.
 *
 * Racing the abort matters: a client that vanishes mid-response never drains
 * the socket, so waiting on 'drain' alone would hold the invocation open until
 * the Lambda timeout — the very failure this module exists to prevent.
 */
const drained = (stream, signal) =>
  new Promise((resolve) => {
    // An already-aborted signal never fires 'abort', so checking it up front is
    // what keeps a disconnect that landed between the write and this call from
    // parking the pump on a 'drain' no one will emit.
    if (signal.aborted) {
      resolve()
      return
    }
    const settle = () => {
      stream.off('drain', settle)
      signal.removeEventListener('abort', settle)
      resolve()
    }
    stream.once('drain', settle)
    signal.addEventListener('abort', settle, { once: true })
  })

/**
 * Copy a response body into the stream, one chunk at a time, no faster than
 * the client takes them.
 */
const pump = async ({ body, stream, signal }) => {
  const reader = body.getReader()
  try {
    for (;;) {
      if (signal.aborted) break
      const { done, value } = await reader.read()
      if (done) break
      if (signal.aborted) break
      if (stream.write(value) === false) await drained(stream, signal)
    }
  } finally {
    // Releasing the lock is not enough: the body may be a live generator, and
    // only `cancel` tells it to stop producing.
    await reader.cancel().catch(() => {})
  }
}

const preludeMetadata = (response) => {
  const headers = {}
  const cookies = []
  response.headers.forEach((value, name) => {
    if (name === 'set-cookie') cookies.push(value)
    else headers[name] = value
  })
  return { statusCode: response.status, headers, cookies }
}

const runtime = () => {
  // `awslambda` is injected by the Lambda runtime only when the function is
  // configured for response streaming, so its absence is a deployment fault
  // worth naming rather than a `ReferenceError` at cold start.
  const api = globalThis.awslambda
  if (!api?.streamifyResponse || !api?.HttpResponseStream) {
    throw new Error(
      'The MCP entry needs the Lambda response-streaming runtime, and the "awslambda" global is not present. This function must be deployed with an invoke mode of RESPONSE_STREAM.',
    )
  }
  return api
}

/**
 * The `(event, responseStream, context)` function the streaming runtime calls.
 *
 * Exported separately from `streamHandler` so the bridge can be exercised
 * without `streamifyResponse` in the way.
 */
export const respondWithStream = (app) => async (event, rawStream, context) => {
  const { HttpResponseStream } = runtime()
  const controller = new AbortController()
  let completed = false
  const disconnected = () => {
    if (!completed) controller.abort()
  }
  // Registered before the app runs, because the client can hang up during a
  // long `tools/call` that has not produced a byte yet. `HttpResponseStream.
  // from` hands back the same stream object it was given, so this pair covers
  // the wrapped stream too and is not registered again below.
  rawStream.on('close', disconnected)
  rawStream.on('error', disconnected)

  let stream = rawStream
  let preludeCommitted = false
  try {
    const response = await app.fetch(
      lambdaRequest({ event, signal: controller.signal }),
      { event, requestContext: event?.requestContext, context },
    )
    // Strictly before the first write: the prelude carries the status and
    // headers, and `from()` is what arms the hook that emits it ahead of the
    // first chunk. Anything written to the raw stream before this becomes part
    // of the prelude's own framing and corrupts the response.
    stream = HttpResponseStream.from(rawStream, preludeMetadata(response))
    preludeCommitted = true

    if (response.body) {
      await pump({ body: response.body, stream, signal: controller.signal })
    } else {
      // The prelude is emitted from inside the first `write()` and nowhere else
      // — `from()` only installs the hook, and `end()` does not flush it — so a
      // response with no body needs one write of nothing to put its status and
      // headers on the wire. Without it the client is answered with zero bytes,
      // which for MCP's mandatory `notifications/initialized` (202, no body)
      // means the client never opens the standalone SSE stream that carries
      // elicitation. Hono's own bridge writes the same empty string.
      if (!stream.destroyed) stream.write('')
    }
    completed = true
  } catch (error) {
    console.error('Error processing request:', error)
    completed = true
    // Only when no metadata has been committed yet: once `from()` has taken the
    // response's status and headers, that is what the client will be told and
    // all that is left is to stop writing. (Hono's bridge writes its error text
    // with no prelude at all, which reaches the client as a 200 with an error
    // body.)
    if (!preludeCommitted) {
      stream = HttpResponseStream.from(rawStream, {
        statusCode: 500,
        headers: { 'content-type': 'text/plain' },
        cookies: [],
      })
      if (!stream.destroyed) stream.write('Internal Server Error')
    }
  } finally {
    if (!stream.destroyed) stream.end()
  }
}

/**
 * The Lambda handler for a Hono app, with backpressure and client-disconnect
 * cancellation — Hono's own `streamHandle` with neither.
 */
export const streamHandler = (app) =>
  runtime().streamifyResponse(respondWithStream(app))
