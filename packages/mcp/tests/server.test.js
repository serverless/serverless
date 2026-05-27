import http from 'node:http'
import { describe, test, expect, afterEach } from '@jest/globals'
import { startSseServer } from '../src/server.js'

let running

afterEach(async () => {
  if (running) {
    await running.stop()
    running = null
  }
})

function request(port, { host, path = '/sse', method = 'GET' } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port,
        path,
        method,
        headers: host ? { Host: host } : {},
      },
      (res) => {
        const chunks = []
        res.on('data', (c) => chunks.push(c))
        res.on('end', () =>
          resolve({
            status: res.statusCode,
            body: Buffer.concat(chunks).toString('utf8'),
          }),
        )
      },
    )
    req.on('error', reject)
    req.end()
  })
}

describe('startSseServer', () => {
  test('binds to 127.0.0.1 only', async () => {
    running = await startSseServer({ port: 0 })
    const address = running.httpServer.address()
    expect(address.address).toBe('127.0.0.1')
    expect(address.family).toBe('IPv4')
    expect(running.port).toBe(address.port)
  })

  test('rejects requests with a spoofed Host header', async () => {
    running = await startSseServer({ port: 0 })
    const { port } = running.httpServer.address()
    const res = await request(port, { host: 'evil.example' })
    expect(res.status).toBe(403)
    expect(res.body).toContain('Invalid Host')
  })

  test('accepts requests with a localhost Host header', async () => {
    running = await startSseServer({ port: 0 })
    const { port } = running.httpServer.address()
    // GET /sse with a valid Host succeeds; close right after headers so
    // jest does not hang on the long-lived SSE stream.
    const status = await new Promise((resolve, reject) => {
      const req = http.request(
        {
          hostname: '127.0.0.1',
          port,
          path: '/sse',
          method: 'GET',
          headers: { Host: `127.0.0.1:${port}` },
        },
        (res) => {
          resolve(res.statusCode)
          res.destroy()
        },
      )
      req.on('error', reject)
      req.end()
    })
    expect(status).toBe(200)
  })
})
