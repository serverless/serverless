import { afterEach, describe, expect, test } from '@jest/globals'
import http from 'http'
import net from 'net'
import { createHttpDispatch } from '../../../../../../../lib/plugins/aws/dev/web/http-dispatch.js'
import { startLocalProxy } from '../../../../../../../lib/plugins/aws/dev/web/local-proxy.js'

const open = []
afterEach(async () => {
  for (const close of open.splice(0).reverse()) await close()
})

const readAll = async (stream) => {
  const chunks = []
  for await (const chunk of stream) chunks.push(Buffer.from(chunk))
  return Buffer.concat(chunks)
}

const listen = async (server) => {
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  open.push(async () => {
    server.closeAllConnections?.()
    await new Promise((resolve) => server.close(resolve))
  })
  return server.address().port
}

const proxyFor = async ({
  port,
  serving = true,
  recorder,
  listenPort,
  ...extra
}) => {
  const server = { key: 'site', port, serving }
  const { dispatch } = createHttpDispatch({
    servers: new Map([['site', server]]),
    recorder,
  })
  const proxy = await startLocalProxy({
    key: 'site',
    server,
    dispatch,
    ...(listenPort !== undefined && { port: listenPort }),
    ...extra,
  })
  open.push(() => proxy.close())
  return { proxy, server }
}

const get = (port, path = '/', headers = {}, host = '127.0.0.1') =>
  new Promise((resolve, reject) => {
    const request = http.request(
      { host, port, path, headers, agent: false },
      async (response) =>
        resolve({
          status: response.statusCode,
          headers: response.headers,
          body: (await readAll(response)).toString(),
        }),
    )
    request.on('error', reject)
    request.end()
  })

const upgradeRequest = (port, host = `127.0.0.1:${port}`) =>
  `GET /ws HTTP/1.1\r\nHost: ${host}\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n\r\n`

describe('startLocalProxy', () => {
  // Linux answers on all of 127.0.0.0/8; another loopback address stands in for ::1 there.
  const linuxOnly = process.platform === 'linux' ? test : test.skip
  linuxOnly(
    'answers on every loopback address it is given, on one port',
    async () => {
      const port = await listen(
        http.createServer((req, res) => {
          res.setHeader('content-type', 'text/plain')
          res.end(`ok ${req.url}`)
        }),
      )
      const { proxy } = await proxyFor({
        port,
        addresses: ['127.0.0.1', '127.0.0.2'],
      })
      for (const address of ['127.0.0.1', '127.0.0.2']) {
        const answer = await get(
          proxy.port,
          '/a',
          { host: `localhost:${proxy.port}` },
          address,
        )
        expect(answer).toMatchObject({ status: 200, body: 'ok /a' })
      }
    },
  )

  linuxOnly(
    'a loopback address whose port another process holds makes the URL name 127.0.0.1, not localhost',
    async () => {
      const port = await listen(http.createServer((req, res) => res.end('ok')))
      // Another process on the second address, on the port the listener is given.
      const blocker = http.createServer((req, res) => res.end('someone else'))
      await new Promise((resolve) => blocker.listen(0, '127.0.0.2', resolve))
      const held = blocker.address().port
      open.push(() => new Promise((resolve) => blocker.close(resolve)))
      const debug = []
      const { proxy } = await proxyFor({
        port,
        addresses: ['127.0.0.1', '127.0.0.2'],
        logger: { debug: (text) => debug.push(text) },
        listenPort: held,
      })
      expect(proxy.url).toBe(`http://127.0.0.1:${held}`)
      expect(debug).toEqual([
        "Dev Mode's local listener for site does not answer on 127.0.0.2: EADDRINUSE",
      ])
    },
  )

  test('an address the machine does not have is left out: it answers on 127.0.0.1, and says why with --debug', async () => {
    const port = await listen(http.createServer((req, res) => res.end('ok')))
    const debug = []
    const { proxy } = await proxyFor({
      port,
      // TEST-NET-1: never an address of this machine.
      addresses: ['127.0.0.1', '192.0.2.1'],
      logger: { debug: (text) => debug.push(text) },
    })
    expect(
      await get(proxy.port, '/', { host: `localhost:${proxy.port}` }),
    ).toMatchObject({ status: 200, body: 'ok' })
    expect(debug).toEqual([
      expect.stringMatching(
        /^Dev Mode's local listener for site does not answer on 192\.0\.2\.1: E[A-Z]+$/,
      ),
    ])
  })

  test('listens on 127.0.0.1 and forwards to the local server', async () => {
    let seen
    const port = await listen(
      http.createServer((req, res) => {
        seen = req.headers
        res.setHeader('set-cookie', ['a=1', 'b=2'])
        res.setHeader('content-type', 'text/plain')
        res.end(`you asked for ${req.url}`)
      }),
    )
    const { proxy } = await proxyFor({ port })
    expect(proxy.port).toEqual(expect.any(Number))
    // localhost: dev servers accept hot reload connections from a localhost page by default.
    expect(proxy.url).toBe(`http://localhost:${proxy.port}`)
    const response = await get(proxy.port, '/x?y=1')
    expect(response.status).toBe(200)
    expect(response.body).toBe('you asked for /x?y=1')
    expect(response.headers['set-cookie']).toEqual(['a=1', 'b=2'])
    expect(seen).toMatchObject({
      host: `127.0.0.1:${port}`,
      'x-forwarded-host': `127.0.0.1:${proxy.port}`,
      'x-forwarded-proto': 'http',
      'x-forwarded-for': '127.0.0.1',
    })
  })

  test('local proxy records a request', async () => {
    const port = await listen(http.createServer((req, res) => res.end('hi')))
    const calls = []
    const recorder = {
      start: (fields) => calls.push(['start', fields]),
      end: (fields) => calls.push(['end', fields]),
    }
    const { proxy } = await proxyFor({ port, recorder })
    await get(proxy.port, '/page')
    const until = Date.now() + 5_000
    while (calls.length < 2 && Date.now() < until) {
      await new Promise((resolve) => setTimeout(resolve, 5))
    }
    expect(calls[0]).toEqual([
      'start',
      expect.objectContaining({
        key: 'site',
        method: 'GET',
        path: '/page',
        source: 'local',
        id: expect.any(String),
      }),
    ])
    expect(calls[1]).toEqual([
      'end',
      expect.objectContaining({
        id: calls[0][1].id,
        outcome: 'answered',
        status: 200,
        bytes: 2,
      }),
    ])
  })

  test('answers 503 with a short text while the server is not serving', async () => {
    const { proxy } = await proxyFor({ port: 1, serving: false })
    const response = await get(proxy.port)
    expect(response.status).toBe(503)
    expect(response.body).toBe('web app site is not running on this machine')
  })

  test('answers 502 when the local server fails before answering', async () => {
    const port = await listen(http.createServer((req) => req.socket.destroy()))
    const { proxy } = await proxyFor({ port })
    const response = await get(proxy.port)
    expect(response.status).toBe(502)
  })

  test('cuts the connection and records a failure when the local server resets mid-body', async () => {
    const port = await listen(
      http.createServer((req, res) => {
        res.writeHead(200, { 'content-length': '100' })
        res.write('12345')
        setTimeout(() => res.socket.destroy(), 50)
      }),
    )
    const calls = []
    const recorder = {
      start: (fields) => calls.push(['start', fields]),
      end: (fields) => calls.push(['end', fields]),
    }
    const { proxy } = await proxyFor({ port, recorder })
    const outcome = await new Promise((resolve) => {
      const request = http.get(
        { host: '127.0.0.1', port: proxy.port, agent: false },
        (response) => {
          let body = ''
          response.on('data', (chunk) => (body += chunk))
          response.on('error', () =>
            resolve({ status: response.statusCode, body, cut: true }),
          )
          response.on('end', () =>
            resolve({ status: response.statusCode, body, cut: false }),
          )
        },
      )
      request.on('error', () => resolve({ cut: true }))
    })
    expect(outcome).toEqual({ status: 200, body: '12345', cut: true })
    const until = Date.now() + 5_000
    while (calls.length < 2 && Date.now() < until) {
      await new Promise((resolve) => setTimeout(resolve, 5))
    }
    expect(calls[1]).toEqual([
      'end',
      expect.objectContaining({ outcome: 'failed', status: 200, bytes: 5 }),
    ])
  })

  test('answers 403 to a request for another host (DNS rebinding)', async () => {
    let reached = false
    const port = await listen(
      http.createServer((req, res) => {
        reached = true
        res.end('ok')
      }),
    )
    const { proxy } = await proxyFor({ port })
    const foreign = await get(proxy.port, '/', { host: 'evil.example.com' })
    expect(foreign.status).toBe(403)
    expect(foreign.body).toContain(`localhost:${proxy.port}`)
    expect(reached).toBe(false)
    for (const host of [
      `localhost:${proxy.port}`,
      `127.0.0.1:${proxy.port}`,
      `[::1]:${proxy.port}`,
    ]) {
      expect((await get(proxy.port, '/', { host })).status).toBe(200)
    }
  })

  test('refuses an upgrade for another host with 403', async () => {
    let reached = false
    const upstream = http.createServer()
    upstream.on('upgrade', (req, socket) => {
      reached = true
      socket.destroy()
    })
    const port = await listen(upstream)
    const { proxy } = await proxyFor({ port })
    const socket = net.connect(proxy.port, '127.0.0.1')
    open.push(async () => socket.destroy())
    socket.write(upgradeRequest(proxy.port, 'evil.example.com'))
    const text = (await readAll(socket)).toString()
    expect(text).toMatch(/^HTTP\/1\.1 403 /)
    expect(reached).toBe(false)
  })

  test('answers an upgrade with 503 when the server refuses the connection', async () => {
    const closed = http.createServer()
    const port = await new Promise((resolve) =>
      closed.listen(0, '127.0.0.1', () => resolve(closed.address().port)),
    )
    await new Promise((resolve) => closed.close(resolve))
    // It served once and stopped listening: `serving` is still true.
    const { proxy } = await proxyFor({ port })
    const socket = net.connect(proxy.port, '127.0.0.1')
    open.push(async () => socket.destroy())
    socket.write(upgradeRequest(proxy.port))
    const text = (await readAll(socket)).toString()
    expect(text).toMatch(/^HTTP\/1\.1 503 /)
    expect(text).toMatch(/web app site is not running on this machine$/)
  })

  test('local proxy passes a WebSocket upgrade through', async () => {
    let upgradeHeaders
    let upstreamSocket
    const upstream = http.createServer()
    upstream.on('upgrade', (req, socket, head) => {
      upgradeHeaders = req.headers
      upstreamSocket = socket
      socket.write(
        'HTTP/1.1 101 Switching Protocols\r\n' +
          'Upgrade: websocket\r\nConnection: Upgrade\r\n\r\n',
      )
      if (head.length) socket.write(head)
      // Echo every frame back.
      socket.pipe(socket)
    })
    const port = await listen(upstream)
    const { proxy } = await proxyFor({ port })

    const socket = net.connect(proxy.port, '127.0.0.1')
    open.push(async () => socket.destroy())
    await new Promise((resolve) => socket.once('connect', resolve))
    socket.write(
      'GET /_next/hmr HTTP/1.1\r\n' +
        `Host: 127.0.0.1:${proxy.port}\r\n` +
        'Upgrade: websocket\r\nConnection: Upgrade\r\n' +
        'Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\n' +
        'Sec-WebSocket-Version: 13\r\n\r\n',
    )
    let received = ''
    socket.on('data', (chunk) => (received += chunk.toString()))
    const waitFor = async (check) => {
      const until = Date.now() + 5_000
      while (!check()) {
        if (Date.now() > until) throw new Error(`timed out: ${received}`)
        await new Promise((resolve) => setTimeout(resolve, 5))
      }
    }
    await waitFor(() => received.includes('\r\n\r\n'))
    expect(received).toMatch(/^HTTP\/1\.1 101 /)
    socket.write('ping-frame')
    await waitFor(() => received.endsWith('ping-frame'))
    expect(upgradeHeaders).toMatchObject({
      host: `127.0.0.1:${port}`,
      upgrade: 'websocket',
      connection: 'Upgrade',
      'sec-websocket-key': 'dGhlIHNhbXBsZSBub25jZQ==',
      'x-forwarded-host': `127.0.0.1:${proxy.port}`,
    })

    // Closing the client's side closes the local server's.
    const upstreamClosed = new Promise((resolve) =>
      upstreamSocket.once('close', resolve),
    )
    socket.destroy()
    await upstreamClosed
  })

  test('closes the client socket when the local server ends an upgraded connection', async () => {
    const sockets = []
    const upstream = http.createServer()
    upstream.on('upgrade', (req, socket) => {
      sockets.push(socket)
      socket.resume()
      socket.write(
        'HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n\r\n',
      )
    })
    const port = await listen(upstream)
    const { proxy } = await proxyFor({ port })
    const socket = net.connect(proxy.port, '127.0.0.1')
    open.push(async () => socket.destroy())
    socket.write(upgradeRequest(proxy.port))
    const until = Date.now() + 5_000
    while (!sockets.length && Date.now() < until) {
      await new Promise((resolve) => setTimeout(resolve, 5))
    }
    socket.resume()
    const closed = new Promise((resolve) => socket.once('close', resolve))
    sockets[0].destroy()
    await closed
  })

  test('refuses an upgrade with 503 while the server is not serving', async () => {
    const { proxy } = await proxyFor({ port: 1, serving: false })
    const socket = net.connect(proxy.port, '127.0.0.1')
    open.push(async () => socket.destroy())
    socket.write(upgradeRequest(proxy.port))
    const text = (await readAll(socket)).toString()
    expect(text).toMatch(/^HTTP\/1\.1 503 /)
  })

  test('close() ends the listener and open upgraded connections', async () => {
    const upstream = http.createServer()
    let upstreamClosed
    const upstreamGone = new Promise((resolve) => (upstreamClosed = resolve))
    upstream.on('upgrade', (req, socket) => {
      // An HTTP server's sockets stay half open: end this side once the proxy's ended.
      socket.on('end', () => socket.end())
      socket.once('close', upstreamClosed)
      socket.resume()
      socket.write(
        'HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n\r\n',
      )
    })
    const port = await listen(upstream)
    const server = { key: 'site', port, serving: true }
    const { dispatch } = createHttpDispatch({
      servers: new Map([['site', server]]),
    })
    const proxy = await startLocalProxy({ key: 'site', server, dispatch })
    const socket = net.connect(proxy.port, '127.0.0.1')
    socket.write(upgradeRequest(proxy.port))
    await new Promise((resolve) => socket.once('data', resolve))
    socket.resume()
    const closed = new Promise((resolve) => socket.once('close', resolve))
    await proxy.close()
    await closed
    await upstreamGone
    await expect(get(proxy.port)).rejects.toMatchObject({
      code: 'ECONNREFUSED',
    })
  })
})
