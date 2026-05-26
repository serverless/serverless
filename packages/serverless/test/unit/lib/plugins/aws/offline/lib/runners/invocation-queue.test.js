import { createInvocationQueue } from '../../../../../../../../lib/plugins/aws/offline/lib/runners/invocation-queue.js'

describe('createInvocationQueue', () => {
  it('awaitNext resolves immediately when an invocation is already pending', async () => {
    const q = createInvocationQueue()
    const payload = { hello: 'world' }
    const invokePromise = q.enqueue('fn-a', {
      payload,
      timeoutMs: 5000,
      invokedFunctionArn: 'arn:aws:lambda:us-east-1:000000000000:function:fn-a',
    })

    const next = await q.awaitNext('fn-a', { signal: undefined })

    expect(next.payload).toEqual(payload)
    expect(typeof next.requestId).toBe('string')
    expect(next.requestId.length).toBeGreaterThan(0)
    expect(typeof next.deadlineMs).toBe('number')
    expect(next.deadlineMs).toBeGreaterThan(Date.now() - 1)
    expect(next.invokedFunctionArn).toBe(
      'arn:aws:lambda:us-east-1:000000000000:function:fn-a',
    )

    // Resolve so the enqueue promise settles and we don't leak the timer.
    q.resolveInvocation('fn-a', next.requestId, { ok: true })
    await expect(invokePromise).resolves.toEqual({ ok: true })
  })

  it('enqueue resolves when resolveInvocation is called with matching id', async () => {
    const q = createInvocationQueue()
    const invokePromise = q.enqueue('fn-a', {
      payload: { a: 1 },
      timeoutMs: 5000,
    })
    const next = await q.awaitNext('fn-a', {})
    q.resolveInvocation('fn-a', next.requestId, { result: 42 })
    await expect(invokePromise).resolves.toEqual({ result: 42 })
  })

  it('enqueue rejects when rejectInvocation is called with matching id', async () => {
    const q = createInvocationQueue()
    const invokePromise = q.enqueue('fn-a', { payload: {}, timeoutMs: 5000 })
    const next = await q.awaitNext('fn-a', {})
    const err = new Error('handler boom')
    q.rejectInvocation('fn-a', next.requestId, err)
    await expect(invokePromise).rejects.toBe(err)
  })

  it('awaitNext parks when queue is empty and resolves on later enqueue', async () => {
    const q = createInvocationQueue()
    const nextPromise = q.awaitNext('fn-a', {})
    // Park is in place — enqueue should hand off directly.
    const invokePromise = q.enqueue('fn-a', {
      payload: { x: 7 },
      timeoutMs: 5000,
    })
    const next = await nextPromise
    expect(next.payload).toEqual({ x: 7 })
    expect(typeof next.requestId).toBe('string')

    q.resolveInvocation('fn-a', next.requestId, { done: true })
    await expect(invokePromise).resolves.toEqual({ done: true })
  })

  it('awaitNext aborts via AbortController.abort()', async () => {
    const q = createInvocationQueue()
    const controller = new AbortController()
    const p = q.awaitNext('fn-a', { signal: controller.signal })
    controller.abort()
    await expect(p).rejects.toMatchObject({ name: 'AbortError' })
  })

  it('awaitNext rejects immediately with AbortError when signal already aborted', async () => {
    const q = createInvocationQueue()
    const controller = new AbortController()
    controller.abort()
    await expect(
      q.awaitNext('fn-a', { signal: controller.signal }),
    ).rejects.toMatchObject({ name: 'AbortError' })
  })

  it('rejectAll drains pending + inFlight + waiters with the given reason', async () => {
    const q = createInvocationQueue()

    // inFlight entry: enqueue first, then awaitNext consumes it.
    const inFlightInvoke = q.enqueue('fn-a', {
      payload: { p: 1 },
      timeoutMs: 5000,
    })
    await q.awaitNext('fn-a', {})

    // pending entry: queue is empty of waiters, no consumer follows.
    const pendingInvoke = q.enqueue('fn-a', {
      payload: { p: 2 },
      timeoutMs: 5000,
    })

    // waiter parked: park BEFORE the next enqueue would arrive. Since the
    // previous enqueue already sat in pending, this awaitNext would shift
    // it. Drain it first so the next awaitNext actually parks.
    await q.awaitNext('fn-a', {}).then((delivered) => {
      // The shifted entry is now in inFlight under a second id; rejectAll
      // below will drain it from inFlight too. Save its id for clarity.
      return delivered
    })

    const waiterPromise = q.awaitNext('fn-a', {})

    const reason = new Error('shutting down')
    q.rejectAll('fn-a', reason)

    await expect(inFlightInvoke).rejects.toBe(reason)
    await expect(pendingInvoke).rejects.toBe(reason)
    await expect(waiterPromise).rejects.toMatchObject({ name: 'AbortError' })
  })

  it('enqueue rejects on its own timeout with OFFLINE_HANDLER_TIMEOUT', async () => {
    const q = createInvocationQueue()
    const start = Date.now()
    const invokePromise = q.enqueue('fn-a', { payload: {}, timeoutMs: 50 })
    await expect(invokePromise).rejects.toMatchObject({
      code: 'OFFLINE_HANDLER_TIMEOUT',
    })
    expect(Date.now() - start).toBeGreaterThanOrEqual(40)
  })

  it('has() returns false for unknown, true after awaitNext, false after resolve', async () => {
    const q = createInvocationQueue()
    expect(q.has('fn-a', 'nope')).toBe(false)

    const invokePromise = q.enqueue('fn-a', { payload: {}, timeoutMs: 5000 })
    const next = await q.awaitNext('fn-a', {})
    expect(q.has('fn-a', next.requestId)).toBe(true)

    q.resolveInvocation('fn-a', next.requestId, { ok: true })
    expect(q.has('fn-a', next.requestId)).toBe(false)
    await invokePromise
  })

  it('clear() rejects everything and removes the entry; later awaitNext parks fresh', async () => {
    const q = createInvocationQueue()
    const pendingInvoke = q.enqueue('fn-a', {
      payload: { p: 1 },
      timeoutMs: 5000,
    })

    q.clear('fn-a')
    await expect(pendingInvoke).rejects.toBeDefined()

    // A new awaitNext should park as a waiter — it must not return the cleared
    // invocation. We assert by racing it against a short timer.
    const fresh = q.awaitNext('fn-a', {})
    const sentinel = Symbol('parked')
    const winner = await Promise.race([
      fresh.catch(() => 'rejected'),
      new Promise((r) => setTimeout(() => r(sentinel), 30)),
    ])
    expect(winner).toBe(sentinel)

    // Cleanup: enqueue then resolve so the fresh awaitNext doesn't dangle.
    const cleanupInvoke = q.enqueue('fn-a', {
      payload: { z: 1 },
      timeoutMs: 5000,
    })
    const next = await fresh
    expect(next.payload).toEqual({ z: 1 })
    q.resolveInvocation('fn-a', next.requestId, { ok: true })
    await cleanupInvoke
  })
})
