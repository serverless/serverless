// proxy.test.js
import { startInstanceProxy } from '../../../../../../../../lib/plugins/aws/sandboxes/dev/api-emulator/proxy.js'

async function get(port, headers = {}) {
  const res = await fetch(`http://127.0.0.1:${port}/echo`, { headers })
  return { status: res.status, body: await res.text() }
}

test('rejects missing/invalid token with 403', async () => {
  const { server, port } = await startInstanceProxy({
    validateToken: (t) => t === 'good',
    resolveHostPort: () => 9999,
    fetchImpl: async () => {
      throw new Error('should not forward')
    },
  })
  try {
    const missing = await get(port)
    expect(missing.status).toBe(403)
    expect(missing.body).toBe('Request missing authentication') // real AWS body
    // wrong token is treated identically to missing (per Appendix A)
    expect((await get(port, { 'X-aws-proxy-auth': 'bad' })).status).toBe(403)
  } finally {
    server.close()
  }
})

test('forwards with token: strips x-aws-proxy-*, injects x-amzn-requestid', async () => {
  let seen
  const { server, port } = await startInstanceProxy({
    validateToken: () => true,
    resolveHostPort: (p) => (p === 8080 ? 12345 : undefined),
    requestId: () => 'req-123',
    fetchImpl: async (url, init) => {
      seen = { url, headers: init.headers }
      return new Response('upstream-ok', { status: 200 })
    },
  })
  try {
    const res = await fetch(`http://127.0.0.1:${port}/path`, {
      headers: {
        'X-aws-proxy-auth': 'good',
        'X-aws-proxy-port': '8080',
        'X-custom': 'keep',
      },
    })
    expect(res.status).toBe(200)
    expect(await res.text()).toBe('upstream-ok')
    expect(seen.url).toBe('http://127.0.0.1:12345/path')
    // x-aws-proxy-* stripped, x-amzn-requestid injected, other headers kept
    const fwd = Object.fromEntries(
      Object.entries(seen.headers).map(([k, v]) => [k.toLowerCase(), v]),
    )
    expect(Object.keys(fwd).some((k) => k.startsWith('x-aws-proxy-'))).toBe(
      false,
    )
    expect(fwd['x-amzn-requestid']).toBe('req-123')
    expect(fwd['x-custom']).toBe('keep')
  } finally {
    server.close()
  }
})

test('403 "Access to port denied" when the port is not allowed by the token', async () => {
  const { server, port } = await startInstanceProxy({
    validateToken: () => true,
    isPortAllowed: (p) => p === 8080, // token only allowed 8080
    resolveHostPort: () => 12345,
    fetchImpl: async () => {
      throw new Error('should not forward')
    },
  })
  try {
    const res = await fetch(`http://127.0.0.1:${port}/x`, {
      headers: { 'X-aws-proxy-auth': 'good', 'X-aws-proxy-port': '9999' },
    })
    expect(res.status).toBe(403)
    expect(await res.text()).toBe('Access to port denied')
  } finally {
    server.close()
  }
})

test('502 when the port is allowed but there is no live upstream', async () => {
  const { server, port } = await startInstanceProxy({
    validateToken: () => true,
    isPortAllowed: () => true,
    resolveHostPort: () => undefined, // allowed, but no container mapping
    fetchImpl: async () => new Response('', { status: 200 }),
  })
  try {
    const res = await fetch(`http://127.0.0.1:${port}/x`, {
      headers: { 'X-aws-proxy-auth': 'good', 'X-aws-proxy-port': '8080' },
    })
    expect(res.status).toBe(502)
  } finally {
    server.close()
  }
})

test('502 when the upstream fetch throws (container down)', async () => {
  const { server, port } = await startInstanceProxy({
    validateToken: () => true,
    resolveHostPort: () => 12345,
    fetchImpl: async () => {
      throw new Error('ECONNREFUSED')
    },
  })
  try {
    const res = await fetch(`http://127.0.0.1:${port}/x`, {
      headers: { 'X-aws-proxy-auth': 'good' },
    })
    expect(res.status).toBe(502)
  } finally {
    server.close()
  }
})

test('502 when onRequest rejects (suspended, non-resumable — real AWS behavior)', async () => {
  const { server, port } = await startInstanceProxy({
    validateToken: () => true,
    resolveHostPort: () => 12345,
    onRequest: async () => 'reject',
    fetchImpl: async () => {
      throw new Error('should not forward')
    },
  })
  try {
    const res = await fetch(`http://127.0.0.1:${port}/x`, {
      headers: { 'X-aws-proxy-auth': 'good' },
    })
    expect(res.status).toBe(502)
  } finally {
    server.close()
  }
})

test('rejects a malformed x-aws-proxy-port with 400 instead of forwarding to the default port', async () => {
  const { server, port } = await startInstanceProxy({
    validateToken: () => true,
    isPortAllowed: () => true,
    resolveHostPort: () => 12345,
    fetchImpl: async () => {
      throw new Error('should not forward')
    },
  })
  try {
    for (const bad of ['banana', '0', '-1', '1.5', '70000']) {
      const res = await fetch(`http://127.0.0.1:${port}/x`, {
        headers: { 'X-aws-proxy-auth': 'good', 'X-aws-proxy-port': bad },
      })
      expect(res.status).toBe(400)
    }
  } finally {
    server.close()
  }
})

test('falls back to the default in-VM port only when the header is absent', async () => {
  let seenPort
  const { server, port } = await startInstanceProxy({
    validateToken: () => true,
    isPortAllowed: () => true,
    resolveHostPort: (p) => {
      seenPort = p
      return 12345
    },
    fetchImpl: async () => new Response('ok'),
  })
  try {
    await fetch(`http://127.0.0.1:${port}/x`, {
      headers: { 'X-aws-proxy-auth': 'good' }, // no x-aws-proxy-port header
    })
    expect(seenPort).toBe(8080)
  } finally {
    server.close()
  }
})

test('onResponse reports the final status, method, and path (forward + deny)', async () => {
  const seen = []
  const { server, port } = await startInstanceProxy({
    validateToken: (t) => t === 'good',
    resolveHostPort: () => 12345,
    onResponse: (status, method, path) => seen.push([status, method, path]),
    fetchImpl: async () => new Response('ok', { status: 201 }),
  })
  try {
    // forwarded request → reports the upstream status (201)
    await fetch(`http://127.0.0.1:${port}/webhook?q=1`, {
      method: 'POST',
      headers: { 'X-aws-proxy-auth': 'good' },
    })
    // denied request (bad token) → reports 403
    await fetch(`http://127.0.0.1:${port}/denied`, {
      headers: { 'X-aws-proxy-auth': 'bad' },
    })
    expect(seen).toEqual([
      [201, 'POST', '/webhook'], // query string stripped from the reported path
      [403, 'GET', '/denied'],
    ])
  } finally {
    server.close()
  }
})
