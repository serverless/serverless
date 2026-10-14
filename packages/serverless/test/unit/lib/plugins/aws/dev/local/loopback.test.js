import { afterEach, describe, expect, test } from '@jest/globals'
import { EventEmitter } from 'events'
import http from 'http'
import {
  listenLoopback,
  readBody,
  sameToken,
  sendJson,
} from '../../../../../../../lib/plugins/aws/dev/local/loopback.js'

let server
afterEach(async () => {
  if (server?.listening) {
    server.closeAllConnections()
    await new Promise((resolve) => server.close(() => resolve()))
  }
  server = null
})

const serve = async (handler) => {
  server = http.createServer(handler)
  const { port } = await listenLoopback(server)
  return `http://127.0.0.1:${port}`
}

describe('listenLoopback', () => {
  test('binds 127.0.0.1 on an ephemeral port and resolves where', async () => {
    server = http.createServer((req, res) => res.end('ok'))
    const bound = await listenLoopback(server)
    expect(bound).toEqual({ host: '127.0.0.1', port: server.address().port })
    expect(server.address().address).toBe('127.0.0.1')
    expect(bound.port).toBeGreaterThan(0)
    expect(server.listenerCount('error')).toBe(0)
    const reply = await fetch(`http://127.0.0.1:${bound.port}/`)
    expect(await reply.text()).toBe('ok')
  })

  test('rejects when the server cannot listen', async () => {
    const failing = new EventEmitter()
    const calls = []
    failing.listen = (...args) => {
      calls.push(args.slice(0, 2))
      process.nextTick(() => failing.emit('error', new Error('EADDRINUSE')))
    }
    await expect(listenLoopback(failing)).rejects.toThrow('EADDRINUSE')
    expect(calls).toEqual([[0, '127.0.0.1']])
  })
})

describe('sendJson', () => {
  test('replies with the status and the body as JSON', async () => {
    const url = await serve((req, res) => sendJson(res, 202, { status: 'OK' }))
    const reply = await fetch(url)
    expect(reply.status).toBe(202)
    expect(reply.headers.get('content-type')).toBe('application/json')
    expect(await reply.json()).toEqual({ status: 'OK' })
  })
})

describe('readBody', () => {
  test('resolves the whole body as bytes', async () => {
    const url = await serve(async (req, res) => {
      const body = await readBody(req)
      sendJson(res, 200, {
        isBuffer: Buffer.isBuffer(body),
        hex: body.toString('hex'),
      })
    })
    const bytes = Buffer.from([0x00, 0xff, 0xc3, 0xa9, 0x7b])
    const reply = await (
      await fetch(url, { method: 'POST', body: bytes })
    ).json()
    expect(reply).toEqual({ isBuffer: true, hex: bytes.toString('hex') })
    const empty = await (await fetch(url, { method: 'POST' })).json()
    expect(empty).toEqual({ isBuffer: true, hex: '' })
  })

  test('rejects when the request fails', async () => {
    const req = new EventEmitter()
    const reading = readBody(req)
    req.emit('data', Buffer.from('partial'))
    req.emit('error', new Error('aborted'))
    await expect(reading).rejects.toThrow('aborted')
  })
})

describe('sameToken', () => {
  const token = 'a'.repeat(64)

  test('accepts only the same token', () => {
    expect(sameToken(token, token)).toBe(true)
    expect(sameToken('b'.repeat(64), token)).toBe(false)
  })

  test.each([
    ['a shorter value', 'a'.repeat(63)],
    ['a longer value', 'a'.repeat(65)],
    ['as many characters in more bytes', 'é'.repeat(64)],
    ['nothing', undefined],
    ['null', null],
    ['an empty string', ''],
    ['a list of the token', [token]],
    ['a number', 1],
  ])('refuses %s without throwing', (name, given) => {
    expect(sameToken(given, token)).toBe(false)
  })

  test('refuses everything when there is no expected token', () => {
    expect(sameToken('', '')).toBe(false)
    expect(sameToken(undefined, undefined)).toBe(false)
    expect(sameToken('x', undefined)).toBe(false)
  })
})
