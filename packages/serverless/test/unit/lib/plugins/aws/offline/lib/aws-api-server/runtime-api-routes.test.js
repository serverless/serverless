import Hapi from '@hapi/hapi'
import { registerRuntimeApiRoutes } from '../../../../../../../../lib/plugins/aws/offline/lib/aws-api-server/runtime-api-routes.js'
import { createInvocationQueue } from '../../../../../../../../lib/plugins/aws/offline/lib/runners/invocation-queue.js'

describe('registerRuntimeApiRoutes', () => {
  let server
  let queue

  beforeEach(async () => {
    queue = createInvocationQueue()
    server = Hapi.server({ port: 0 })
    registerRuntimeApiRoutes(server, { queue })
    await server.start()
  })

  afterEach(async () => {
    await server.stop()
  })

  it('registers GET /runtime/{functionKey}/2018-06-01/runtime/invocation/next', () => {
    const route = server.match(
      'GET',
      '/runtime/fn1/2018-06-01/runtime/invocation/next',
    )
    expect(route).not.toBeNull()
  })

  it('registers POST /runtime/{functionKey}/2018-06-01/runtime/invocation/{requestId}/response', () => {
    const route = server.match(
      'POST',
      '/runtime/fn1/2018-06-01/runtime/invocation/abc/response',
    )
    expect(route).not.toBeNull()
  })

  it('registers POST /runtime/{functionKey}/2018-06-01/runtime/invocation/{requestId}/error', () => {
    const route = server.match(
      'POST',
      '/runtime/fn1/2018-06-01/runtime/invocation/abc/error',
    )
    expect(route).not.toBeNull()
  })

  it('GET /next returns the next invocation with Lambda-Runtime-* headers', async () => {
    // The test only exercises GET /next; the invocation is never settled,
    // so attach a swallowing catch to the enqueue promise to keep the
    // eventual per-invocation timeout rejection from surfacing as an
    // unhandled rejection.
    queue
      .enqueue('fn1', {
        payload: { hello: 'world' },
        timeoutMs: 5000,
        invokedFunctionArn:
          'arn:aws:lambda:us-east-1:000000000000:function:fn1',
      })
      .catch(() => {})
    const res = await server.inject({
      method: 'GET',
      url: '/runtime/fn1/2018-06-01/runtime/invocation/next',
    })
    expect(res.statusCode).toBe(200)
    expect(res.headers['lambda-runtime-aws-request-id']).toMatch(
      /^[0-9a-f-]{36}$/,
    )
    expect(res.headers['lambda-runtime-deadline-ms']).toMatch(/^\d+$/)
    expect(res.headers['lambda-runtime-invoked-function-arn']).toContain(':fn1')
    expect(res.headers['content-type']).toMatch(/application\/json/)
    expect(JSON.parse(res.payload)).toEqual({ hello: 'world' })
  })

  it('GET /next long-polls until enqueue happens', async () => {
    setTimeout(() => {
      // Swallow the eventual unsettled-invocation timeout rejection.
      queue
        .enqueue('fn1', { payload: { late: true }, timeoutMs: 5000 })
        .catch(() => {})
    }, 50)
    const res = await server.inject({
      method: 'GET',
      url: '/runtime/fn1/2018-06-01/runtime/invocation/next',
    })
    expect(JSON.parse(res.payload)).toEqual({ late: true })
  })

  it('GET /next does not deliver invocations enqueued for a different functionKey', async () => {
    // Both enqueue calls below are never settled (the test only checks
    // routing/parking behaviour). Attach swallowing catches so the
    // eventual per-invocation timeouts don't surface as unhandled
    // rejections after the test exits.
    queue
      .enqueue('fn2', { payload: { for: 'fn2' }, timeoutMs: 5000 })
      .catch(() => {})
    // Race: a GET on fn1 should stay parked while fn2 has work.
    const fn1Poll = server.inject({
      method: 'GET',
      url: '/runtime/fn1/2018-06-01/runtime/invocation/next',
    })
    const sentinel = Symbol('parked')
    const winner = await Promise.race([
      fn1Poll,
      new Promise((r) => setTimeout(() => r(sentinel), 30)),
    ])
    expect(winner).toBe(sentinel)

    // Cleanup so fn1Poll doesn't dangle past the test.
    queue
      .enqueue('fn1', { payload: { now: 'fn1' }, timeoutMs: 5000 })
      .catch(() => {})
    const res = await fn1Poll
    expect(JSON.parse(res.payload)).toEqual({ now: 'fn1' })
  })

  it('POST /response resolves the matching invocation', async () => {
    const invocation = queue.enqueue('fn1', { payload: {}, timeoutMs: 5000 })
    const next = await queue.awaitNext('fn1', {})
    const res = await server.inject({
      method: 'POST',
      url: `/runtime/fn1/2018-06-01/runtime/invocation/${next.requestId}/response`,
      payload: JSON.stringify({ ok: true }),
      headers: { 'content-type': 'application/json' },
    })
    expect(res.statusCode).toBe(202)
    expect(res.payload).toBe('')
    await expect(invocation).resolves.toEqual({ ok: true })
  })

  it('POST /response returns 404 when requestId is unknown', async () => {
    const res = await server.inject({
      method: 'POST',
      url: '/runtime/fn1/2018-06-01/runtime/invocation/no-such-id/response',
      payload: '{}',
      headers: { 'content-type': 'application/json' },
    })
    expect(res.statusCode).toBe(404)
  })

  it('POST /response falls back to raw string for non-JSON body', async () => {
    const invocation = queue.enqueue('fn1', { payload: {}, timeoutMs: 5000 })
    const next = await queue.awaitNext('fn1', {})
    const res = await server.inject({
      method: 'POST',
      url: `/runtime/fn1/2018-06-01/runtime/invocation/${next.requestId}/response`,
      payload: 'not-json-at-all',
      headers: { 'content-type': 'text/plain' },
    })
    expect(res.statusCode).toBe(202)
    await expect(invocation).resolves.toBe('not-json-at-all')
  })

  it('POST /response resolves to null for empty body', async () => {
    const invocation = queue.enqueue('fn1', { payload: {}, timeoutMs: 5000 })
    const next = await queue.awaitNext('fn1', {})
    const res = await server.inject({
      method: 'POST',
      url: `/runtime/fn1/2018-06-01/runtime/invocation/${next.requestId}/response`,
      payload: '',
    })
    expect(res.statusCode).toBe(202)
    await expect(invocation).resolves.toBeNull()
  })

  it('POST /error rejects the matching invocation', async () => {
    const invocation = queue.enqueue('fn1', { payload: {}, timeoutMs: 5000 })
    const next = await queue.awaitNext('fn1', {})
    const res = await server.inject({
      method: 'POST',
      url: `/runtime/fn1/2018-06-01/runtime/invocation/${next.requestId}/error`,
      payload: JSON.stringify({
        errorMessage: 'boom',
        errorType: 'RuntimeError',
      }),
      headers: { 'content-type': 'application/json' },
    })
    expect(res.statusCode).toBe(202)
    await expect(invocation).rejects.toMatchObject({
      errorMessage: 'boom',
      errorType: 'RuntimeError',
    })
  })

  it('POST /error returns 404 when requestId is unknown', async () => {
    const res = await server.inject({
      method: 'POST',
      url: '/runtime/fn1/2018-06-01/runtime/invocation/no-such-id/error',
      payload: '{}',
      headers: { 'content-type': 'application/json' },
    })
    expect(res.statusCode).toBe(404)
  })

  it('POST /error synthesizes errorMessage/errorType for non-JSON body', async () => {
    const invocation = queue.enqueue('fn1', { payload: {}, timeoutMs: 5000 })
    const next = await queue.awaitNext('fn1', {})
    const res = await server.inject({
      method: 'POST',
      url: `/runtime/fn1/2018-06-01/runtime/invocation/${next.requestId}/error`,
      payload: 'plain-text-error',
      headers: { 'content-type': 'text/plain' },
    })
    expect(res.statusCode).toBe(202)
    await expect(invocation).rejects.toMatchObject({
      errorMessage: 'plain-text-error',
      errorType: 'Error',
    })
  })

  it('POST /error rejects with synthesized empty-body shape', async () => {
    const invocation = queue.enqueue('fn1', { payload: {}, timeoutMs: 5000 })
    const next = await queue.awaitNext('fn1', {})
    const res = await server.inject({
      method: 'POST',
      url: `/runtime/fn1/2018-06-01/runtime/invocation/${next.requestId}/error`,
      payload: '',
    })
    expect(res.statusCode).toBe(202)
    await expect(invocation).rejects.toEqual({
      errorMessage: '',
      errorType: 'Error',
    })
  })
})
