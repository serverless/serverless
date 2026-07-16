// readiness-probe.test.js — unit coverage for defaultWaitForPort, the HTTP-level readiness gate
// that must hold off lifecycle-hook delivery until a freshly started container's :9000 is actually
// serving. A bare TCP connect was insufficient (Docker's published-port proxy accepts before the
// in-VM server binds), so this probe waits for a real HTTP response. Exercised here against a
// loopback server — no Docker.
import http from 'http'
import { defaultWaitForPort } from '../../../../../../../../lib/plugins/aws/sandboxes/dev/api-emulator/control-plane.js'

function listenOnFreePort(handler) {
  return new Promise((resolve) => {
    const server = http.createServer(handler)
    server.listen(0, '127.0.0.1', () =>
      resolve({ server, port: server.address().port }),
    )
  })
}

test('resolves false immediately when port is falsy', async () => {
  expect(await defaultWaitForPort('127.0.0.1', 0)).toBe(false)
  expect(await defaultWaitForPort('127.0.0.1', undefined)).toBe(false)
})

test('resolves true once the server answers — any HTTP status counts (e.g. 501 to GET)', async () => {
  // Mirror a hooks server that only implements POST: a GET gets 501, which still proves "serving".
  const { server, port } = await listenOnFreePort((req, res) => {
    res.writeHead(501)
    res.end()
  })
  try {
    expect(await defaultWaitForPort('127.0.0.1', port, 2000, 50)).toBe(true)
  } finally {
    await new Promise((r) => server.close(r))
  }
})

test('resolves false after the deadline when nothing is listening', async () => {
  // Grab a port, then free it, so connects are refused — the probe must retry until the deadline.
  const { server, port } = await listenOnFreePort((_req, res) => res.end())
  await new Promise((r) => server.close(r))
  const start = Date.now()
  expect(await defaultWaitForPort('127.0.0.1', port, 300, 50)).toBe(false)
  expect(Date.now() - start).toBeGreaterThanOrEqual(250) // it waited out the deadline, not gave up
})
