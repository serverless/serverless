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
  host = '127.0.0.1',
  createServer = http.createServer,
  fetchImpl = fetch,
  requestId = () => crypto.randomUUID(),
}) {
  const handler = async (req, res) => {
    try {
      // Match real AWS bodies/statuses (see Appendix A).
      const reqId = requestId()
      const deny = (status, body) => {
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

      const inVmPort = Number(req.headers['x-aws-proxy-port']) || DEFAULT_PORT
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
      res.writeHead(upstream.status, respHeaders)
      res.end(buf)
    } catch (err) {
      res.writeHead(502, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ message: `Proxy error: ${err.message}` }))
    }
  }

  const server = createServer(handler)
  await new Promise((resolve) => server.listen(0, host, resolve))
  return { server, port: server.address().port }
}
