// A forward proxy for the end-to-end tests: tunnels CONNECT requests and
// appends one line per request to a log file, so a test can assert which
// hosts were reached through it. Optionally requires Basic credentials.
//
// Usage: node proxy.js <log-file> [port] [user:password]
// Listens on 127.0.0.1; set HOST to listen elsewhere (the proxy-only network
// run sets 0.0.0.0). Prints "proxy listening on <url>" once ready.

const fs = require('node:fs')
const http = require('node:http')
const net = require('node:net')

const [logFile, portArg, credentials] = process.argv.slice(2)
if (!logFile) {
  console.error('usage: node proxy.js <log-file> [port] [user:password]')
  process.exit(2)
}
const expected =
  credentials && `Basic ${Buffer.from(credentials).toString('base64')}`
const log = (line) => fs.appendFileSync(logFile, `${line}\n`)

// Plain-http requests in absolute form, forwarded like a real proxy does
// (some package managers send their registry traffic this way)
const server = http.createServer((req, res) => {
  if (expected && req.headers['proxy-authorization'] !== expected) {
    log(`DENIED ${req.method} ${req.url}`)
    res.writeHead(407, { 'proxy-authenticate': 'Basic realm="e2e"' })
    return res.end()
  }
  log(`${req.method} ${req.url}`)
  let target
  try {
    target = new URL(req.url)
  } catch {
    res.writeHead(400)
    return res.end()
  }
  const headers = { ...req.headers }
  delete headers['proxy-authorization']
  delete headers['proxy-connection']
  const upstream = http.request(
    {
      host: target.hostname,
      port: target.port || 80,
      method: req.method,
      path: `${target.pathname}${target.search}`,
      headers,
    },
    (response) => {
      res.writeHead(response.statusCode, response.headers)
      response.pipe(res)
    },
  )
  upstream.on('error', () => res.destroy())
  req.pipe(upstream)
})

server.on('connect', (req, socket, head) => {
  socket.on('error', () => {})
  if (expected && req.headers['proxy-authorization'] !== expected) {
    log(`DENIED CONNECT ${req.url}`)
    socket.end(
      'HTTP/1.1 407 Proxy Authentication Required\r\n' +
        'Proxy-Authenticate: Basic realm="e2e"\r\nContent-Length: 0\r\n\r\n',
    )
    return
  }
  log(`CONNECT ${req.url}`)
  const i = req.url.lastIndexOf(':')
  const host = req.url.slice(0, i).replace(/^\[(.*)\]$/, '$1')
  const upstream = net.connect(Number(req.url.slice(i + 1)), host, () => {
    socket.write('HTTP/1.1 200 Connection Established\r\n\r\n')
    if (head.length) upstream.write(head)
    upstream.pipe(socket)
    socket.pipe(upstream)
  })
  upstream.on('error', () => socket.destroy())
  socket.on('close', () => upstream.destroy())
})

server.listen(Number(portArg) || 0, process.env.HOST || '127.0.0.1', () => {
  console.log(`proxy listening on http://127.0.0.1:${server.address().port}`)
})
