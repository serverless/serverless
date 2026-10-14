import { afterEach, describe, expect, jest, test } from '@jest/globals'
import { EventEmitter, once } from 'events'
import http from 'http'
import {
  RESPONSE_SIZE_LIMIT,
  createRuntimeApi,
  runtimeHeaders,
} from '../../../../../../../lib/plugins/aws/dev/local/runtime-api.js'
import { collect, invocation, waitFor, workerId } from './helpers.js'

let api
afterEach(async () => {
  await api?.close()
  api = null
})

const start = async () => {
  api = createRuntimeApi()
  await api.listen()
  return api
}

// One request from the handler side, the way a runtime client makes it.
const target = (channel, path) => {
  const [authority, ...prefix] = channel.address.split('/')
  const [host, port] = authority.split(':')
  return { host, port, path: `/${prefix.join('/')}/2018-06-01/runtime${path}` }
}
const call = (channel, method, path, { headers = {}, body } = {}) =>
  new Promise((resolve, reject) => {
    const req = http.request(
      { ...target(channel, path), method, headers },
      (res) => {
        const chunks = []
        res.on('data', (chunk) => chunks.push(chunk))
        res.on('end', () =>
          resolve({
            status: res.statusCode,
            headers: res.headers,
            body: Buffer.concat(chunks).toString('utf8'),
          }),
        )
      },
    )
    req.on('error', reject)
    req.end(body)
  })

/**
 * Resolves with the server side ({ req, res }) of the next `method` request for `path` once the
 * Runtime API has handled its arrival: its own handler is the server's first 'request' listener,
 * so by then a /next is waiting and a result is marked as arriving. Call it before the request.
 */
const arrival = (method, path) =>
  new Promise((resolve) => {
    const onRequest = (req, res) => {
      if (
        req.method !== method ||
        !String(req.url).endsWith(`/2018-06-01/runtime${path}`)
      ) {
        return
      }
      api.server.off('request', onRequest)
      resolve({ req, res })
    }
    api.server.on('request', onRequest)
  })
// Once the server saw `req` go away, whatever its handler does about that has run.
const gone = async (req) => {
  if (!req.destroyed) await new Promise((resolve) => req.on('close', resolve))
  await new Promise((resolve) => setImmediate(resolve))
}

// A request whose body stays open until the test ends it.
const openPost = (channel, path, headers = {}) => {
  const req = http.request({
    ...target(channel, path),
    method: 'POST',
    headers: { 'Transfer-Encoding': 'chunked', ...headers },
  })
  const answered = new Promise((resolve, reject) => {
    req.on('response', (res) => {
      const chunks = []
      res.on('data', (chunk) => chunks.push(chunk))
      res.on('end', () =>
        resolve({
          status: res.statusCode,
          body: Buffer.concat(chunks).toString('utf8'),
        }),
      )
    })
    req.on('error', reject)
  })
  return { req, answered }
}

describe('the local Runtime API', () => {
  test('delivers an invocation to /next with its Lambda-Runtime headers and event, and /response settles it', async () => {
    const id = workerId()
    const channel = (await start()).channel(id)
    expect(channel.workerId).toBe(id)
    expect(channel.address).toBe(
      `127.0.0.1:${api.server.address().port}/lambda/${id}`,
    )
    const replied = channel.dispatch(
      invocation({
        requestId: 'req-1',
        event: { hello: 'world' },
        headers: {
          'Lambda-Runtime-Trace-Id': 'Root=1-abc',
          'X-Other': 'dropped',
        },
      }),
    )
    const next = await call(channel, 'GET', '/invocation/next')
    expect(next.status).toBe(200)
    expect(JSON.parse(next.body)).toEqual({ hello: 'world' })
    expect(next.headers['lambda-runtime-aws-request-id']).toBe('req-1')
    expect(next.headers['lambda-runtime-trace-id']).toBe('Root=1-abc')
    expect(next.headers['lambda-runtime-deadline-ms']).toMatch(/^\d+$/)
    expect(next.headers['x-other']).toBeUndefined()
    const posted = await call(channel, 'POST', '/invocation/req-1/response', {
      headers: { 'Content-Type': 'application/json' },
      body: '{"ok":true}',
    })
    expect(posted.status).toBe(202)
    const reply = await replied
    expect(reply.kind).toBe('response')
    expect(reply.contentType).toBe('application/json')
    expect(reply.body.toString()).toBe('{"ok":true}')
  })

  test('listen resolves the authority on 127.0.0.1', async () => {
    api = createRuntimeApi()
    const authority = await api.listen()
    expect(authority).toBe(`127.0.0.1:${api.server.address().port}`)
    expect(api.server.address().address).toBe('127.0.0.1')
  })

  test('holds /next until an invocation arrives, and hands out one invocation at a time, in order', async () => {
    const channel = (await start()).channel(workerId())
    const arrived = arrival('GET', '/invocation/next')
    const waiting = call(channel, 'GET', '/invocation/next')
    await arrived
    let started = 0
    const first = channel.dispatch({
      ...invocation({ requestId: 'req-1' }),
      onStarted: () => {
        started += 1
      },
    })
    const second = channel.dispatch(invocation({ requestId: 'req-2' }))
    expect((await waiting).headers['lambda-runtime-aws-request-id']).toBe(
      'req-1',
    )
    expect(started).toBe(1)
    expect(channel.busy).toBe(true)
    const againArrived = arrival('GET', '/invocation/next')
    const nextAgain = call(channel, 'GET', '/invocation/next')
    // The second /next is waiting, and nothing was written to it while req-1 is in flight.
    expect((await againArrived).res.headersSent).toBe(false)
    await call(channel, 'POST', '/invocation/req-1/response', { body: '1' })
    expect((await nextAgain).headers['lambda-runtime-aws-request-id']).toBe(
      'req-2',
    )
    await call(channel, 'POST', '/invocation/req-2/response', { body: '2' })
    expect((await first).body.toString()).toBe('1')
    expect((await second).body.toString()).toBe('2')
    expect(channel.busy).toBe(false)
  })

  test('refuses a second /next while one is waiting', async () => {
    const channel = (await start()).channel(workerId())
    const arrived = arrival('GET', '/invocation/next')
    const waiting = call(channel, 'GET', '/invocation/next')
    await arrived
    const again = await call(channel, 'GET', '/invocation/next')
    expect(again.status).toBe(400)
    expect(JSON.parse(again.body).errorType).toBe('InvalidRequest')
    const replied = channel.dispatch(invocation({ requestId: 'req-1' }))
    expect((await waiting).headers['lambda-runtime-aws-request-id']).toBe(
      'req-1',
    )
    await call(channel, 'POST', '/invocation/req-1/response', { body: '1' })
    expect((await replied).body.toString()).toBe('1')
  })

  test('an onStarted that throws does not stop the invocation, whether /next or dispatch delivers it', async () => {
    const channel = (await start()).channel(workerId())
    const throwing = () => {
      throw new Error('hook failed')
    }
    // Queued first, so the /next request handler delivers it and runs the hook.
    const first = channel.dispatch({
      ...invocation({ requestId: 'req-1', event: { n: 1 } }),
      onStarted: throwing,
    })
    const next = await call(channel, 'GET', '/invocation/next')
    expect(next.status).toBe(200)
    expect(JSON.parse(next.body)).toEqual({ n: 1 })
    const posted = await call(channel, 'POST', '/invocation/req-1/response', {
      body: 'one',
    })
    expect(posted.status).toBe(202)
    expect((await first).body.toString()).toBe('one')
    // /next waiting first, so dispatch delivers it and runs the hook.
    const arrived = arrival('GET', '/invocation/next')
    const waiting = call(channel, 'GET', '/invocation/next')
    await arrived
    const second = channel.dispatch({
      ...invocation({ requestId: 'req-2' }),
      onStarted: throwing,
    })
    expect((await waiting).headers['lambda-runtime-aws-request-id']).toBe(
      'req-2',
    )
    await call(channel, 'POST', '/invocation/req-2/response', { body: 'two' })
    expect(await second).toMatchObject({ kind: 'response' })
    expect((await second).body.toString()).toBe('two')
  })

  test('skips a waiting /next whose connection is already gone, and keeps the invocation for the next one', async () => {
    const channel = (await start()).channel(workerId())
    // A /next response the server has destroyed but whose 'close' has not run yet.
    const gone = new EventEmitter()
    gone.destroyed = false
    gone.writeHead = jest.fn()
    gone.end = jest.fn()
    channel.handleNext({}, gone)
    gone.destroyed = true
    const replied = channel.dispatch(invocation({ requestId: 'req-1' }))
    expect(gone.end).not.toHaveBeenCalled()
    const next = await call(channel, 'GET', '/invocation/next')
    expect(next.headers['lambda-runtime-aws-request-id']).toBe('req-1')
    await call(channel, 'POST', '/invocation/req-1/response', { body: 'ok' })
    expect((await replied).body.toString()).toBe('ok')
  })

  test('a result whose body is cut off can be posted again', async () => {
    const channel = (await start()).channel(workerId())
    const replied = channel.dispatch(invocation({ requestId: 'req-1' }))
    await call(channel, 'GET', '/invocation/next')
    const cutArrived = arrival('POST', '/invocation/req-1/response')
    const cut = openPost(channel, '/invocation/req-1/response')
    cut.answered.catch(() => {})
    cut.req.write('partial')
    const server = await cutArrived
    cut.req.destroy()
    await gone(server.req)
    const again = await call(channel, 'POST', '/invocation/req-1/response', {
      body: 'whole',
    })
    expect(again.status).toBe(202)
    expect((await replied).body.toString()).toBe('whole')
  })

  test('a result that finishes arriving after its invocation was settled leaves the next invocation alone', async () => {
    const channel = (await start()).channel(workerId())
    const first = channel.dispatch(invocation({ requestId: 'req-1' }))
    await call(channel, 'GET', '/invocation/next')
    const lateArrived = arrival('POST', '/invocation/req-1/response')
    const late = openPost(channel, '/invocation/req-1/response')
    late.req.write('late')
    await lateArrived
    // The init error settles req-1 while its result is still arriving; req-2 goes out next.
    const nextArrived = arrival('GET', '/invocation/next')
    const waiting = call(channel, 'GET', '/invocation/next')
    await nextArrived
    const second = channel.dispatch(invocation({ requestId: 'req-2' }))
    await call(channel, 'POST', '/init/error', {
      body: JSON.stringify({ errorType: 'Runtime.ExitError' }),
    })
    expect(await first).toMatchObject({
      kind: 'init_error',
      errorType: 'Runtime.ExitError',
    })
    expect((await waiting).headers['lambda-runtime-aws-request-id']).toBe(
      'req-2',
    )
    late.req.end()
    expect((await late.answered).status).toBe(202)
    expect(channel.busy).toBe(true)
    const posted = await call(channel, 'POST', '/invocation/req-2/response', {
      body: 'two',
    })
    expect(posted.status).toBe(202)
    expect((await second).body.toString()).toBe('two')
  })

  test('/error settles an error reply with its error type', async () => {
    const channel = (await start()).channel(workerId())
    const replied = channel.dispatch(invocation({ requestId: 'req-1' }))
    await call(channel, 'GET', '/invocation/next')
    const body = JSON.stringify({ errorType: 'TypeError', errorMessage: 'bad' })
    await call(channel, 'POST', '/invocation/req-1/error', {
      headers: { 'Lambda-Runtime-Function-Error-Type': 'TypeError' },
      body,
    })
    const reply = await replied
    expect(reply).toMatchObject({ kind: 'error', errorType: 'TypeError' })
    expect(reply.body.toString()).toBe(body)
  })

  test('an error without the header takes its type from the body, or is Runtime.Unknown', async () => {
    const channel = (await start()).channel(workerId())
    const replied = channel.dispatch(invocation({ requestId: 'req-1' }))
    await call(channel, 'GET', '/invocation/next')
    await call(channel, 'POST', '/invocation/req-1/error', {
      body: JSON.stringify({ errorType: 'Custom' }),
    })
    expect((await replied).errorType).toBe('Custom')
    const unreadable = channel.dispatch(invocation({ requestId: 'req-2' }))
    await call(channel, 'GET', '/invocation/next')
    await call(channel, 'POST', '/invocation/req-2/error', { body: 'not json' })
    expect((await unreadable).errorType).toBe('Runtime.Unknown')
  })

  test('an init error fails the invocation waiting for this worker, or the next one', async () => {
    const channel = (await start()).channel(workerId())
    const pending = channel.dispatch(invocation({ requestId: 'req-1' }))
    const initError = await call(channel, 'POST', '/init/error', {
      headers: {
        'Lambda-Runtime-Function-Error-Type': 'Runtime.ImportModuleError',
      },
      body: JSON.stringify({
        errorType: 'Runtime.ImportModuleError',
        errorMessage: 'nope',
      }),
    })
    expect(initError.status).toBe(202)
    expect(await pending).toMatchObject({
      kind: 'init_error',
      errorType: 'Runtime.ImportModuleError',
    })
    const other = api.channel(workerId())
    await call(other, 'POST', '/init/error', {
      body: JSON.stringify({ errorType: 'Runtime.HandlerNotFound' }),
    })
    expect(await other.dispatch(invocation())).toMatchObject({
      kind: 'init_error',
      errorType: 'Runtime.HandlerNotFound',
    })
  })

  test('refuses a result for another request, or for another invocation attempt', async () => {
    const channel = (await start()).channel(workerId())
    const replied = channel.dispatch(
      invocation({
        requestId: 'req-1',
        headers: { 'Lambda-Runtime-Invocation-Id': 'inv-1' },
      }),
    )
    await call(channel, 'GET', '/invocation/next')
    const wrongRequest = await call(
      channel,
      'POST',
      '/invocation/req-9/response',
      { body: '{}' },
    )
    expect(wrongRequest.status).toBe(400)
    expect(JSON.parse(wrongRequest.body).errorType).toBe('InvalidRequestID')
    const wrongAttempt = await call(
      channel,
      'POST',
      '/invocation/req-1/response',
      {
        headers: { 'Lambda-Runtime-Invocation-Id': 'inv-2' },
        body: '{}',
      },
    )
    expect(wrongAttempt.status).toBe(400)
    expect(JSON.parse(wrongAttempt.body).errorType).toBe('InvalidInvocationId')
    await call(channel, 'POST', '/invocation/req-1/response', {
      headers: { 'Lambda-Runtime-Invocation-Id': 'inv-1' },
      body: '{"fine":1}',
    })
    expect((await replied).body.toString()).toBe('{"fine":1}')
  })

  test('refuses a request id it cannot decode, and keeps serving', async () => {
    const channel = (await start()).channel(workerId())
    const replied = channel.dispatch(invocation({ requestId: 'req-1' }))
    await call(channel, 'GET', '/invocation/next')
    const garbled = await call(
      channel,
      'POST',
      '/invocation/%E0%A4%A/response',
      {
        body: '{}',
      },
    )
    expect(garbled.status).toBe(400)
    expect(JSON.parse(garbled.body).errorType).toBe('InvalidRequestID')
    await call(channel, 'POST', '/invocation/req-1/response', { body: 'ok' })
    expect((await replied).body.toString()).toBe('ok')
  })

  test('accepts one result per invocation: a second one while the first is still arriving is refused', async () => {
    const channel = (await start()).channel(workerId())
    const replied = channel.dispatch(invocation({ requestId: 'req-1' }))
    await call(channel, 'GET', '/invocation/next')
    const firstArrived = arrival('POST', '/invocation/req-1/response')
    const first = openPost(channel, '/invocation/req-1/response')
    first.req.write('first')
    await firstArrived
    const second = await call(channel, 'POST', '/invocation/req-1/response', {
      body: 'second',
    })
    expect(second.status).toBe(400)
    expect(JSON.parse(second.body).errorType).toBe('InvalidRequestID')
    const next = channel.dispatch(invocation({ requestId: 'req-2' }))
    first.req.end()
    expect((await first.answered).status).toBe(202)
    expect((await replied).body.toString()).toBe('first')
    await call(channel, 'GET', '/invocation/next')
    await call(channel, 'POST', '/invocation/req-2/response', { body: 'two' })
    expect((await next).body.toString()).toBe('two')
  })

  test('streams a response: chunks arrive before the request ends, and the trailers settle ended', async () => {
    const channel = (await start()).channel(workerId())
    const replied = channel.dispatch(invocation({ requestId: 'req-1' }))
    await call(channel, 'GET', '/invocation/next')
    const { req, answered } = openPost(channel, '/invocation/req-1/response', {
      'Lambda-Runtime-Function-Response-Mode': 'streaming',
      'Content-Type': 'text/plain',
      Trailer:
        'Lambda-Runtime-Function-Error-Type, Lambda-Runtime-Function-Error-Body',
    })
    req.write('chunk-1')
    const reply = await replied
    expect(reply.kind).toBe('stream')
    expect(reply.contentType).toBe('text/plain')
    const chunks = []
    reply.body.on('data', (chunk) => chunks.push(chunk.toString()))
    expect(await waitFor(() => chunks.length > 0)).toBe(true)
    expect(chunks).toEqual(['chunk-1'])
    req.addTrailers({
      'Lambda-Runtime-Function-Error-Type': 'Error',
      'Lambda-Runtime-Function-Error-Body': 'eyJlcnJvclR5cGUiOiJFcnJvciJ9',
    })
    req.end('chunk-2')
    expect(await reply.ended).toEqual({
      errorType: 'Error',
      errorBody: 'eyJlcnJvclR5cGUiOiJFcnJvciJ9',
    })
    expect((await answered).status).toBe(202)
    expect(chunks.join('')).toBe('chunk-1chunk-2')
  })

  test('a stream without trailers ends with no error', async () => {
    const channel = (await start()).channel(workerId())
    const replied = channel.dispatch(invocation({ requestId: 'req-1' }))
    await call(channel, 'GET', '/invocation/next')
    await call(channel, 'POST', '/invocation/req-1/response', {
      headers: { 'Lambda-Runtime-Function-Response-Mode': 'streaming' },
      body: 'all at once',
    })
    const reply = await collect(await replied)
    expect(reply.text).toBe('all at once')
    expect(reply.contentType).toBe('application/octet-stream')
    expect(reply.trailers).toEqual({ errorType: null, errorBody: null })
  })

  test('a stream cut off by the handler process ends its body and settles ended as aborted', async () => {
    const channel = (await start()).channel(workerId())
    const replied = channel.dispatch(invocation({ requestId: 'req-1' }))
    await call(channel, 'GET', '/invocation/next')
    const { req, answered } = openPost(channel, '/invocation/req-1/response', {
      'Lambda-Runtime-Function-Response-Mode': 'streaming',
    })
    answered.catch(() => {})
    req.write('partial')
    const reply = await replied
    // The chunk reached the Runtime API before the handler process goes away.
    await once(reply.body, 'readable')
    const collected = collect(reply)
    req.destroy()
    const result = await collected
    expect(result.text).toBe('partial')
    expect(result.trailers).toEqual({
      errorType: 'Runtime.Unknown',
      errorBody: null,
      aborted: true,
    })
  })

  test('serves two workers independently', async () => {
    await start()
    const one = api.channel(workerId())
    const two = api.channel(workerId())
    const first = one.dispatch(invocation({ requestId: 'req-1' }))
    const second = two.dispatch(invocation({ requestId: 'req-2' }))
    expect(
      (await call(two, 'GET', '/invocation/next')).headers[
        'lambda-runtime-aws-request-id'
      ],
    ).toBe('req-2')
    expect(
      (await call(one, 'GET', '/invocation/next')).headers[
        'lambda-runtime-aws-request-id'
      ],
    ).toBe('req-1')
    await call(two, 'POST', '/invocation/req-2/response', { body: 'two' })
    await call(one, 'POST', '/invocation/req-1/response', { body: 'one' })
    expect((await first).body.toString()).toBe('one')
    expect((await second).body.toString()).toBe('two')
  })

  test('404s an unknown worker, a worker id of the wrong shape, and an unknown path', async () => {
    await start()
    const id = workerId()
    const channel = api.channel(id)
    const pending = channel.dispatch(invocation({ requestId: 'req-1' }))
    const at = (other) => ({
      address: channel.address.replace(`/lambda/${id}`, `/lambda/${other}`),
    })
    const unknownIds = [
      workerId(),
      id.slice(0, 16),
      id.slice(0, 63),
      `${id}0`,
      id.toUpperCase(),
      'w1',
    ]
    for (const other of unknownIds) {
      const res = await call(at(other), 'GET', '/invocation/next')
      expect(res.status).toBe(404)
      expect(JSON.parse(res.body).errorType).toBe('NotFound')
    }
    expect((await call(channel, 'GET', '/invocation/nope')).status).toBe(404)
    expect(
      (await call(channel, 'POST', '/init/nope', { body: '' })).status,
    ).toBe(404)
    expect((await call(channel, 'POST', '/invocation/next')).status).toBe(405)
    expect(
      (await call(channel, 'GET', '/invocation/req-1/response')).status,
    ).toBe(405)
    // None of that reached the worker: its invocation is still queued for it.
    expect(
      (await call(channel, 'GET', '/invocation/next')).headers[
        'lambda-runtime-aws-request-id'
      ],
    ).toBe('req-1')
    await call(channel, 'POST', '/invocation/req-1/response', { body: 'ok' })
    expect((await pending).body.toString()).toBe('ok')
  })

  test('only opens a channel for a 32-byte hex worker id', async () => {
    await start()
    for (const bad of ['w1', '', 'A'.repeat(64), `${workerId()}0`, null]) {
      expect(() => api.channel(bad)).toThrow(TypeError)
    }
  })

  test("a buffered response over Lambda's 6 MB limit fails as Function.ResponseSizeTooLarge as soon as it passes the limit, and the worker gets 413", async () => {
    expect(RESPONSE_SIZE_LIMIT).toBe(6_291_556)
    const channel = (await start()).channel(workerId())
    const replied = channel.dispatch(invocation({ requestId: 'req-big' }))
    await call(channel, 'GET', '/invocation/next')
    const big = openPost(channel, '/invocation/req-big/response', {
      'Content-Type': 'application/json',
    })
    big.req.write(Buffer.alloc(RESPONSE_SIZE_LIMIT, 'a'))
    big.req.write('b')
    // Settled once the limit is passed, while the rest is still arriving (and is never kept).
    const reply = await replied
    expect(reply).toMatchObject({
      kind: 'error',
      errorType: 'Function.ResponseSizeTooLarge',
    })
    // Byte for byte what a caller of a deployed nodejs24.x function got for a 7 MB result.
    expect(reply.body.toString()).toBe(
      '{\n  "errorMessage": "Response payload size exceeded maximum allowed payload size (6291556 bytes).",\n  "errorType": "Function.ResponseSizeTooLarge"\n}',
    )
    big.req.end(Buffer.alloc(1024 * 1024, 'c'))
    const answered = await big.answered
    expect(answered.status).toBe(413)
    expect(JSON.parse(answered.body)).toEqual({
      errorType: 'RequestEntityTooLarge',
      errorMessage: 'Exceeded maximum allowed payload size (6291556 bytes).',
    })
    // The worker goes on to its next invocation.
    const next = channel.dispatch(invocation({ requestId: 'req-after' }))
    await call(channel, 'GET', '/invocation/next')
    await call(channel, 'POST', '/invocation/req-after/response', {
      body: '1',
    })
    expect((await next).body.toString()).toBe('1')
  })

  test('an error body over the same limit fails the invocation as Function.ResponseSizeTooLarge without being kept, and the worker gets 413', async () => {
    const channel = (await start()).channel(workerId())
    const replied = channel.dispatch(invocation({ requestId: 'req-err' }))
    await call(channel, 'GET', '/invocation/next')
    const big = openPost(channel, '/invocation/req-err/error', {
      'Lambda-Runtime-Function-Error-Type': 'Error',
    })
    big.req.write(Buffer.alloc(RESPONSE_SIZE_LIMIT + 1, 'e'))
    const reply = await replied
    expect(reply).toMatchObject({
      kind: 'error',
      errorType: 'Function.ResponseSizeTooLarge',
    })
    big.req.end()
    expect((await big.answered).status).toBe(413)
  })

  test('an init error body over the same limit fails the waiting invocation as an init error, and the worker gets 413', async () => {
    const channel = (await start()).channel(workerId())
    const replied = channel.dispatch(invocation({ requestId: 'req-init' }))
    const posted = await call(channel, 'POST', '/init/error', {
      headers: {
        'Lambda-Runtime-Function-Error-Type': 'Runtime.ImportModuleError',
      },
      body: Buffer.alloc(RESPONSE_SIZE_LIMIT + 1, 'i'),
    })
    expect(posted.status).toBe(413)
    const reply = await replied
    expect(reply).toMatchObject({
      kind: 'init_error',
      errorType: 'Function.ResponseSizeTooLarge',
    })
    expect(JSON.parse(reply.body.toString()).errorMessage).toBe(
      'Response payload size exceeded maximum allowed payload size (6291556 bytes).',
    )
  })

  test('fail can give each invocation its own reply', async () => {
    const channel = (await start()).channel(workerId())
    const first = channel.dispatch(invocation({ requestId: 'req-1' }))
    const second = channel.dispatch(invocation({ requestId: 'req-2' }))
    await call(channel, 'GET', '/invocation/next')
    channel.fail((item) => ({ kind: 'error', errorType: item.requestId }))
    expect((await first).errorType).toBe('req-1')
    expect((await second).errorType).toBe('req-2')
  })

  test('a buffered response of exactly 6 MB passes', async () => {
    const channel = (await start()).channel(workerId())
    const replied = channel.dispatch(invocation({ requestId: 'req-6mb' }))
    await call(channel, 'GET', '/invocation/next')
    const posted = await call(channel, 'POST', '/invocation/req-6mb/response', {
      body: Buffer.alloc(RESPONSE_SIZE_LIMIT, 'a'),
    })
    expect(posted.status).toBe(202)
    const reply = await replied
    expect(reply.kind).toBe('response')
    expect(reply.body.length).toBe(RESPONSE_SIZE_LIMIT)
  })

  test('abandon settles one invocation, in flight or queued, and says which', async () => {
    const channel = (await start()).channel(workerId())
    const [one, two, three] = [{}, {}, {}]
    const first = channel.dispatch({ ...invocation(), token: one })
    const second = channel.dispatch({ ...invocation(), token: two })
    await call(channel, 'GET', '/invocation/next')
    const ended = { kind: 'error', errorType: 'Sandbox.Timedout' }
    expect(channel.abandon(two, ended)).toBe('queued')
    expect(await second).toBe(ended)
    expect(channel.abandon(one, ended)).toBe('current')
    expect(await first).toBe(ended)
    expect(channel.abandon(one, ended)).toBeNull()
    expect(channel.abandon(three, ended)).toBeNull()
    expect(channel.abandon(undefined, ended)).toBeNull()
  })

  test('fail settles the invocation in flight and the queued ones', async () => {
    const channel = (await start()).channel(workerId())
    const first = channel.dispatch(invocation({ requestId: 'req-1' }))
    const second = channel.dispatch(invocation({ requestId: 'req-2' }))
    await call(channel, 'GET', '/invocation/next')
    const exited = {
      kind: 'error',
      errorType: 'Runtime.ExitError',
      body: Buffer.from('{}'),
    }
    channel.fail(exited)
    expect(await first).toBe(exited)
    expect(await second).toBe(exited)
    expect(channel.busy).toBe(false)
  })

  test('close ends a waiting /next, and a dispatch to a closed worker answers at once', async () => {
    const channel = (await start()).channel(workerId())
    const arrived = arrival('GET', '/invocation/next')
    const waiting = call(channel, 'GET', '/invocation/next')
    await arrived
    channel.close()
    await expect(waiting).rejects.toThrow()
    const reply = await channel.dispatch(invocation())
    expect(reply).toMatchObject({ kind: 'error', errorType: 'Runtime.Unknown' })
    expect(JSON.parse(reply.body.toString())).toEqual({
      errorType: 'Runtime.Unknown',
      errorMessage: 'The local worker for this invocation has stopped',
    })
    expect((await call(channel, 'GET', '/invocation/next')).status).toBe(404)
  })

  test('close settles the invocations still in flight or queued', async () => {
    const channel = (await start()).channel(workerId())
    const first = channel.dispatch(invocation({ requestId: 'req-1' }))
    const second = channel.dispatch(invocation({ requestId: 'req-2' }))
    await call(channel, 'GET', '/invocation/next')
    channel.close()
    expect(await first).toMatchObject({
      kind: 'error',
      errorType: 'Runtime.Unknown',
    })
    expect(await second).toMatchObject({
      kind: 'error',
      errorType: 'Runtime.Unknown',
    })
    expect(channel.busy).toBe(false)
  })

  test('close of the whole API stops every worker and the listener', async () => {
    await start()
    const channel = api.channel(workerId())
    const pending = channel.dispatch(invocation())
    const arrived = arrival('GET', '/invocation/next')
    const waiting = call(api.channel(workerId()), 'GET', '/invocation/next')
    await arrived
    await api.close()
    expect(await pending).toMatchObject({ errorType: 'Runtime.Unknown' })
    await expect(waiting).rejects.toThrow()
    expect(api.server.listening).toBe(false)
    api = null
  })

  test('has no request timeout: a stream may run as long as a function may', async () => {
    await start()
    expect(api.server.requestTimeout).toBe(0)
  })
})

describe('runtimeHeaders', () => {
  test('keeps only Lambda-Runtime-* headers, lowercased, as strings', () => {
    expect(
      runtimeHeaders({
        'Lambda-Runtime-Aws-Request-Id': 'req-1',
        'lambda-runtime-deadline-ms': 1790675566345,
        'Content-Type': 'application/json',
        'lambda-runtime-trace-id': undefined,
        'lambda-runtime-client-context': null,
      }),
    ).toEqual({
      'lambda-runtime-aws-request-id': 'req-1',
      'lambda-runtime-deadline-ms': '1790675566345',
    })
  })

  test('takes no headers as none', () => {
    expect(runtimeHeaders()).toEqual({})
    expect(runtimeHeaders(null)).toEqual({})
  })
})
