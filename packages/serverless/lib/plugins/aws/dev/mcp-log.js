/**
 * Log-line descriptions for MCP server invocations in a dev session.
 *
 * Every MCP request is a POST to the same `/<server>/mcp` path, so the generic
 * `aws:apigateway:v1:post:/crm/mcp` label says nothing about which call it was.
 * The JSON-RPC envelope in the body does; these helpers read it. Pure and total:
 * every function returns `null` rather than throwing, because a log line must
 * never be what fails an invocation.
 */

// Every string that reaches a line here is remote-controlled on an open MCP
// route (method, tool name, resource URI, error message), so it is made safe
// for a terminal before it is printed: ANSI escape sequences and control
// characters go (they could forge lines or drive the terminal), and the length
// is capped (the tunnel allows ~125 KB of it).
const MAX_FIELD_LENGTH = 80
// eslint-disable-next-line no-control-regex
const ANSI_ESCAPES = /\x1b\[[0-9;?]*[ -/]*[@-~]/g
// eslint-disable-next-line no-control-regex
const CONTROL_CHARACTERS = /[\x00-\x1f\x7f-\x9f]/g

const printable = (value) => {
  if (typeof value !== 'string') return null
  const clean = value
    .replace(ANSI_ESCAPES, '')
    .replace(CONTROL_CHARACTERS, '')
    .trim()
  if (!clean) return null
  return clean.length > MAX_FIELD_LENGTH
    ? `${clean.slice(0, MAX_FIELD_LENGTH)}…`
    : clean
}

const decodeBody = (payload) => {
  if (!payload || typeof payload.body !== 'string' || payload.body === '') {
    return null
  }
  return payload.isBase64Encoded
    ? Buffer.from(payload.body, 'base64').toString('utf8')
    : payload.body
}

const parseJson = (text) => {
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

// Header names arrive in whatever case the client and API Gateway left them in.
const header = (headers, name) => {
  if (!headers || typeof headers !== 'object') return null
  const wanted = name.toLowerCase()
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === wanted && typeof value === 'string' && value) {
      return value
    }
  }
  return null
}

const describeCall = (method, target) => {
  const shownMethod = printable(method)
  if (!shownMethod) return null
  const shownTarget = printable(target)
  return shownTarget ? `${shownMethod} ${shownTarget}` : shownMethod
}

/**
 * `tools/call echo`, `resources/read file:///x`, `batch(2)`, `GET`, or `null`
 * when the event cannot be described as an MCP request at all.
 */
export const describeMcpRequest = (event) => {
  if (!event || typeof event !== 'object') return null
  const httpMethod =
    typeof event.httpMethod === 'string' ? event.httpMethod.toUpperCase() : ''
  if (httpMethod && httpMethod !== 'POST') return httpMethod

  const parsed = parseJson(decodeBody(event) ?? '')
  if (Array.isArray(parsed)) return `batch(${parsed.length})`
  if (parsed && typeof parsed.method === 'string' && parsed.method) {
    const params =
      parsed.params && typeof parsed.params === 'object' ? parsed.params : {}
    return describeCall(parsed.method, params.name ?? params.uri)
  }

  // The official SDK client also names the call in headers; they stand in for
  // a body that could not be read.
  const headerMethod = header(event.headers, 'mcp-method')
  if (headerMethod) {
    return describeCall(headerMethod, header(event.headers, 'mcp-name'))
  }
  return null
}

// The last `data:` frame of an SSE body is the response to the request; the
// frames before it are notifications.
const lastSseData = (text) => {
  let last = null
  for (const line of text.split('\n')) {
    if (line.startsWith('data:')) last = line.slice(5).trim()
  }
  return last
}

/**
 * `error -32602: Invalid params` when the response body carries a JSON-RPC
 * error - a failure the HTTP 200 around it hides - and `null` otherwise.
 */
export const describeMcpResponse = (response) => {
  const text = decodeBody(response)
  if (text === null) return null
  const parsed = parseJson(text) ?? parseJson(lastSseData(text) ?? '')
  const error = parsed?.error
  if (!error || typeof error !== 'object') return null
  const code = typeof error.code === 'number' ? error.code : '?'
  const shown = printable(error.message)
  return shown ? `error ${code}: ${shown}` : `error ${code}`
}

export const formatDuration = (ms) =>
  ms < 1000 ? `${Math.round(ms)}ms` : `${(ms / 1000).toFixed(1)}s`
