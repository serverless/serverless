import { describe, expect, test } from '@jest/globals'
import { createWorkerPool } from '../../../../../../../lib/plugins/aws/dev/local/worker-pool.js'

/** Timers that record what was cleared; nothing ever fires. */
const recordingTimers = () => {
  const cleared = []
  return {
    cleared,
    setTimeout: () => 1,
    clearTimeout: (handle) => cleared.push(handle),
  }
}

/** Timers that count the live ones (started and neither cleared nor fired); nothing ever fires. */
const liveTimers = () => {
  const live = new Set()
  let next = 0
  return {
    live: () => live.size,
    setTimeout: () => {
      next += 1
      live.add(next)
      return next
    },
    clearTimeout: (handle) => live.delete(handle),
  }
}

const poolWith = (timers = recordingTimers()) => ({
  timers,
  pool: createWorkerPool({ timers, resources: {}, debug: () => {} }),
})

/** A worker as the pool creates it, between invocations. */
const idleWorker = (over = {}) => {
  const updates = []
  return {
    key: 'api\u0000e1',
    functionKey: 'api',
    registration: { update: (credentials) => updates.push(credentials) },
    updates,
    pending: 0,
    stale: false,
    generation: 0,
    started: false,
    firstInvocation: true,
    requestId: null,
    logRequestId: null,
    idleTimer: 7,
    spawnedAt: 1_000,
    initMs: undefined,
    ...over,
  }
}

const ENVIRONMENT = {
  AWS_ACCESS_KEY_ID: 'AKIDNEW',
  AWS_SECRET_ACCESS_KEY: 'secret-new',
  AWS_SESSION_TOKEN: 'token-new',
}

describe('the worker state an invocation changes', () => {
  test('an invocation handed a worker stops its idle timer, counts it and takes its log lines', () => {
    const { pool, timers } = poolWith()
    const worker = idleWorker()
    const first = pool.beginInvocation(worker, {
      requestId: 'r-1',
      environment: ENVIRONMENT,
      created: true,
    })
    expect(first).toBe(true)
    expect(timers.cleared).toEqual([7])
    expect(worker).toMatchObject({
      idleTimer: null,
      pending: 1,
      logRequestId: 'r-1',
      firstInvocation: false,
    })
  })

  test('a worker it did not create gets the credentials of the environment that sent the invocation', () => {
    const { pool } = poolWith()
    const reused = idleWorker({ firstInvocation: false })
    expect(
      pool.beginInvocation(reused, {
        requestId: 'r-2',
        environment: ENVIRONMENT,
        created: false,
      }),
    ).toBe(false)
    expect(reused.updates).toEqual([
      {
        accessKeyId: 'AKIDNEW',
        secretAccessKey: 'secret-new',
        sessionToken: 'token-new',
      },
    ])
    const created = idleWorker()
    pool.beginInvocation(created, {
      requestId: 'r-3',
      environment: ENVIRONMENT,
      created: true,
    })
    const withoutEnvironment = idleWorker({ firstInvocation: false })
    pool.beginInvocation(withoutEnvironment, {
      requestId: 'r-4',
      environment: undefined,
      created: false,
    })
    expect(created.updates).toEqual([])
    expect(withoutEnvironment.updates).toEqual([])
  })

  test('an invocation queued behind a running one leaves it the log lines until it starts', () => {
    const { pool } = poolWith()
    const worker = idleWorker()
    pool.beginInvocation(worker, { requestId: 'r-1', created: true })
    pool.markStarted(worker, {
      requestId: 'r-1',
      startedAt: 1_250,
      newWorker: true,
    })
    pool.beginInvocation(worker, { requestId: 'r-2', created: false })
    expect(worker).toMatchObject({
      pending: 2,
      requestId: 'r-1',
      logRequestId: 'r-1',
    })
    pool.endInvocation(worker, { requestId: 'r-1', initError: false })
    pool.markStarted(worker, {
      requestId: 'r-2',
      startedAt: 1_900,
      newWorker: false,
    })
    expect(worker).toMatchObject({
      pending: 1,
      requestId: 'r-2',
      logRequestId: 'r-2',
      started: true,
      // Only a new worker's first start is its init.
      initMs: 250,
    })
  })

  test('an ended invocation is no longer counted; a worker whose handler could not load is not handed out again', () => {
    const { pool } = poolWith()
    const worker = idleWorker()
    pool.beginInvocation(worker, { requestId: 'r-1', created: true })
    pool.markStarted(worker, {
      requestId: 'r-1',
      startedAt: 1_100,
      newWorker: true,
    })
    pool.endInvocation(worker, { requestId: 'r-1', initError: false })
    expect(worker).toMatchObject({ pending: 0, requestId: null, stale: false })
    const failing = idleWorker()
    pool.beginInvocation(failing, { requestId: 'r-2', created: true })
    pool.endInvocation(failing, { requestId: 'r-2', initError: true })
    expect(failing).toMatchObject({ pending: 0, stale: true })
    // Once its invocation is over, the good worker waits for the next one; the failed one stops
    // instead of waiting, and no invocation is handed it.
    pool.afterInvocation(worker)
    pool.afterInvocation(failing)
    expect(worker.stopping).toBeFalsy()
    expect(failing).toMatchObject({ stopping: true, idleTimer: null })
    expect(pool.size()).toBe(0)
  })

  test('the idle timer stops when the worker is handed an invocation or killed: no timer of the pool is left', () => {
    const { pool, timers } = poolWith(liveTimers())
    const worker = idleWorker({ idleTimer: null })
    pool.beginInvocation(worker, { requestId: 'r-1', created: true })
    pool.endInvocation(worker, { requestId: 'r-1', initError: false })
    // Idle: the worker waits for its next invocation, on a timer.
    pool.afterInvocation(worker)
    expect(timers.live()).toBe(1)
    pool.beginInvocation(worker, { requestId: 'r-2', created: false })
    expect(timers.live()).toBe(0)
    pool.endInvocation(worker, { requestId: 'r-2', initError: false })
    pool.afterInvocation(worker)
    pool.killWorker(worker)
    expect(worker.idleTimer).toBeNull()
    expect(timers.live()).toBe(0)
  })
})
