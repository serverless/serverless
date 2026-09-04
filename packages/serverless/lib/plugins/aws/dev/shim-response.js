/**
 * Shapes the local machine's buffered envelope into what the streamified shim
 * writes through `HttpResponseStream.from`. Separate from shim.js because the
 * shim connects to AWS IoT at import time — this stays importable in tests.
 * Runs inside the user's Lambda: no framework imports.
 */

// v1 (REST) events make hono's buffered adapter answer with multiValueHeaders;
// the streaming prelude takes single values, so arrays flatten last-value-wins.
// This is lossy where a buffered proxy integration is not: every other value is
// dropped, which matters most for multiple `set-cookie` headers. No MCP route
// sets cookies, so nothing on this path loses a header today.
const flattenHeaders = (result) => {
  const headers = {}
  for (const [name, value] of Object.entries(result.headers ?? {})) {
    headers[name] = String(value)
  }
  for (const [name, values] of Object.entries(result.multiValueHeaders ?? {})) {
    if (Array.isArray(values) && values.length > 0) {
      headers[name] = String(values[values.length - 1])
    }
  }
  return headers
}

export const toStreamedResponse = (result) => {
  // `waitForNoResponse` resolves with a plain string when the dev session is
  // gone; behind a streaming route that must still become a valid response,
  // and 503 says "backend temporarily unavailable" — which is exactly true.
  if (typeof result === 'string') {
    return {
      metadata: { statusCode: 503, headers: { 'content-type': 'text/plain' } },
      body: Buffer.from(result, 'utf8'),
    }
  }
  const envelope = result ?? {}
  return {
    metadata: {
      statusCode: envelope.statusCode ?? 200,
      headers: flattenHeaders(envelope),
    },
    body: envelope.isBase64Encoded
      ? Buffer.from(envelope.body ?? '', 'base64')
      : Buffer.from(String(envelope.body ?? ''), 'utf8'),
  }
}
