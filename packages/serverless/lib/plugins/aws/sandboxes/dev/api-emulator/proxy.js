'use strict'

import http from 'http'
import crypto from 'crypto'

const DEFAULT_PORT = 8080

function collectBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    req.on('data', (c) => chunks.push(c))
    req.on('end', () => resolve(Buffer.concat(chunks)))
    req.on('error', reject)
  })
}

export async function startInstanceProxy({
  validateToken,
  isPortAllowed = () => true,
  resolveHostPort,
  onRequest = async () => 'forward',
  // Reports the final status of each forwarded request (status, method, path) so the control-plane
  // can narrate data-plane traffic to the dev terminal — otherwise an execution that logs nothing
  // is invisible. No-op by default so embedding callers/tests stay silent.
  onResponse = () => {},
  host = '127.0.0.1',
  createServer = http.createServer,
  fetchImpl = fetch,
  requestId = () => crypto.randomUUID(),
}) {
  const handler = async (req, res) => {
    const method = req.method
    const pathStr = (req.url || '').split('?')[0]
    let reported = false
    const report = (status) => {
      if (reported) return // exactly one report per request
      reported = true
      onResponse(status, method, pathStr)
    }
    try {
      // Match real AWS bodies/statuses (see Appendix A).
      const reqId = requestId()
      const deny = (status, body) => {
        report(status)
        res.writeHead(status, {
          'x-amzn-requestid': reqId,
          'cache-control': 'private, no-store',
        })
        res.end(body)
      }

      const token = req.headers['x-aws-proxy-auth']
      if (!validateToken(token)) {
        // Real AWS returns 403 + this exact body for BOTH missing and wrong tokens.
        deny(403, 'Request missing authentication')
        return
      }

      // Absent header → default in-VM port. A present-but-malformed value is a client
      // error: reject it rather than silently forwarding to the default port.
      const portHeader = req.headers['x-aws-proxy-port']
      let inVmPort = DEFAULT_PORT
      if (portHeader !== undefined) {
        const parsed = Number(portHeader)
        if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
          deny(400, `Invalid x-aws-proxy-port: ${portHeader}`)
          return
        }
        inVmPort = parsed
      }
      if (!isPortAllowed(inVmPort)) {
        // Real AWS gates the port by the token's allowedPorts → 403, not 502.
        deny(403, 'Access to port denied')
        return
      }

      // Lifecycle gate: a suspended, non-resumable instance rejects; resume is handled inside onRequest.
      // Real AWS returns 502 (empty body) for a request to a SUSPENDED autoResume:false VM.
      const decision = await onRequest()
      if (decision === 'reject') {
        deny(502, '')
        return
      }

      const hostPort = resolveHostPort(inVmPort)
      if (!hostPort) {
        report(502)
        res.writeHead(502, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ message: `No upstream for port ${inVmPort}` }))
        return
      }

      // Rebuild headers: drop x-aws-proxy-*, drop hop-by-hop host, inject request id.
      const fwdHeaders = {}
      for (const [k, v] of Object.entries(req.headers)) {
        const lower = k.toLowerCase()
        if (lower.startsWith('x-aws-proxy-')) continue
        if (
          lower === 'host' ||
          lower === 'connection' ||
          lower === 'content-length'
        )
          continue
        fwdHeaders[k] = v
      }
      fwdHeaders['x-amzn-requestid'] = reqId

      const method = req.method
      const body =
        method === 'GET' || method === 'HEAD'
          ? undefined
          : await collectBody(req)

      let upstream
      try {
        upstream = await fetchImpl(`http://127.0.0.1:${hostPort}${req.url}`, {
          method,
          headers: fwdHeaders,
          body,
        })
      } catch {
        report(502)
        res.writeHead(502, { 'content-type': 'application/json' })
        res.end(
          JSON.stringify({ message: 'Bad Gateway: upstream unreachable' }),
        )
        return
      }

      const respHeaders = {}
      upstream.headers.forEach((v, k) => {
        if (k.toLowerCase() === 'content-length') return
        respHeaders[k] = v
      })
      respHeaders['x-amzn-requestid'] = reqId // real proxy echoes the request id on the response too
      const buf = Buffer.from(await upstream.arrayBuffer())
      report(upstream.status)
      res.writeHead(upstream.status, respHeaders)
      res.end(buf)
    } catch (err) {
      report(502)
      res.writeHead(502, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ message: `Proxy error: ${err.message}` }))
    }
  }

  const server = createServer(handler)
  await new Promise((resolve) => server.listen(0, host, resolve))
  return { server, port: server.address().port }
}
