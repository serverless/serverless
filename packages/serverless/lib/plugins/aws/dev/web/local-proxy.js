/**
 * The CLI's local listener for one web app: the local URL (http://localhost:<port>) the
 * developer opens in a browser. `localhost`, not 127.0.0.1: dev servers accept their hot reload
 * connections from a `localhost` page by default (Next.js refuses one from a 127.0.0.1 page unless
 * told otherwise). Each request goes to the web app's server through `dispatch` with
 * `source: 'local'`, so it is recorded as a relayed one is; a WebSocket upgrade (a dev server's
 * hot reload) is piped straight through to the server's port, so hot reload works here, which it
 * cannot on the real URL (D9). It listens on the loopback addresses only, 127.0.0.1 and, where the
 * machine has IPv6, ::1 on the same free port, so `localhost` reaches it whichever address it
 * resolves to first.
 *
 * While the web app's server is not serving, a request gets a 503 saying so (dispatch), and an
 * upgrade is refused with a 503 too, as is one the server refuses. A request or upgrade whose Host
 * is not this listener (127.0.0.1, localhost or [::1] with its port) gets a 403: Host is rewritten
 * for the local server, so the check a dev server makes against DNS rebinding is made here.
 */
import { randomUUID } from 'crypto'
import http from 'http'
import net from 'net'
import { pipeline } from 'stream'
import {
  FAILED_BODY,
  forwardHeaders,
  notRunningMessage,
} from './http-dispatch.js'

const plain = (res, status, text) => {
  const body = Buffer.from(text)
  res.writeHead(status, {
    'content-type': 'text/plain; charset=utf-8',
    'content-length': String(body.length),
  })
  res.end(body)
}

/**
 * Whether `host` names this listener: the proxy rewrites Host for the local server, which then no
 * longer sees a foreign one, so the check a dev server makes on it (DNS rebinding) is made here.
 */
const isLocalHost = (host, port) =>
  [`127.0.0.1:${port}`, `localhost:${port}`, `[::1]:${port}`].includes(
    String(host ?? '').toLowerCase(),
  )

const foreignHostMessage = (port) =>
  `This address only answers requests for 127.0.0.1:${port}, localhost:${port} or [::1]:${port}.`

/** A short plain-text HTTP/1.1 answer written on a raw socket, which is then ended. */
const rawAnswer = (socket, statusLine, text) =>
  socket.end(
    `HTTP/1.1 ${statusLine}\r\n` +
      'content-type: text/plain; charset=utf-8\r\n' +
      `content-length: ${Buffer.byteLength(text)}\r\n` +
      `connection: close\r\n\r\n${text}`,
  )

/**
 * The start of an upgrade request to the local server, its headers rewritten as for any request.
 */
const upgradeHead = (req, localPort) => {
  const headers = {
    ...forwardHeaders(req.headers, {
      localPort,
      remoteAddress: req.socket.remoteAddress,
    }),
    // A proxy drops these on every other request; an upgrade needs them on the next hop.
    connection: 'Upgrade',
    upgrade: req.headers.upgrade,
  }
  const lines = Object.entries(headers).flatMap(([name, value]) =>
    [value].flat().map((one) => `${name}: ${one}`),
  )
  return `${req.method} ${req.url} HTTP/1.1\r\n${lines.join('\r\n')}\r\n\r\n`
}

/**
 * Starts the local listener of web app `key`: `server` is its LocalWebServer (`port`, `serving`),
 * `dispatch` the one of http-dispatch.js. Resolves `{ port, url, close() }` once it listens;
 * `close()` stops it and ends every connection it has open.
 */
export const startLocalProxy = async ({
  key,
  server,
  dispatch,
  port = 0,
  logger,
  // The loopback addresses it listens on, on one port: the first is required.
  addresses = ['127.0.0.1', '::1'],
}) => {
  const upgraded = new Set()
  // The listening port, once known: the same on both addresses.
  let own = null

  const onRequest = (req, res) => {
    if (!isLocalHost(req.headers.host, own)) {
      return plain(res, 403, foreignHostMessage(own))
    }
    const abort = new AbortController()
    // The browser went away before the whole answer: stop reading the local server's.
    res.on('close', () => {
      if (!res.writableFinished) abort.abort()
    })
    Promise.resolve()
      .then(() =>
        dispatch({
          key,
          id: randomUUID(),
          method: req.method,
          path: req.url,
          headers: req.headers,
          body: req,
          source: 'local',
          signal: abort.signal,
          remoteAddress: req.socket.remoteAddress,
        }),
      )
      .then(
        (response) => {
          if (res.destroyed) return response.body?.destroy?.()
          res.writeHead(response.status, response.headers)
          pipeline(response.body, res, () => {})
        },
        (error) => {
          if (res.headersSent || res.destroyed) return res.destroy()
          if (error?.notRun) return plain(res, 503, notRunningMessage(key))
          logger?.debug?.(
            `Dev Mode answered a local request to ${key} with 502: ${error?.code ?? error?.message}`,
          )
          plain(res, 502, FAILED_BODY)
        },
      )
  }

  const onUpgrade = (req, socket, head) => {
    upgraded.add(socket)
    socket.once('close', () => upgraded.delete(socket))
    socket.on('error', () => {})
    if (!isLocalHost(req.headers.host, own)) {
      return rawAnswer(socket, '403 Forbidden', foreignHostMessage(own))
    }
    const notRunning = () =>
      rawAnswer(socket, '503 Service Unavailable', notRunningMessage(key))
    if (!server.serving || !server.port) return notRunning()
    const upstream = net.connect(server.port, '127.0.0.1')
    upgraded.add(upstream)
    let connected = false
    const closeBoth = () => {
      socket.destroy()
      upstream.destroy()
    }
    upstream.once('close', () => {
      upgraded.delete(upstream)
      // One that never connected was answered with a 503 instead (the error below).
      if (connected) closeBoth()
    })
    socket.once('close', closeBoth)
    upstream.on('error', (error) => {
      // It served and stopped listening since: say so, as while it is not serving.
      if (!connected && error.code === 'ECONNREFUSED') notRunning()
      else if (!connected) socket.destroy()
    })
    upstream.once('connect', () => {
      connected = true
      upstream.write(upgradeHead(req, server.port))
      if (head?.length) upstream.write(head)
      upstream.pipe(socket)
      socket.pipe(upstream)
    })
  }

  const create = () => {
    const listener = http.createServer(onRequest)
    listener.on('upgrade', onUpgrade)
    return listener
  }
  const listen = (listener, at, host) =>
    new Promise((resolve, reject) => {
      listener.once('error', reject)
      listener.listen(at, host, () => {
        listener.off('error', reject)
        resolve(listener.address().port)
      })
    })
  const closeOne = (listener) =>
    new Promise((resolve) => {
      if (!listener.listening) return resolve()
      listener.close(() => resolve())
      listener.closeAllConnections?.()
    })

  const [first, ...others] = addresses
  const listeners = []
  // An address the machine has whose port another process holds: `localhost` may resolve to it
  // and reach that process, so the URL names the first address instead.
  let held = false
  // A free port on the first address that is free on the others too: tried again when one of them
  // has it taken. An address the machine does not have (no IPv6 on loopback) is left out.
  for (let attempt = 0; ; attempt += 1) {
    const main = create()
    own = await listen(main, port, first)
    const extra = []
    let taken = false
    for (const address of others) {
      const listener = create()
      try {
        await listen(listener, own, address)
        extra.push(listener)
      } catch (error) {
        if (error?.code === 'EADDRINUSE' && port === 0 && attempt < 5) {
          taken = true
          break
        }
        if (error?.code === 'EADDRINUSE') held = true
        logger?.debug?.(
          `Dev Mode's local listener for ${key} does not answer on ${address}: ${error?.code ?? error?.message}`,
        )
      }
    }
    if (taken) {
      await Promise.all([main, ...extra].map(closeOne))
      continue
    }
    listeners.push(main, ...extra)
    break
  }

  return {
    port: own,
    url: held
      ? `http://${first.includes(':') ? `[${first}]` : first}:${own}`
      : `http://localhost:${own}`,
    close: async () => {
      for (const socket of upgraded) socket.destroy()
      await Promise.all(listeners.map(closeOne))
    },
  }
}
