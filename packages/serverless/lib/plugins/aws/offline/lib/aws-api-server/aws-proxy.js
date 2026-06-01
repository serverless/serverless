import { SignatureV4 } from '@smithy/signature-v4'
import { Sha256 } from '@aws-crypto/sha256-js'

/**
 * Reverse proxy that forwards requests for AWS services the offline emulator
 * does not handle to real AWS, re-signed with the developer's deploy
 * credentials. Enabled only when `proxyToAws: 'unsupported'`.
 */

/**
 * Per-service endpoint overrides for services that do not follow the standard
 * `https://<service>.<region>.amazonaws.com` regional pattern. Empty for now;
 * exotic/global services fall through to the null path and surface a clear
 * error rather than a wrong guess.
 *
 * @type {Record<string, (region: string) => string>}
 */
const ENDPOINT_OVERRIDES = {}

/**
 * Build the real AWS endpoint for a service+region, or null when it cannot be
 * constructed confidently.
 *
 * @param {string} service - SigV4 signing service name (e.g. 'dynamodb').
 * @param {string} region  - AWS region (e.g. 'us-east-1').
 * @returns {string | null}
 */
export function buildAwsEndpoint(service, region) {
  if (!service || !region) {
    return null
  }
  if (ENDPOINT_OVERRIDES[service]) {
    return ENDPOINT_OVERRIDES[service](region)
  }
  return `https://${service}.${region}.amazonaws.com`
}

/**
 * Default outbound transport: send the signed request with global fetch and
 * normalise the response to `{ statusCode, headers, body }`.
 */
async function defaultForward({ url, method, headers, body }) {
  const res = await fetch(url, {
    method,
    headers,
    body: body?.length ? body : undefined,
  })
  const text = await res.text()
  const headerObj = {}
  res.headers.forEach((v, k) => {
    headerObj[k] = v
  })
  return { statusCode: res.status, headers: headerObj, body: text }
}

/**
 * Build an error Hapi response in the offline error shape.
 */
function proxyError(h, code, message, statusCode) {
  return h.response({ error: { code, message } }).code(statusCode)
}

/**
 * Create the proxy function. Real credentials are re-applied here (server-side)
 * so the handler keeps placeholder creds and the single local endpoint.
 *
 * @param {{
 *   credentials: { accessKeyId: string, secretAccessKey: string, sessionToken?: string } | null,
 *   forward?: (req: { url: string, method: string, headers: Record<string,string>, body: Buffer }) => Promise<{ statusCode: number, headers: Record<string,string>, body: string }>,
 * }} deps
 * @returns {(request: object, target: { service: string, region: string }, h: object) => Promise<object>}
 */
export function createAwsProxy({ credentials, forward = defaultForward }) {
  return async function proxy(request, target, h) {
    if (!credentials) {
      return proxyError(
        h,
        'OFFLINE_PROXY_NO_CREDENTIALS',
        'proxyToAws is enabled but no AWS credentials could be resolved.',
        501,
      )
    }
    const endpoint = buildAwsEndpoint(target.service, target.region)
    if (!endpoint) {
      return proxyError(
        h,
        'OFFLINE_PROXY_UNSUPPORTED_ENDPOINT',
        `Cannot construct a real AWS endpoint for service "${target.service}" in region "${target.region}".`,
        501,
      )
    }

    const { hostname } = new URL(endpoint)
    const body = Buffer.isBuffer(request.payload)
      ? request.payload
      : Buffer.from(request.payload ?? '')

    const headers = {}
    for (const [k, v] of Object.entries(request.headers || {})) {
      const lower = k.toLowerCase()
      if (
        lower === 'authorization' ||
        lower === 'x-amz-date' ||
        lower === 'host'
      )
        continue
      headers[k] = Array.isArray(v) ? v.join(', ') : String(v)
    }
    headers.host = hostname

    const signer = new SignatureV4({
      service: target.service,
      region: target.region,
      credentials: {
        accessKeyId: credentials.accessKeyId,
        secretAccessKey: credentials.secretAccessKey,
        sessionToken: credentials.sessionToken,
      },
      sha256: Sha256,
    })

    const signed = await signer.sign({
      method: String(request.method || 'POST').toUpperCase(),
      protocol: 'https:',
      hostname,
      path: request.path || '/',
      query: request.query || {},
      headers,
      body,
    })

    const params = new URLSearchParams()
    for (const [key, value] of Object.entries(request.query || {})) {
      if (Array.isArray(value)) {
        for (const item of value) params.append(key, item)
      } else if (value !== undefined && value !== null) {
        params.append(key, value)
      }
    }
    const qs = params.toString()
    const url = `${endpoint}${request.path || '/'}${qs ? `?${qs}` : ''}`

    let upstream
    try {
      upstream = await forward({
        url,
        method: signed.method,
        headers: signed.headers,
        body,
      })
    } catch (err) {
      return proxyError(h, 'OFFLINE_PROXY_UPSTREAM_ERROR', err.message, 502)
    }

    const response = h.response(upstream.body ?? '').code(upstream.statusCode)
    for (const [k, v] of Object.entries(upstream.headers || {})) {
      if (k.toLowerCase() === 'content-type') response.type(String(v))
      else response.header(k, String(v))
    }
    return response
  }
}
