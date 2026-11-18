/**
 * HTTP helpers of the web bridge: the headers a proxy passes on, and the one client every outgoing
 * request of the bridge goes through (the fallback endpoint, S3 presigned URLs). The client hands
 * back the body exactly as it was sent, compressed or not, so a response is passed on byte for
 * byte.
 */
import http from 'node:http'
import https from 'node:https'

/** Headers that describe one connection, not the message: a proxy never passes them on. */
const HOP_BY_HOP = new Set([
  'connection',
  'keep-alive',
  'proxy-connection',
  'transfer-encoding',
  'te',
  'trailer',
  'upgrade',
  'proxy-authenticate',
  'proxy-authorization',
])

/**
 * `headers` (names in any case) without the hop-by-hop headers and the ones the Connection header
 * names, names lower-cased; a value stays a string or a list of strings.
 */
export const endToEndHeaders = (headers = {}) => {
  const named = new Set(
    Object.entries(headers)
      .filter(([name]) => name.toLowerCase() === 'connection')
      .flatMap(([, value]) => [value].flat())
      .flatMap((value) => String(value).split(','))
      .map((token) => token.trim().toLowerCase())
      .filter(Boolean),
  )
  const out = {}
  for (const [rawName, value] of Object.entries(headers)) {
    const name = rawName.toLowerCase()
    if (HOP_BY_HOP.has(name) || named.has(name) || value === undefined) continue
    out[name] = Array.isArray(value) ? value.map(String) : String(value)
  }
  return out
}

/** Every chunk of a readable stream, as one Buffer. */
export const readAll = async (stream) => {
  const chunks = []
  for await (const chunk of stream) chunks.push(Buffer.from(chunk))
  return Buffer.concat(chunks)
}

/**
 * One HTTP(S) request: resolves `{ status, headers, body }` once the response headers arrived,
 * `body` an async iterable of Buffers; rejects when it fails or `timeoutMs` passes without an
 * answer. Nothing is decompressed.
 */
export const sendHttp = ({ method, url, headers = {}, body, timeoutMs }) =>
  new Promise((resolve, reject) => {
    const target = new URL(url)
    const client = target.protocol === 'http:' ? http : https
    const request = client.request(
      target,
      { method, headers, ...(timeoutMs && { timeout: timeoutMs }) },
      (response) =>
        resolve({
          status: response.statusCode,
          headers: response.headers,
          body: response,
        }),
    )
    request.on('timeout', () =>
      request.destroy(new Error(`no answer within ${timeoutMs} ms`)),
    )
    request.on('error', (error) =>
      // The message of a failed request never carries its URL from here.
      reject(new Error(error.code ?? error.message)),
    )
    request.end(body)
  })
