const { test, describe, before, after } = require('node:test')
const assert = require('node:assert/strict')
const { spawn, spawnSync } = require('node:child_process')
const { once } = require('node:events')
const http = require('node:http')
const https = require('node:https')
const net = require('node:net')
const os = require('node:os')
const fs = require('node:fs')
const path = require('node:path')
const zlib = require('node:zlib')

const { download } = require('../download')
const { failsWith, failsWithCode } = require('./failures')

const usesUndici = Boolean(require('../package.json').dependencies?.undici)
// Options for a test undici gets wrong: `todo` while undici is in use,
// enforced otherwise
const undiciGap = (reason) => (usesUndici ? { todo: reason } : {})
// For gaps where undici opens connections in a tight loop until the machine
// runs out of local ports, which breaks every later test (and anything else
// running on the machine): skipped while undici is in use
const undiciPortExhaustion = (reason) => (usesUndici ? { skip: reason } : {})

// Edge cases for the downloader: proxies and servers that deviate from the
// common path, redirect variants, and malformed responses.
//
// Some tests pin behaviour the undici-based downloader gets wrong. While
// download.js uses undici they are marked `todo` (run, but not fail the
// suite) or, where undici's failure would harm the machine, skipped. A
// Node.js-core downloader that handles all of them is kept for when undici 6
// reaches its end of life; without the undici dependency these tests are
// enforced again automatically. Those where undici waits forever run in a
// child process with a hard time limit, so they cannot stall the suite.

const payload = Buffer.alloc(256 * 1024)
for (let i = 0; i < payload.length; i++) payload[i] = (i * 31 + 7) & 0xff

const listen = (server, host = '127.0.0.1') =>
  new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, host, () => resolve(server.address().port))
  })

// Forwards bytes between a client socket and `authority` (host:port),
// starting with `head`: client bytes that arrived with the CONNECT request
const tunnel = (socket, authority, head) => {
  const i = authority.lastIndexOf(':')
  const host = authority.slice(0, i).replace(/^\[(.*)\]$/, '$1')
  const upstream = net.connect(Number(authority.slice(i + 1)), host, () => {
    if (head?.length) upstream.write(head)
    upstream.pipe(socket)
    socket.pipe(upstream)
    socket.resume()
  })
  upstream.on('error', () => socket.destroy())
  socket.on('error', () => upstream.destroy())
}

// A proxy speaking raw bytes, so its CONNECT reply can deviate from the
// common `HTTP/1.1 200 Connection Established`.
// `reply(socket, authority, rest)` answers the request once its head has
// arrived; `rest` holds any client bytes that followed the head.
const createRawProxy = (seen, reply) =>
  net.createServer((socket) => {
    let received = Buffer.alloc(0)
    socket.on('error', () => {})
    const onData = (chunk) => {
      received = Buffer.concat([received, chunk])
      const end = received.indexOf('\r\n\r\n')
      if (end === -1) return
      socket.removeListener('data', onData)
      // Hold further client bytes (e.g. the TLS ClientHello) until the
      // tunnel is up
      socket.pause()
      const head = received.subarray(0, end).toString('latin1')
      seen.push(head.split('\r\n')[0])
      reply(socket, head.split(' ')[1], received.subarray(end + 4))
    }
    socket.on('data', onData)
  })

// An origin speaking raw bytes, for responses Node's http server won't send
const rawResponses = {
  '/continue':
    'HTTP/1.1 100 Continue\r\n\r\nHTTP/1.1 200 OK\r\nContent-Length: 5\r\n\r\nhello',
  '/http10': null, // close-delimited body, written below
  '/length-invalid': 'HTTP/1.1 200 OK\r\nContent-Length: abc\r\n\r\nhello',
  '/garbage': 'THIS IS NOT HTTP\r\n\r\n',
}
const createRawOrigin = () =>
  net.createServer((socket) => {
    let head = ''
    socket.on('error', () => {})
    socket.on('data', (chunk) => {
      head += chunk.toString('latin1')
      if (!head.includes('\r\n\r\n')) return
      const route = head.split(' ')[1]
      head = ''
      if (route === '/close') return socket.destroy()
      if (route === '/http10') {
        socket.write('HTTP/1.0 200 OK\r\n\r\n')
        return socket.end(payload)
      }
      socket.end(
        rawResponses[route] ||
          'HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\n\r\n',
      )
    })
  })

const createProxy = (seen) => {
  const server = http.createServer((req, res) => {
    res.writeHead(405)
    res.end()
  })
  server.on('connect', (req, socket, head) => {
    seen.push(req.url)
    socket.write('HTTP/1.1 200 Connection Established\r\n\r\n')
    tunnel(socket, req.url, head)
  })
  return server
}

const large = Buffer.alloc(16 * 1024 * 1024)
for (let i = 0; i < large.length; i += payload.length) payload.copy(large, i)

const originHandler = (seen) => (req, res) => {
  seen.push(req.url)
  const { pathname } = new URL(req.url, 'http://origin')
  const send = (status, body = '', headers = {}) => {
    res.writeHead(status, {
      'content-length': Buffer.byteLength(body),
      ...headers,
    })
    res.end(body)
  }
  const redirect = pathname.match(/^\/redirect\/(\d{3})$/)
  if (redirect) return send(Number(redirect[1]), '', { location: '/bin' })
  const chain = pathname.match(/^\/chain\/(\d+)$/)
  if (chain) {
    const left = Number(chain[1])
    return send(302, '', { location: left ? `/chain/${left - 1}` : '/bin' })
  }
  switch (pathname) {
    case '/bin':
      return send(200, payload)
    case '/large':
      return send(200, large)
    case '/nested/relative':
      return send(302, '', { location: '../bin' })
    case '/protocol-relative':
      return send(302, '', { location: `//${req.headers.host}/bin` })
    case '/absolute':
      return send(302, '', { location: `http://${req.headers.host}/bin` })
    case '/no-location':
      return send(302)
    case '/to-ftp':
      return send(302, '', { location: 'ftp://example.com/bin' })
    case '/gzip-then-reset': {
      const body = zlib.gzipSync(payload)
      const socket = req.socket
      res.writeHead(200, {
        'content-encoding': 'gzip',
        'content-length': body.length,
      })
      // Reset the connection as soon as the last byte is out
      return res.end(body, () => socket.resetAndDestroy())
    }
    case '/no-content':
      return send(204)
    case '/huge-headers':
      return send(200, 'ok', { 'x-big': 'a'.repeat(100 * 1024) })
    case '/chunked-trailers':
      res.writeHead(200, { 'transfer-encoding': 'chunked', trailer: 'x-sum' })
      res.write(payload.subarray(0, 1000))
      res.write(payload.subarray(1000))
      res.addTrailers({ 'x-sum': 'abc' })
      return res.end()
    case '/trickle': {
      res.writeHead(200, { 'content-length': 16 * 1024 })
      let sent = 0
      const timer = setInterval(() => {
        res.write(payload.subarray(sent * 1024, (sent + 1) * 1024))
        if (++sent === 16) {
          clearInterval(timer)
          res.end()
        }
      }, 10)
      return undefined
    }
    default:
      return send(404)
  }
}

// Runs download(url, proxy, timeouts) in a child process, killed after
// `limit` ms, and returns the line it printed. spawn, not spawnSync: the
// servers run on this process's event loop.
const downloadInChild = async (url, proxy, { timeouts, limit = 5000 } = {}) => {
  const script = `
    const { download } = require(${JSON.stringify(path.join(__dirname, '..', 'download.js'))})
    const { describeError } = require(${JSON.stringify(path.join(__dirname, '..', 'binary.js'))})
    const timeouts = process.argv[3] ? JSON.parse(process.argv[3]) : undefined
    download(process.argv[1], process.argv[2] || undefined, timeouts).then(
      (res) => console.log(res.ok ? 'ok ' + res.body.toString() : 'status ' + res.status),
      (err) => console.log('error ' + describeError(err)),
    )
  `
  const args = [url, proxy || '', timeouts ? JSON.stringify(timeouts) : '']
  const child = spawn(process.execPath, ['-e', script, ...args])
  let stdout = ''
  child.stdout.on('data', (chunk) => (stdout += chunk))
  const timer = setTimeout(() => child.kill('SIGKILL'), limit)
  const [, signal] = await once(child, 'close')
  clearTimeout(timer)
  return { line: stdout.trim(), killed: signal === 'SIGKILL' }
}

describe('download edge cases', () => {
  const originSeen = []
  const proxySeen = []
  const rawSeen = {}
  const servers = {}
  const ports = {}
  const sockets = new Set()
  let ipv6 = false

  const rawProxy = (name, reply) => {
    rawSeen[name] = []
    servers[name] = createRawProxy(rawSeen[name], reply)
  }

  before(async () => {
    servers.origin = http.createServer(originHandler(originSeen))
    servers.rawOrigin = createRawOrigin()
    servers.proxy = createProxy(proxySeen)
    rawProxy('http10', (socket, authority, rest) => {
      socket.write('HTTP/1.0 200 Connection established\r\n\r\n')
      tunnel(socket, authority, rest)
    })
    rawProxy('withHeaders', (socket, authority, rest) => {
      socket.write(
        'HTTP/1.1 200 OK\r\nProxy-Agent: test/1.0\r\nContent-Length: 0\r\n\r\n',
      )
      tunnel(socket, authority, rest)
    })
    rawProxy('denyWithBody', (socket) => {
      socket.end(
        'HTTP/1.1 407 Proxy Authentication Required\r\nContent-Type: text/html\r\n' +
          'Content-Length: 20\r\n\r\n<html>denied</html>\n',
      )
    })
    rawProxy('closeSilently', (socket) => socket.destroy())
    rawProxy('neverReplies', () => {})
    // Answers the tunnel request and, in the same write, the request that
    // will travel through it — so the tunnel starts with bytes already read
    rawProxy('earlyBytes', (socket) => {
      socket.resume()
      socket.write(
        'HTTP/1.1 200 Connection Established\r\n\r\n' +
          'HTTP/1.1 200 OK\r\nContent-Length: 5\r\n\r\nhello',
      )
    })
    for (const [name, server] of Object.entries(servers)) {
      server.on('connection', (socket) => sockets.add(socket))
      ports[name] = await listen(server)
    }
    // Not every environment has an IPv6 loopback
    try {
      servers.origin6 = http.createServer(originHandler(originSeen))
      ports.origin6 = await listen(servers.origin6, '::1')
      servers.proxy6 = createProxy(proxySeen)
      ports.proxy6 = await listen(servers.proxy6, '::1')
      for (const name of ['origin6', 'proxy6']) {
        servers[name].on('connection', (socket) => sockets.add(socket))
      }
      ipv6 = true
    } catch {
      for (const name of ['origin6', 'proxy6']) {
        servers[name]?.close()
        delete servers[name]
      }
    }
  })

  after(() => {
    for (const socket of sockets) socket.destroy()
    for (const server of Object.values(servers)) server.close()
  })

  const origin = (pathname) => `http://127.0.0.1:${ports.origin}${pathname}`
  const rawOrigin = (pathname) =>
    `http://127.0.0.1:${ports.rawOrigin}${pathname}`
  const proxyUrl = (name = 'proxy') => `http://127.0.0.1:${ports[name]}`
  const reset = () => {
    originSeen.length = 0
    proxySeen.length = 0
    for (const seen of Object.values(rawSeen)) seen.length = 0
  }

  describe('proxies', () => {
    test('accepts an HTTP/1.0 tunnel reply', async () => {
      const res = await download(origin('/bin'), proxyUrl('http10'))
      assert.deepEqual(res.body, payload)
      assert.equal(rawSeen.http10.length, 1)
    })

    test('accepts a tunnel reply with a reason phrase and headers', async () => {
      const res = await download(origin('/bin'), proxyUrl('withHeaders'))
      assert.deepEqual(res.body, payload)
    })

    test('rejects a 407 that carries a body', async () => {
      await assert.rejects(
        download(origin('/bin'), proxyUrl('denyWithBody')),
        failsWith('Proxy response (407) !== 200 when HTTP Tunneling'),
      )
    })

    test(
      'fails fast when the proxy closes without replying',
      {
        // undici 6 retries the tunnel request endlessly (about 100,000
        // CONNECTs in 15 s), so the download never ends. Fixed in undici 8,
        // which needs Node.js 22.19; undici stays on 6 for Node.js 18.
        ...undiciPortExhaustion(
          'undici 6 retries the tunnel endlessly (fixed in undici 8)',
        ),
      },
      async () => {
        reset()
        const { line, killed } = await downloadInChild(
          origin('/bin'),
          proxyUrl('closeSilently'),
        )
        assert.equal(killed, false, 'still downloading after 5 s')
        assert.match(line, /^error /)
        assert.equal(rawSeen.closeSilently.length, 1)
      },
    )

    test('times out a proxy that never answers the tunnel request', async () => {
      // Runs in a child: if the timeout ever stopped reaching the tunnel
      // request, the download would wait for the 300 s default instead
      const { line, killed } = await downloadInChild(
        origin('/bin'),
        proxyUrl('neverReplies'),
        { timeouts: { connect: 5000, idle: 200 } },
      )
      assert.equal(killed, false, 'still waiting after 5 s')
      assert.match(line, /^error .*Headers Timeout Error/)
    })

    test(
      'keeps response bytes that arrive with the tunnel reply',
      {
        // undici 6 retries until it runs out of local ports; undici 8 waits
        // indefinitely.
        ...undiciPortExhaustion(
          'undici cannot use bytes that arrive with the tunnel reply (6.x and 8.x)',
        ),
      },
      async () => {
        const { line, killed } = await downloadInChild(
          origin('/bin'),
          proxyUrl('earlyBytes'),
        )
        assert.equal(killed, false, 'still downloading after 5 s')
        assert.equal(line, 'ok hello')
      },
    )

    test(
      'ignores the path of a proxy URL',
      {
        // undici 6 and 8 reject such a URL as "invalid url"; npm itself
        // accepts it and ignores the path.
        ...undiciGap('undici rejects a proxy URL with a path (6.x and 8.x)'),
      },
      async () => {
        reset()
        for (const suffix of ['/', '/some/path?x=1']) {
          const res = await download(origin('/bin'), `${proxyUrl()}${suffix}`)
          assert.deepEqual(res.body, payload)
        }
        assert.equal(proxySeen.length, 2)
      },
    )

    test('reaches an IPv6 proxy and origin', async (t) => {
      if (!ipv6) return t.skip('no IPv6 loopback')
      reset()
      const target = `http://[::1]:${ports.origin6}/bin`
      assert.deepEqual((await download(target)).body, payload)
      const res = await download(target, `http://[::1]:${ports.proxy6}`)
      assert.deepEqual(res.body, payload)
      assert.deepEqual(proxySeen, [`[::1]:${ports.origin6}`])
    })
  })

  describe('redirects', () => {
    for (const status of [301, 302, 303, 307, 308]) {
      test(`follows a ${status}`, async () => {
        const res = await download(origin(`/redirect/${status}`))
        assert.deepEqual(res.body, payload)
      })
    }

    test('resolves relative, protocol-relative and absolute locations', async () => {
      for (const route of [
        '/nested/relative',
        '/protocol-relative',
        '/absolute',
      ]) {
        reset()
        const res = await download(origin(route))
        assert.deepEqual(res.body, payload, route)
        assert.deepEqual(originSeen, [route, '/bin'], route)
      }
    })

    test('follows exactly 20 redirects', async () => {
      reset()
      const res = await download(origin('/chain/19'))
      assert.deepEqual(res.body, payload)
      assert.equal(originSeen.length, 21)
    })

    test('treats a redirect without a location as the final response', async () => {
      const res = await download(origin('/no-location'))
      assert.equal(res.ok, false)
      assert.equal(res.status, 302)
    })

    test('refuses to follow a redirect to a non-HTTP scheme', async () => {
      await assert.rejects(
        download(origin('/to-ftp')),
        failsWith('URL scheme must be a HTTP(S) scheme'),
      )
    })

    test('keeps the proxy for every redirect hop', async () => {
      reset()
      await download(origin('/redirect/307'), proxyUrl())
      assert.equal(proxySeen.length, 2)
    })
  })

  describe('responses', () => {
    test(
      'accepts a 100 Continue before the final response',
      {
        // undici 6 and 8 fail such a response with "bad response".
        ...undiciGap(
          'undici rejects an informational 1xx response (6.x and 8.x)',
        ),
      },
      async () => {
        const res = await download(rawOrigin('/continue'))
        assert.equal(res.ok, true)
        assert.equal(res.body.toString(), 'hello')
      },
    )

    test('reads an HTTP/1.0 close-delimited body', async () => {
      assert.deepEqual((await download(rawOrigin('/http10'))).body, payload)
    })

    test('reads a chunked body with trailers', async () => {
      assert.deepEqual(
        (await download(origin('/chunked-trailers'))).body,
        payload,
      )
    })

    test('reads a slowly trickled body', async () => {
      const res = await download(origin('/trickle'))
      assert.deepEqual(res.body, payload.subarray(0, 16 * 1024))
    })

    test('returns an empty body for a 204', async () => {
      const res = await download(origin('/no-content'))
      assert.equal(res.ok, true)
      assert.equal(res.body.length, 0)
    })

    test('downloads a large body through a proxy intact', async () => {
      const res = await download(origin('/large'), proxyUrl())
      assert.equal(res.body.length, large.length)
      assert.ok(res.body.equals(large))
    })

    test('survives a connection reset right after a compressed body', async (t) => {
      // Node's http client leaves the socket without an 'error' listener
      // once a keep-alive response ends; a reset while the decoder finishes
      // must not become an uncaught exception. Runs in a child so that one
      // would show as a crash. spawn, not spawnSync: the servers run on this
      // process's event loop.
      if (typeof net.Socket.prototype.resetAndDestroy !== 'function') {
        return t.skip('socket.resetAndDestroy is unavailable')
      }
      const script = `
        const { download } = require(${JSON.stringify(path.join(__dirname, '..', 'download.js'))})
        process.on('uncaughtException', (err) => {
          console.log('uncaught ' + err.code)
          process.exit(99)
        })
        download(process.argv[1]).then(
          (res) => console.log('ok ' + res.body.length),
          (err) => console.log('error ' + err.message),
        )
      `
      for (let i = 0; i < 3; i++) {
        const child = spawn(process.execPath, [
          '-e',
          script,
          origin('/gzip-then-reset'),
        ])
        let stdout = ''
        child.stdout.on('data', (chunk) => (stdout += chunk))
        const [code] = await once(child, 'close')
        if (process.platform === 'win32') {
          // Windows may discard received data when the reset arrives, so the
          // download can legitimately fail here — but it must never crash
          assert.equal(code, 0)
          assert.match(stdout.trim(), /^(ok \d+|error .+)$/)
        } else {
          assert.equal(stdout.trim(), `ok ${payload.length}`)
          assert.equal(code, 0)
        }
      }
    })

    test('rejects oversized response headers', async () => {
      await assert.rejects(
        download(origin('/huge-headers')),
        failsWithCode('HPE_HEADER_OVERFLOW', 'UND_ERR_HEADERS_OVERFLOW'),
      )
    })

    test('rejects an invalid Content-Length', async () => {
      await assert.rejects(
        download(rawOrigin('/length-invalid')),
        failsWithCode('HPE_INVALID_CONTENT_LENGTH'),
      )
    })

    test('rejects a response that is not HTTP', async () => {
      await assert.rejects(
        download(rawOrigin('/garbage')),
        failsWithCode('HPE_INVALID_CONSTANT'),
      )
    })

    test('rejects a connection closed before any response', async () => {
      await assert.rejects(
        download(rawOrigin('/close')),
        failsWithCode('ECONNRESET', 'UND_ERR_SOCKET'),
      )
    })
  })
})

const hasOpenssl =
  spawnSync('openssl', ['version'], { encoding: 'utf8' }).status === 0

describe(
  'download through a misconfigured TLS proxy',
  { skip: !hasOpenssl && 'openssl is not available' },
  () => {
    let dir
    let server
    const sockets = new Set()

    before(async () => {
      dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sf-installer-edge-'))
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
          '-keyout',
          path.join(dir, 'key.pem'),
          '-out',
          path.join(dir, 'cert.pem'),
        ],
        { encoding: 'utf8' },
      )
      assert.equal(result.status, 0, result.stderr)
      server = https.createServer({
        key: fs.readFileSync(path.join(dir, 'key.pem')),
        cert: fs.readFileSync(path.join(dir, 'cert.pem')),
      })
      server.on('connection', (socket) => sockets.add(socket))
      await listen(server)
    })

    after(() => {
      for (const socket of sockets) socket.destroy()
      server.close()
      fs.rmSync(dir, { recursive: true, force: true })
    })

    test(
      'fails fast when an http:// proxy URL points at a TLS proxy',
      {
        // undici 6 hangs here on several Node.js versions (18, 20, 22.15,
        // 24, 26). Fixed in undici 8, which needs Node.js 22.19; undici
        // stays on 6 for Node.js 18.
        ...undiciGap(
          'undici 6 hangs on a TLS proxy behind an http:// URL (fixed in undici 8)',
        ),
      },
      async () => {
        const { line, killed } = await downloadInChild(
          'http://127.0.0.1:1/bin',
          `http://127.0.0.1:${server.address().port}`,
        )
        assert.equal(killed, false, 'still downloading after 5 s')
        // The TLS server either drops the plaintext request or answers it
        // with a TLS record, depending on the Node.js version
        assert.match(
          line,
          /^error .*(ECONNRESET|HPE_INVALID_CONSTANT|other side closed)/,
        )
      },
    )
  },
)
