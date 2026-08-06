// Runs inside the user's Lambda: no framework imports, plain Errors.
//
// API Gateway will deliver a GET or HEAD that carries a body, and Hono's Lambda
// adapter passes `event.body` straight into `new Request` whenever it is present
// (`hono/dist/adapter/aws-lambda/handler.js`, `EventProcessor#createRequest`).
// undici refuses that combination outright — "Request with GET/HEAD method
// cannot have body" — and since the MCP route is registered as ANY, the throw
// would fail the invocation instead of reaching the app. So the body is dropped
// before the adapter sees the event, together with any client-stated length,
// which would otherwise describe a body that is not there.

// Matches the method each of Hono's event processors reads: `requestContext.
// http.method` for payload v2, `httpMethod` for REST and ALB, `method` for
// VPC Lattice.
const methodOf = (event) =>
  event?.requestContext?.http?.method ?? event?.httpMethod ?? event?.method

const withoutContentLength = (headers) =>
  Object.fromEntries(
    Object.entries(headers).filter(
      ([name]) => name.toLowerCase() !== 'content-length',
    ),
  )

/** The same event with no body, when the method cannot carry one. */
export const withoutBodyOnBodylessMethod = (event) => {
  if (!event?.body) return event
  const method = String(methodOf(event) ?? '').toUpperCase()
  if (method !== 'GET' && method !== 'HEAD') return event
  // A copy: the caller's event is also what the adapter hands the app as
  // `c.env.event`, and nothing else about it changes here.
  const sanitized = { ...event, body: null, isBase64Encoded: false }
  if (sanitized.headers) {
    sanitized.headers = withoutContentLength(sanitized.headers)
  }
  if (sanitized.multiValueHeaders) {
    sanitized.multiValueHeaders = withoutContentLength(
      sanitized.multiValueHeaders,
    )
  }
  return sanitized
}
