const { test, describe, before, after } = require('node:test')
const assert = require('node:assert/strict')
const { spawn, spawnSync } = require('node:child_process')
const { once } = require('node:events')
const http = require('node:http')
const net = require('node:net')
const os = require('node:os')
const fs = require('node:fs')
const path = require('node:path')
const zlib = require('node:zlib')

const { download } = require('../download')
const { codesOf, failsWith, failsWithCode } = require('./failures')

// The downloader replaced fetch() + undici's ProxyAgent. These tests pin what
// that implementation put on the wire and how it treated responses, so the
// replacement stays indistinguishable to proxies and to the download host.

const payload = Buffer.alloc(256 * 1024)
for (let i = 0; i < payload.length; i++) payload[i] = (i * 31 + 7) & 0xff

const listen = (server) =>
  new Promise((resolve) =>
    server.listen(0, '127.0.0.1', () => resolve(server.address().port)),
  )

const close = (server) => new Promise((resolve) => server.close(resolve))

const headerNames = (req) => req.rawHeaders.filter((_, i) => i % 2 === 0)

const originHandler = (seen) => (req, res) => {
  seen.push(req)
  const { pathname } = new URL(req.url, 'http://origin')
  if (pathname === '/bin') {
    res.writeHead(200, { 'content-length': payload.length })
    return res.end(payload)
  }
  if (pathname === '/gzip') {
    const body = zlib.gzipSync(payload)
    res.writeHead(200, {
      'content-encoding': 'gzip',
      'content-length': body.length,
    })
    return res.end(body)
  }
  if (pathname === '/br-gzip') {
    const body = zlib.brotliCompressSync(zlib.gzipSync(payload))
    res.writeHead(200, {
      'content-encoding': 'gzip, br',
      'content-length': body.length,
    })
    return res.end(body)
  }
  if (pathname === '/deflate-zlib' || pathname === '/deflate-raw') {
    const body =
      pathname === '/deflate-zlib'
        ? zlib.deflateSync(payload)
        : zlib.deflateRawSync(payload)
    res.writeHead(200, {
      'content-encoding': 'deflate',
      'content-length': body.length,
    })
    return res.end(body)
  }
  if (pathname === '/six-codings') {
    let body = payload
    for (let i = 0; i < 6; i++) body = zlib.gzipSync(body)
    res.writeHead(200, {
      'content-encoding': 'gzip, gzip, gzip, gzip, gzip, gzip',
      'content-length': body.length,
    })
    return res.end(body)
  }
  if (pathname === '/reset-content') {
    res.writeHead(205, { 'content-length': 4 })
    return res.end('body')
  }
  if (pathname === '/unknown-encoding') {
    res.writeHead(200, {
      'content-encoding': 'zstd-ish',
      'content-length': payload.length,
    })
    return res.end(payload)
  }
  if (pathname === '/redirect') {
    res.writeHead(302, { location: '/bin' })
    return res.end()
  }
  if (pathname === '/redirect-loop') {
    res.writeHead(302, { location: '/redirect-loop' })
    return res.end()
  }
  if (pathname === '/truncated') {
    res.writeHead(200, { 'content-length': payload.length })
    res.write(payload.subarray(0, 1024))
    return setTimeout(() => res.socket.destroy(), 20)
  }
  if (pathname === '/stall-body') {
    res.writeHead(200, { 'content-length': payload.length })
    return res.write(payload.subarray(0, 1024))
  }
  if (pathname === '/stall-headers') return undefined
  res.writeHead(404)
  return res.end()
}

// A forward proxy that tunnels CONNECT requests and records them
const createProxy = (seen, { credentials, connectStatus } = {}) => {
  const server = http.createServer((req, res) => {
    seen.push(req)
    res.writeHead(405)
    res.end()
  })
  server.on('connect', (req, socket, head) => {
    seen.push(req)
    const expected =
      credentials && `Basic ${Buffer.from(credentials).toString('base64')}`
    if (expected && req.headers['proxy-authorization'] !== expected) {
      socket.end('HTTP/1.1 407 Proxy Authentication Required\r\n\r\n')
      return
    }
    if (connectStatus) {
      socket.end(`HTTP/1.1 ${connectStatus} Refused\r\n\r\n`)
      return
    }
    const [host, port] = req.url.split(':')
    const upstream = net.connect(Number(port), host, () => {
      socket.write('HTTP/1.1 200 Connection Established\r\n\r\n')
      upstream.write(head)
      upstream.pipe(socket)
      socket.pipe(upstream)
    })
    upstream.on('error', () => socket.destroy())
    socket.on('error', () => upstream.destroy())
  })
  return server
}

describe('download', () => {
  const originSeen = []
  const proxySeen = []
  const authProxySeen = []
  const servers = {}
  const ports = {}
  const sockets = new Set()

  before(async () => {
    servers.origin = http.createServer(originHandler(originSeen))
    servers.proxy = createProxy(proxySeen)
    servers.authProxy = createProxy(authProxySeen, {
      credentials: 'us er:p@ss:w',
    })
    servers.refusingProxy = createProxy([], { connectStatus: 403 })
    // Accepts TCP connections and never answers — for connect timeouts
    servers.blackhole = net.createServer(() => {})
    for (const [name, server] of Object.entries(servers)) {
      // Tunnelled and stalled connections outlive their requests; track
      // them so teardown can close them
      server.on('connection', (socket) => sockets.add(socket))
      ports[name] = await listen(server)
    }
  })

  after(() => {
    for (const socket of sockets) socket.destroy()
    for (const server of Object.values(servers)) server.close()
  })

  const origin = (pathname) => `http://127.0.0.1:${ports.origin}${pathname}`
  const proxyUrl = () => `http://127.0.0.1:${ports.proxy}`
  const reset = () => {
    originSeen.length = 0
    proxySeen.length = 0
    authProxySeen.length = 0
  }

  test('sends the same request headers as fetch() did', async () => {
    reset()
    const res = await download(origin('/bin'))
    assert.equal(res.ok, true)
    assert.deepEqual(res.body, payload)
    assert.equal(originSeen.length, 1)
    const [req] = originSeen
    assert.equal(req.method, 'GET')
    assert.equal(req.url, '/bin')
    assert.deepEqual(headerNames(req), [
      'host',
      'connection',
      'accept',
      'accept-language',
      'sec-fetch-mode',
      'user-agent',
      'accept-encoding',
    ])
    assert.equal(req.headers.host, `127.0.0.1:${ports.origin}`)
    assert.equal(req.headers.connection, 'keep-alive')
    assert.equal(req.headers.accept, '*/*')
    assert.equal(req.headers['accept-language'], '*')
    assert.equal(req.headers['sec-fetch-mode'], 'cors')
    // undici's own fetch() identifies itself as undici; the global fetch()
    // the downloader originally used sent `node`
    const usesUndici = Boolean(require('../package.json').dependencies?.undici)
    assert.equal(req.headers['user-agent'], usesUndici ? 'undici' : 'node')
    // fetch() offers br only over https
    assert.equal(req.headers['accept-encoding'], 'gzip, deflate')
  })

  test('tunnels through the proxy with CONNECT, even for http targets', async () => {
    reset()
    const res = await download(origin('/bin'), proxyUrl())
    assert.deepEqual(res.body, payload)
    assert.equal(proxySeen.length, 1)
    const [connect] = proxySeen
    assert.equal(connect.method, 'CONNECT')
    assert.equal(connect.url, `127.0.0.1:${ports.origin}`)
    assert.deepEqual(headerNames(connect), ['host', 'connection'])
    assert.equal(connect.headers.host, `127.0.0.1:${ports.origin}`)
    assert.equal(connect.headers.connection, 'close')
    // The request itself travels through the tunnel in origin form
    assert.equal(originSeen.length, 1)
    assert.equal(originSeen[0].url, '/bin')
  })

  test('sends percent-decoded proxy credentials as Basic auth', async () => {
    reset()
    const res = await download(
      origin('/bin'),
      `http://us%20er:p%40ss%3Aw@127.0.0.1:${ports.authProxy}`,
    )
    assert.deepEqual(res.body, payload)
    assert.equal(
      authProxySeen[0].headers['proxy-authorization'],
      `Basic ${Buffer.from('us er:p@ss:w').toString('base64')}`,
    )
    assert.deepEqual(headerNames(authProxySeen[0]), [
      'host',
      'connection',
      'proxy-authorization',
    ])
  })

  test('sends no credentials when the proxy URL has only a username', async () => {
    reset()
    await assert.rejects(
      download(origin('/bin'), `http://user@127.0.0.1:${ports.authProxy}`),
      failsWith('Proxy response (407) !== 200 when HTTP Tunneling'),
    )
    assert.equal(authProxySeen[0].headers['proxy-authorization'], undefined)
  })

  test('rejects when the proxy refuses the tunnel', async () => {
    await assert.rejects(
      download(origin('/bin'), `http://127.0.0.1:${ports.refusingProxy}`),
      failsWith('Proxy response (403) !== 200 when HTTP Tunneling'),
    )
  })

  test('surfaces connection errors from the proxy', async () => {
    const unused = net.createServer()
    const port = await listen(unused)
    await close(unused)
    await assert.rejects(
      download(origin('/bin'), `http://127.0.0.1:${port}`),
      failsWithCode('ECONNREFUSED'),
    )
  })

  test('follows redirects through the same proxy', async () => {
    reset()
    const res = await download(origin('/redirect'), proxyUrl())
    assert.deepEqual(res.body, payload)
    assert.deepEqual(
      originSeen.map((req) => req.url),
      ['/redirect', '/bin'],
    )
    assert.equal(proxySeen.length, 2)
  })

  test('gives up after 20 redirects', async () => {
    reset()
    await assert.rejects(
      download(origin('/redirect-loop')),
      failsWith('redirect count exceeded'),
    )
    assert.equal(originSeen.length, 21)
  })

  test('decodes gzip and stacked content codings', async () => {
    assert.deepEqual((await download(origin('/gzip'))).body, payload)
    assert.deepEqual((await download(origin('/br-gzip'))).body, payload)
  })

  test('decodes deflate bodies both zlib-wrapped and raw', async () => {
    assert.deepEqual((await download(origin('/deflate-zlib'))).body, payload)
    assert.deepEqual((await download(origin('/deflate-raw'))).body, payload)
  })

  test('rejects more than five content codings', async () => {
    await assert.rejects(
      download(origin('/six-codings')),
      failsWith(
        'too many content-encodings in response: 6, maximum allowed is 5',
      ),
    )
  })

  test('discards the body of a 205 response, as fetch() did', async () => {
    const res = await download(origin('/reset-content'))
    assert.equal(res.ok, true)
    assert.equal(res.body.length, 0)
  })

  test('rejects a proxy URL with a scheme other than http or https', async () => {
    reset()
    await assert.rejects(
      download(origin('/bin'), `socks5://127.0.0.1:${ports.proxy}`),
      failsWith(
        'Invalid URL protocol: the URL must start with `http:` or `https:`.',
      ),
    )
    assert.equal(proxySeen.length, 0)
  })

  test('passes a body with an unknown coding through undecoded', async () => {
    assert.deepEqual(
      (await download(origin('/unknown-encoding'))).body,
      payload,
    )
  })

  test('reports a non-2xx response without reading its body', async () => {
    const res = await download(origin('/missing'))
    assert.equal(res.ok, false)
    assert.equal(res.status, 404)
    assert.equal(res.statusText, 'Not Found')
    assert.equal(res.body, undefined)
  })

  test('rejects a body cut short by the server', async () => {
    await assert.rejects(
      download(origin('/truncated')),
      failsWith('terminated'),
    )
  })

  test('times out a server that never sends headers', async () => {
    await assert.rejects(
      download(origin('/stall-headers'), undefined, {
        connect: 5000,
        idle: 200,
      }),
      failsWith('Headers Timeout Error'),
    )
  })

  test('times out a body that stops arriving', async () => {
    await assert.rejects(
      download(origin('/stall-body'), undefined, { connect: 5000, idle: 200 }),
      failsWith('Body Timeout Error'),
    )
  })

  test('times out a connection that never completes', async () => {
    // The TCP connection succeeds but the TLS handshake never answers
    await assert.rejects(
      download(`https://127.0.0.1:${ports.blackhole}/bin`, undefined, {
        connect: 200,
        idle: 5000,
      }),
      failsWith('Connect Timeout Error'),
    )
  })

  test('rejects malformed proxy credentials before connecting', async () => {
    let connections = 0
    const counter = net.createServer((socket) => {
      connections += 1
      socket.destroy()
    })
    const port = await listen(counter)
    try {
      await assert.rejects(
        download(origin('/bin'), `http://user:abc%def@127.0.0.1:${port}`),
        { name: 'URIError' },
      )
      // A connection opened before the rejection is accepted a moment later
      await new Promise((resolve) => setTimeout(resolve, 200))
      assert.equal(connections, 0)
    } finally {
      await close(counter)
    }
  })

  // Without an explicit exit, a child ends only once every socket and timer
  // is gone — on success and on every failure path alike. spawn, not
  // spawnSync: the servers run on this process's event loop.
  test('leaves nothing open that would keep the process alive', async () => {
    const script = `
      const { download } = require(${JSON.stringify(path.join(__dirname, '..', 'download.js'))})
      const { describeError } = require(${JSON.stringify(path.join(__dirname, '..', 'binary.js'))})
      download(process.argv[1], process.argv[2] || undefined).then(
        (res) => console.log(res.ok ? 'ok ' + res.body.length : 'status ' + res.status),
        (err) => console.log('error ' + describeError(err)),
      )
    `
    const unused = net.createServer()
    const closedPort = await listen(unused)
    await close(unused)
    const cases = [
      [origin('/bin'), undefined, `ok ${payload.length}`],
      [origin('/bin'), proxyUrl(), `ok ${payload.length}`],
      [origin('/missing'), proxyUrl(), 'status 404'],
      [origin('/redirect-loop'), undefined, /^error .*redirect count exceeded/],
      [origin('/truncated'), proxyUrl(), /^error terminated/],
      [
        origin('/bin'),
        `http://127.0.0.1:${ports.refusingProxy}`,
        /^error .*Proxy response \(403\) !== 200 when HTTP Tunneling/,
      ],
      [
        origin('/bin'),
        `http://127.0.0.1:${ports.authProxy}`,
        /^error .*Proxy response \(407\) !== 200 when HTTP Tunneling/,
      ],
      [
        origin('/bin'),
        `http://user:abc%def@127.0.0.1:${ports.proxy}`,
        /^error URI malformed/,
      ],
      [
        origin('/bin'),
        `http://127.0.0.1:${closedPort}`,
        /^error .*ECONNREFUSED/,
      ],
    ]
    for (const [url, proxy, expected] of cases) {
      const child = spawn(process.execPath, ['-e', script, url, proxy || ''])
      let stdout = ''
      let stderr = ''
      child.stdout.on('data', (chunk) => (stdout += chunk))
      child.stderr.on('data', (chunk) => (stderr += chunk))
      const timer = setTimeout(() => child.kill('SIGKILL'), 15000)
      const [code, signal] = await once(child, 'close')
      clearTimeout(timer)
      const label = `${url} via ${proxy || 'no proxy'}`
      assert.equal(signal, null, `${label}: child had to be killed`)
      assert.equal(code, 0, `${label}: ${stderr}`)
      if (expected instanceof RegExp)
        assert.match(stdout.trim(), expected, label)
      else assert.equal(stdout.trim(), expected, label)
    }
  })
})

const hasOpenssl =
  spawnSync('openssl', ['version'], { encoding: 'utf8' }).status === 0

describe(
  'download over TLS',
  { skip: !hasOpenssl && 'openssl is not available' },
  () => {
    let dir

    before(() => {
      dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sf-installer-tls-'))
      const result = spawnSync(
        'openssl',
        [
          'req',
          '-x509',
          '-newkey',
          'rsa:2048',
          '-nodes',
          '-days',
          '1',
          '-subj',
          '/CN=localhost',
          '-addext',
          'subjectAltName=DNS:localhost',
          '-keyout',
          path.join(dir, 'key.pem'),
          '-out',
          path.join(dir, 'cert.pem'),
        ],
        { encoding: 'utf8' },
      )
      assert.equal(result.status, 0, result.stderr)
    })

    after(() => fs.rmSync(dir, { recursive: true, force: true }))

    // The test certificate has to be trusted from process start, so the
    // servers and the download run in a child with NODE_EXTRA_CA_CERTS set.
    const runChild = (body) => {
      const script = `
        const https = require('https'), http = require('http'), net = require('net'), fs = require('fs')
        const { download } = require(${JSON.stringify(path.join(__dirname, '..', 'download.js'))})
        const { codesOf } = require(${JSON.stringify(path.join(__dirname, 'failures.js'))})
        const tlsOptions = { key: fs.readFileSync(${JSON.stringify(path.join(dir, 'key.pem'))}), cert: fs.readFileSync(${JSON.stringify(path.join(dir, 'cert.pem'))}) }
        const seen = []
        const origin = https.createServer(tlsOptions, (req, res) => {
          seen.push({ servername: req.socket.servername, headers: req.headers })
          res.end('payload')
        })
        const tunnel = (req, socket) => {
          seen.push({ method: req.method, url: req.url })
          const [host, port] = req.url.split(':')
          const upstream = net.connect(Number(port), host, () => {
            socket.write('HTTP/1.1 200 Connection Established\\r\\n\\r\\n')
            upstream.pipe(socket)
            socket.pipe(upstream)
          })
        }
        const plainProxy = http.createServer().on('connect', tunnel)
        const tlsProxy = https.createServer(tlsOptions).on('connect', tunnel)
        const listen = (s) => new Promise((r) => s.listen(0, 'localhost', () => r(s.address().port)))
        ;(async () => {
          const ports = { origin: await listen(origin), plain: await listen(plainProxy), tls: await listen(tlsProxy) }
          // The address 'localhost' resolved to, for requests by IP
          const bound = origin.address().address
          const ip = bound.includes(':') ? '[' + bound + ']' : bound
          try {
            ${body}
          } finally {
            for (const s of [origin, plainProxy, tlsProxy]) { s.closeAllConnections?.(); s.close() }
          }
        })().catch((e) => { console.error(e); process.exitCode = 1 })
      `
      const result = spawnSync(process.execPath, ['-e', script], {
        encoding: 'utf8',
        timeout: 20000,
        env: {
          ...process.env,
          NODE_EXTRA_CA_CERTS: path.join(dir, 'cert.pem'),
        },
      })
      assert.equal(result.status, 0, result.stderr + result.stdout)
      assert.equal(result.stderr, '')
      return JSON.parse(result.stdout)
    }

    test('downloads over https directly, through a proxy, and through a TLS proxy', () => {
      const out = runChild(`
        const url = 'https://localhost:' + ports.origin + '/bin'
        const bodies = []
        for (const proxy of [undefined, 'http://' + ip + ':' + ports.plain, 'https://localhost:' + ports.tls]) {
          bodies.push((await download(url, proxy)).body.toString())
        }
        console.log(JSON.stringify({ bodies, seen }))
      `)
      assert.deepEqual(out.bodies, ['payload', 'payload', 'payload'])
      const requests = out.seen.filter((entry) => entry.headers)
      assert.equal(requests.length, 3)
      for (const req of requests) {
        assert.equal(req.servername, 'localhost')
        assert.equal(req.headers['accept-encoding'], 'br, gzip, deflate')
      }
      const tunnels = out.seen.filter((entry) => entry.method === 'CONNECT')
      assert.equal(tunnels.length, 2)
    })

    test('rejects a certificate that does not match the host', () => {
      const out = runChild(`
        const errors = []
        for (const [url, proxy] of [
          ['https://' + ip + ':' + ports.origin + '/bin', undefined],
          ['https://localhost:' + ports.origin + '/bin', 'https://' + ip + ':' + ports.tls],
        ]) {
          await download(url, proxy).then(() => errors.push(null), (e) => errors.push(codesOf(e)))
        }
        console.log(JSON.stringify(errors))
      `)
      assert.equal(out.length, 2)
      for (const codes of out) {
        assert.ok(codes.includes('ERR_TLS_CERT_ALTNAME_INVALID'), codes)
      }
    })
  },
)
