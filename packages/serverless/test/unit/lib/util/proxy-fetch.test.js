// fetchWithProxy sends the Framework's own requests to the Serverless API (subscription and
// instance lookups, reconciliation, telemetry) through the proxy the environment sets. Node.js 26
// rejects a proxy dispatcher from another undici major in its global fetch(), so the proxied cases
// here fail on Node.js 26 when the request goes through the global fetch().
import http from 'http'
import net from 'net'
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  test,
} from '@jest/globals'
import { fetchWithProxy } from '@serverless/util/src/proxy/index.js'

const PROXY_VARS = [
  'proxy',
  'HTTP_PROXY',
  'http_proxy',
  'HTTPS_PROXY',
  'https_proxy',
  'NO_PROXY',
  'no_proxy',
]

const listen = (server) =>
  new Promise((resolve) =>
    server.listen(0, '127.0.0.1', () =>
      resolve(`http://127.0.0.1:${server.address().port}`),
    ),
  )

const close = (server) =>
  new Promise((resolve) => {
    server.closeAllConnections?.()
    server.close(() => resolve())
  })

describe('fetchWithProxy', () => {
  const savedEnv = {}
  // The `host:port` targets of the CONNECT tunnels the proxy opened, and the local ports of its
  // connections to the target, by which the target tells a request that came through the proxy.
  let tunnels = []
  const proxySockets = new Set()
  let target
  let targetUrl
  let proxy
  let proxyUrl

  beforeAll(async () => {
    for (const name of PROXY_VARS) {
      savedEnv[name] = process.env[name]
      delete process.env[name]
    }

    target = http.createServer((req, res) => {
      let body = ''
      req.on('data', (chunk) => (body += chunk))
      req.on('end', () => {
        res.setHeader('content-type', 'application/json')
        res.end(
          JSON.stringify({
            method: req.method,
            path: req.url,
            header: req.headers['x-test'],
            body,
            viaProxy: proxySockets.has(req.socket.remotePort),
          }),
        )
      })
    })
    targetUrl = await listen(target)

    // A CONNECT-only proxy, as undici's ProxyAgent tunnels every request.
    proxy = http.createServer((req, res) => {
      res.writeHead(405)
      res.end()
    })
    proxy.on('connect', (req, socket, head) => {
      tunnels.push(req.url)
      const [host, port] = req.url.split(':')
      const upstream = net.connect(Number(port), host, () => {
        proxySockets.add(upstream.localPort)
        socket.write('HTTP/1.1 200 Connection Established\r\n\r\n')
        upstream.write(head)
        upstream.pipe(socket)
        socket.pipe(upstream)
      })
      upstream.on('error', () => socket.destroy())
      socket.on('error', () => upstream.destroy())
    })
    proxyUrl = await listen(proxy)
  })

  afterEach(() => {
    tunnels = []
    for (const name of PROXY_VARS) delete process.env[name]
  })

  afterAll(async () => {
    for (const name of PROXY_VARS) {
      if (savedEnv[name] === undefined) delete process.env[name]
      else process.env[name] = savedEnv[name]
    }
    await Promise.all([close(proxy), close(target)])
  })

  test('sends the request through the proxy the environment sets', async () => {
    process.env.HTTPS_PROXY = proxyUrl
    const res = await fetchWithProxy(`${targetUrl}/api/events?x=1`, {
      method: 'POST',
      headers: { 'x-test': 'header-value' },
      body: JSON.stringify({ events: [] }),
    })
    expect(res.ok).toBe(true)
    expect(await res.json()).toEqual({
      method: 'POST',
      path: '/api/events?x=1',
      header: 'header-value',
      body: '{"events":[]}',
      viaProxy: true,
    })
    expect(tunnels).toEqual([new URL(targetUrl).host])
  })

  test('goes straight to the host when no proxy is set', async () => {
    const res = await fetchWithProxy(`${targetUrl}/direct`)
    expect(await res.json()).toMatchObject({ path: '/direct', viaProxy: false })
  })

  test('goes straight to a host NO_PROXY covers', async () => {
    process.env.HTTPS_PROXY = proxyUrl
    process.env.NO_PROXY = '127.0.0.1'
    const res = await fetchWithProxy(`${targetUrl}/bypassed`)
    expect(await res.json()).toMatchObject({
      path: '/bypassed',
      viaProxy: false,
    })
  })

  test('takes a URL object as well as a string', async () => {
    process.env.HTTPS_PROXY = proxyUrl
    const res = await fetchWithProxy(new URL(`${targetUrl}/url-object`))
    expect(await res.json()).toMatchObject({
      path: '/url-object',
      viaProxy: true,
    })
  })
})
