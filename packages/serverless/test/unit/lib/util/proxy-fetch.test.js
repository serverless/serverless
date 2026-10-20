// fetchWithProxy sends the Framework's own requests to the Serverless API (subscription and
// instance lookups, reconciliation, telemetry) through the proxy the environment sets. Node.js 26
// rejects a proxy dispatcher from another undici major in its global fetch(), so the proxied cases
// here fail on Node.js 26 when the request goes through the global fetch(). It chooses the proxy
// and the proxy's CA as the AWS SDK clients do.
import fs from 'fs'
import http from 'http'
import net from 'net'
import os from 'os'
import path from 'path'
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  test,
} from '@jest/globals'
import {
  fetchWithProxy,
  proxyDispatcherOptions,
} from '@serverless/util/src/proxy/index.js'

const PROXY_VARS = [
  'proxy',
  'HTTP_PROXY',
  'http_proxy',
  'HTTPS_PROXY',
  'https_proxy',
  'NO_PROXY',
  'no_proxy',
  'ca',
  'HTTPS_CA',
  'https_ca',
  'cafile',
  'HTTPS_CAFILE',
  'https_cafile',
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
  // The `host:port` targets of the CONNECT tunnels each proxy opened, and the local ports of the
  // proxies' connections to the target, by which the target tells a request that came through one.
  let tunnels = []
  let otherTunnels = []
  const proxySockets = new Set()
  let target
  let targetUrl
  let proxy
  let proxyUrl
  // A second proxy, for the cases where the environment names more than one.
  let otherProxy
  let otherProxyUrl

  // A CONNECT-only proxy, as undici's ProxyAgent tunnels every request.
  const connectProxy = (record) => {
    const server = http.createServer((req, res) => {
      res.writeHead(405)
      res.end()
    })
    server.on('connect', (req, socket, head) => {
      record(req.url)
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
    return server
  }

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

    proxy = connectProxy((host) => tunnels.push(host))
    proxyUrl = await listen(proxy)
    otherProxy = connectProxy((host) => otherTunnels.push(host))
    otherProxyUrl = await listen(otherProxy)
  })

  afterEach(() => {
    tunnels = []
    otherTunnels = []
    for (const name of PROXY_VARS) delete process.env[name]
  })

  afterAll(async () => {
    for (const name of PROXY_VARS) {
      if (savedEnv[name] === undefined) delete process.env[name]
      else process.env[name] = savedEnv[name]
    }
    await Promise.all([close(proxy), close(otherProxy), close(target)])
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

  // The Serverless API is reached over HTTPS: there is no certificate here to serve HTTPS, so the
  // case checks which proxy was asked for the tunnel, and the TLS handshake through it then fails.
  test('an HTTPS URL goes through HTTPS_PROXY when HTTP_PROXY and a generic proxy are set too', async () => {
    process.env.HTTP_PROXY = otherProxyUrl
    process.env.proxy = otherProxyUrl
    process.env.HTTPS_PROXY = proxyUrl
    const httpsUrl = targetUrl.replace(/^http:/, 'https:')
    await expect(fetchWithProxy(`${httpsUrl}/https`)).rejects.toThrow()
    expect(tunnels).toEqual([new URL(targetUrl).host])
    expect(otherTunnels).toEqual([])
  })

  test('an HTTP URL goes through HTTP_PROXY when HTTPS_PROXY is set too', async () => {
    process.env.HTTP_PROXY = otherProxyUrl
    process.env.HTTPS_PROXY = proxyUrl
    const res = await fetchWithProxy(`${targetUrl}/http`)
    expect(await res.json()).toMatchObject({ path: '/http', viaProxy: true })
    expect(otherTunnels).toEqual([new URL(targetUrl).host])
    expect(tunnels).toEqual([])
  })
})

describe('proxyDispatcherOptions', () => {
  const HTTPS_URL = 'https://core.serverless.com/api/events'
  const HTTP_URL = 'http://core.serverless.com/api/events'

  test('no proxy variable: no options', () => {
    expect(proxyDispatcherOptions(HTTPS_URL, {})).toBeUndefined()
  })

  test("chooses the proxy for the URL's scheme, else the other one, else a generic proxy", () => {
    const uri = (url, env) => proxyDispatcherOptions(url, env).uri
    const both = {
      http_proxy: 'http://h:1',
      HTTPS_PROXY: 'http://s:2',
      proxy: 'http://g:3',
    }
    expect(uri(HTTPS_URL, both)).toBe('http://s:2')
    expect(uri(HTTP_URL, both)).toBe('http://h:1')
    expect(uri(HTTPS_URL, { HTTP_PROXY: 'http://h:1' })).toBe('http://h:1')
    expect(uri(HTTP_URL, { https_proxy: 'http://s:2' })).toBe('http://s:2')
    expect(uri(HTTPS_URL, { proxy: 'http://g:3' })).toBe('http://g:3')
    expect(uri(HTTPS_URL, { HTTPS_PROXY: ' ', HTTP_PROXY: 'http://h:1' })).toBe(
      'http://h:1',
    )
  })

  test('the proxy CA goes to the connection to the proxy', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'proxy-fetch-ca-'))
    const file = path.join(dir, 'ca.pem')
    fs.writeFileSync(file, 'FILE-CA')
    try {
      expect(
        proxyDispatcherOptions(HTTPS_URL, {
          HTTPS_PROXY: 'https://s:2',
          HTTPS_CA: 'INLINE-CA',
          cafile: file,
        }),
      ).toEqual({
        uri: 'https://s:2',
        proxyTls: { ca: ['INLINE-CA', 'FILE-CA'] },
      })
      expect(
        proxyDispatcherOptions(HTTPS_URL, { HTTPS_PROXY: 'https://s:2' }),
      ).toEqual({ uri: 'https://s:2' })
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })

  test('NO_PROXY in the given environment covers the host', () => {
    expect(
      proxyDispatcherOptions(HTTPS_URL, {
        HTTPS_PROXY: 'http://s:2',
        no_proxy: '.serverless.com',
      }),
    ).toBeUndefined()
  })
})
