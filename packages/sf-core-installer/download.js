const { Agent, Pool, ProxyAgent, fetch } = require('undici')

// Downloads a URL into memory, optionally through an HTTP(S) proxy.
//
// fetch() comes from the same undici package as ProxyAgent on purpose. The
// global fetch() runs on the undici that Node.js bundles, and a ProxyAgent
// from a different undici major is not compatible with it: Node.js 26
// (bundled undici 8) rejects a ProxyAgent from undici 6.
//
// undici stays on 6.x because it is the last line that supports Node.js 18
// (7.x needs Node.js 20.18.1, 8.x needs 22.19). 6.x reaches its end of life
// on 2027-04-30.
//
// `timeouts` ({ connect, idle } in ms) is for tests only; without it undici's
// defaults apply (10 s to connect, 300 s for headers and body).
const download = async (url, proxyUrl, timeouts) => {
  const limits = timeouts
    ? {
        connect: { timeout: timeouts.connect },
        headersTimeout: timeouts.idle,
        bodyTimeout: timeouts.idle,
      }
    : {}
  let dispatcher
  if (proxyUrl) {
    dispatcher = new ProxyAgent({
      ...limits,
      uri: proxyUrl,
      // The limits above apply to requests through the tunnel; the CONNECT
      // request to the proxy is sent by a separate client
      ...(timeouts && {
        clientFactory: (origin, options) =>
          new Pool(origin, { ...options, ...limits }),
      }),
    })
  } else if (timeouts) {
    dispatcher = new Agent(limits)
  }

  const res = await fetch(url, dispatcher ? { dispatcher } : {})
  if (!res.ok) {
    return { ok: false, status: res.status, statusText: res.statusText }
  }
  return {
    ok: true,
    status: res.status,
    statusText: res.statusText,
    body: Buffer.from(await res.arrayBuffer()),
  }
}

module.exports = { download }
