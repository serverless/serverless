import { afterEach, describe, expect, test } from '@jest/globals'
import http from 'http'
import {
  CONTROL_REQUEST_TIMEOUT_MS,
  startControlServer,
} from '../../../../../../../lib/plugins/aws/dev/control/server.js'
import { countingTimers } from '../attach/fakes.js'

const TOKEN = 'a'.repeat(64)
const servers = []
afterEach(async () => {
  for (const server of servers.splice(0)) await server.close()
})

/** One raw request, so a test can set any Host or Origin. */
const request = (
  url,
  { method = 'GET', path = '/v1/health', headers = {}, body } = {},
) =>
  new Promise((resolve, reject) => {
    const target = new URL(url)
    const req = http.request(
      {
        host: target.hostname,
        port: target.port,
        method,
        path,
        agent: false,
        headers: { Authorization: `Bearer ${TOKEN}`, ...headers },
      },
      (res) => {
        const chunks = []
        res.on('data', (chunk) => chunks.push(chunk))
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8')
          resolve({
            status: res.statusCode,
            body: text ? JSON.parse(text) : null,
          })
        })
      },
    )
    req.on('error', reject)
    req.end(body)
  })

const coded = (reason, message) => Object.assign(new Error(message), { reason })

const start = async (handlers = {}, { timers, requestTimeoutMs } = {}) => {
  const calls = []
  const server = await startControlServer({
    sessionId: 's_000000000001',
    token: TOKEN,
    handlers: {
      health: () => ({ state: 'on' }),
      status: async () => ({ state: 'on', functions: [] }),
      stop: async (body) => {
        calls.push(['stop', body])
      },
      replay: async (body) => {
        calls.push(['replay', body])
        throw coded('invocation_not_found', 'No invocation 3f2a9c1e is kept.')
      },
      touch: () => calls.push(['touch']),
      ...handlers,
    },
    ...(timers && { timers }),
    ...(requestTimeoutMs && { requestTimeoutMs }),
  })
  servers.push(server)
  return { server, calls }
}

/**
 * A POST that declares `length` bytes, sends `sent` of them and never ends: resolves the answer
 * (`{ status, body }`) or `{ closed: <error code> }` when the connection is cut without one.
 */
const unfinishedUpload = (url, { length, sent }) =>
  new Promise((resolve) => {
    const target = new URL(url)
    const req = http.request(
      {
        host: target.hostname,
        port: target.port,
        method: 'POST',
        path: '/v1/stop',
        agent: false,
        headers: {
          Authorization: `Bearer ${TOKEN}`,
          'Content-Length': length,
        },
      },
      (res) => {
        const chunks = []
        res.on('data', (chunk) => chunks.push(chunk))
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8')
          resolve({ status: res.statusCode, body: text })
        })
        res.on('error', () => resolve({ status: res.statusCode }))
      },
    )
    req.on('error', (error) => resolve({ closed: error.code }))
    req.write('x'.repeat(sent))
  })

/** Rejections nobody handled while `fn` ran (and one turn of the event loop after it). */
const unhandledDuring = async (fn) => {
  const seen = []
  const listener = (reason) => seen.push(reason)
  process.on('unhandledRejection', listener)
  try {
    await fn()
    await new Promise((resolve) => setImmediate(resolve))
    await new Promise((resolve) => setImmediate(resolve))
  } finally {
    process.off('unhandledRejection', listener)
  }
  return seen
}

describe('the control endpoint', () => {
  test('listens on 127.0.0.1 and answers the routes', async () => {
    const { server, calls } = await start()
    expect(server.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/)
    expect(await request(server.url)).toEqual({
      status: 200,
      body: { session_id: 's_000000000001', state: 'on' },
    })
    expect(await request(server.url, { path: '/v1/status' })).toEqual({
      status: 200,
      body: { state: 'on', functions: [] },
    })
    expect(
      await request(server.url, {
        method: 'POST',
        path: '/v1/stop',
        body: '{"keep":true}',
      }),
    ).toEqual({ status: 202, body: { stopping: true } })
    expect(
      await request(server.url, {
        method: 'POST',
        path: '/v1/replay',
        body: '{"request_id":"3f2a9c1e"}',
      }),
    ).toEqual({
      status: 404,
      body: {
        reason: 'invocation_not_found',
        message: 'No invocation 3f2a9c1e is kept.',
      },
    })
    expect(
      await request(server.url, { method: 'POST', path: '/v1/touch' }),
    ).toEqual({
      status: 204,
      body: null,
    })
    expect(await request(server.url, { path: '/v1/nothing' })).toEqual({
      status: 404,
      body: { error: 'not_found' },
    })
    expect(
      await request(server.url, { method: 'GET', path: '/v1/stop' }),
    ).toEqual({
      status: 404,
      body: { error: 'not_found' },
    })
    // Status, replay and touch are activity; health and stop are not.
    expect(calls).toEqual([
      ['touch'],
      ['stop', { keep: true }],
      ['touch'],
      ['replay', { request_id: '3f2a9c1e' }],
      ['touch'],
    ])
  })

  test('a replay answers its fields, or 409 with the reason when the request id or the session refuses', async () => {
    const answers = [
      () => ({ request_id: 'r2', replay_of: 'r1', outcome: 'ok' }),
      () => {
        throw coded('ambiguous_request_id', '"3f2a" matches two requests.')
      },
      () => {
        throw new Error('Dev Mode is still starting; replay it once it is on.')
      },
    ]
    const { server } = await start({ replay: async () => answers.shift()() })
    const replay = () =>
      request(server.url, {
        method: 'POST',
        path: '/v1/replay',
        body: '{"request_id":"r1"}',
      })
    expect(await replay()).toEqual({
      status: 200,
      body: { request_id: 'r2', replay_of: 'r1', outcome: 'ok' },
    })
    expect(await replay()).toEqual({
      status: 409,
      body: {
        reason: 'ambiguous_request_id',
        message: '"3f2a" matches two requests.',
      },
    })
    expect(await replay()).toEqual({
      status: 409,
      body: {
        reason: 'error',
        message: 'Dev Mode is still starting; replay it once it is on.',
      },
    })
  })

  test('a web request replay names its kind to the handler; a cut body is refused with its reason', async () => {
    const message = 'The body of request r1 was larger than 1 MiB.'
    const bodies = []
    const { server } = await start({
      replay: async (body) => {
        bodies.push(body)
        throw coded('request_body_truncated', message)
      },
    })
    expect(
      await request(server.url, {
        method: 'POST',
        path: '/v1/replay',
        body: '{"request_id":"r1","kind":"request"}',
      }),
    ).toEqual({
      status: 409,
      body: { reason: 'request_body_truncated', message },
    })
    expect(bodies).toEqual([{ request_id: 'r1', kind: 'request' }])
    for (const reason of ['request_body_not_captured', 'web_app_not_local']) {
      const other = await start({
        replay: async () => {
          throw coded(reason, 'refused')
        },
      })
      expect(
        await request(other.server.url, {
          method: 'POST',
          path: '/v1/replay',
          body: '{"request_id":"r1","kind":"request"}',
        }),
      ).toEqual({ status: 409, body: { reason, message: 'refused' } })
    }
  })

  test.each([
    ['no token', { Authorization: '' }],
    ['a wrong token', { Authorization: `Bearer ${'b'.repeat(64)}` }],
    ['a token without Bearer', { Authorization: TOKEN }],
    ['a foreign Host', { Host: 'attacker.example:80' }],
    ['an Origin', { Origin: 'http://127.0.0.1' }],
  ])('%s gets 403 and reaches no handler', async (_, headers) => {
    const { server, calls } = await start()
    const port = new URL(server.url).port
    expect(
      await request(server.url, {
        method: 'POST',
        path: '/v1/stop',
        headers,
        body: '{}',
      }),
    ).toEqual({ status: 403, body: { error: 'forbidden' } })
    expect(
      await request(server.url, {
        headers: {
          ...headers,
          ...(headers.Host ? {} : { Host: `localhost:${port}` }),
        },
      }),
    ).toEqual({ status: 403, body: { error: 'forbidden' } })
    expect(calls).toEqual([])
  })

  test('localhost:<port> is accepted as the Host', async () => {
    const { server } = await start()
    const port = new URL(server.url).port
    expect(
      (await request(server.url, { headers: { Host: `localhost:${port}` } }))
        .status,
    ).toBe(200)
  })

  test('bodies over 64 KiB, bodies that are not a JSON object, and failing handlers', async () => {
    const { server } = await start({
      status: async () => {
        throw new Error('boom')
      },
    })
    expect(
      await request(server.url, {
        method: 'POST',
        path: '/v1/stop',
        body: 'x'.repeat(64 * 1024 + 1),
      }),
    ).toEqual({ status: 413, body: { error: 'too_large' } })
    for (const body of ['{', '[1]', 'null']) {
      expect(
        await request(server.url, { method: 'POST', path: '/v1/stop', body }),
      ).toEqual({ status: 400, body: { error: 'invalid_json' } })
    }
    expect(await request(server.url, { path: '/v1/status' })).toEqual({
      status: 500,
      body: { error: 'internal' },
    })
  })

  test('a failing activity hook changes no answer and leaves no unhandled rejection', async () => {
    for (const touch of [
      async () => {
        throw new Error('idle timer gone')
      },
      () => {
        throw new Error('idle timer gone')
      },
    ]) {
      const { server } = await start({ touch })
      const answers = []
      const unhandled = await unhandledDuring(async () => {
        answers.push(
          await request(server.url, { method: 'POST', path: '/v1/touch' }),
          await request(server.url, { path: '/v1/status' }),
          (
            await request(server.url, {
              method: 'POST',
              path: '/v1/replay',
              body: '{"request_id":"3f2a9c1e"}',
            })
          ).status,
        )
      })
      expect(answers).toEqual([
        { status: 204, body: null },
        { status: 200, body: { state: 'on', functions: [] } },
        404,
      ])
      expect(unhandled).toEqual([])
    }
  })

  test('a body past 64 KiB is answered 413 at once, without waiting for the rest', async () => {
    const { server, calls } = await start()
    expect(
      await unfinishedUpload(server.url, {
        length: 10 * 1024 * 1024,
        sent: 64 * 1024 + 1,
      }),
    ).toEqual({ status: 413, body: '{"error":"too_large"}' })
    expect(calls).toEqual([])
  })

  test('a request that never finishes arriving is cut after the request time limit', async () => {
    const { server, calls } = await start({}, { requestTimeoutMs: 200 })
    const answer = await unfinishedUpload(server.url, { length: 100, sent: 10 })
    expect(answer.status === 408 || answer.closed !== undefined).toBe(true)
    expect(calls).toEqual([])
  })

  test('the request time limit is 30 s by default', async () => {
    expect(CONTROL_REQUEST_TIMEOUT_MS).toBe(30_000)
  })

  test('close ends open connections, can be called twice, and leaves no timer', async () => {
    let arrived
    const reached = new Promise((resolve) => {
      arrived = resolve
    })
    const timers = countingTimers()
    const { server } = await start(
      {
        status: () => {
          arrived()
          return new Promise(() => {})
        },
      },
      { timers },
    )
    const hanging = request(server.url, { path: '/v1/status' }).catch(
      (error) => error.code,
    )
    await reached
    await Promise.all([server.close(), server.close()])
    expect(await hanging).toEqual(expect.any(String))
    expect(timers.live()).toBe(0)
  })
})
