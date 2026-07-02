// hooks.test.js
import {
  createHookFirer,
  resolveHookTimeouts,
  HOOK_PATH,
} from '../../../../../../../../lib/plugins/aws/sandboxes/dev/api-emulator/hooks.js'

const inst = { microvmId: 'mvm-1', portMap: { 9000: 59000, 8080: 58080 } }

test('fires only enabled hooks, to the 9000 host port, at the runtime path; run carries the payload', async () => {
  const calls = []
  const fire = createHookFirer({
    enabledHooks: new Set(['ready', 'run']),
    fetchImpl: async (url, init) => {
      calls.push({ url, init })
      return new Response('{}')
    },
  })
  expect(await fire('ready', inst)).toEqual({ status: 200 }) // delivered (Response defaults to 200)
  expect(await fire('run', inst, '{"x":1}')).toEqual({ status: 200 })
  expect(await fire('suspend', inst)).toBeNull() // not enabled → skipped
  expect(calls.map((c) => c.url)).toEqual([
    `http://127.0.0.1:59000${HOOK_PATH}/ready`,
    `http://127.0.0.1:59000${HOOK_PATH}/run`,
  ])
  // ready: bare POST, no body, no content-type (matches live capture)
  expect(calls[0].init.body).toBeUndefined()
  expect(calls[0].init.headers).toBeUndefined()
  // run: JSON body + content-type
  expect(calls[1].init.headers['content-type']).toBe('application/json')
  expect(JSON.parse(calls[1].init.body)).toEqual({
    microvmId: 'mvm-1',
    runHookPayload: '{"x":1}',
  })
})

test('no-op when the hook is disabled or there is no 9000 mapping', async () => {
  let called = false
  const fire = createHookFirer({
    enabledHooks: new Set(['ready']),
    fetchImpl: async () => {
      called = true
      return new Response('{}')
    },
  })
  expect(await fire('ready', { microvmId: 'x', portMap: {} })).toBeNull() // no 9000 port
  expect(await fire('terminate', inst)).toBeNull() // not enabled
  expect(called).toBe(false)
})

test('hook failure is swallowed (best-effort, never throws) and reports null', async () => {
  const fire = createHookFirer({
    enabledHooks: new Set(['terminate']),
    fetchImpl: async () => {
      throw new Error('down')
    },
  })
  await expect(fire('terminate', inst)).resolves.toBeNull()
})

test('reports the HTTP status so callers can enforce the non-2xx gate', async () => {
  const fire = createHookFirer({
    enabledHooks: new Set(['run']),
    fetchImpl: async () => new Response('nope', { status: 500 }),
  })
  expect(await fire('run', inst, '{}')).toEqual({ status: 500 })
})

test('a hook that exceeds its timeout is aborted and reported as timedOut (not null)', async () => {
  const fire = createHookFirer({
    enabledHooks: new Set(['run']),
    hookTimeouts: { run: 25 }, // per-hook deadline (ms)
    // Never resolves on its own; only settles when the deadline aborts the request.
    fetchImpl: (url, init) =>
      new Promise((_resolve, reject) => {
        init.signal.addEventListener('abort', () =>
          reject(Object.assign(new Error('aborted'), { name: 'AbortError' })),
        )
      }),
  })
  // A timeout is a distinct outcome from a non-delivery (null) so the gate can
  // treat it as a failure, mirroring how AWS terminates on a run-hook timeout.
  await expect(fire('run', inst, '{}')).resolves.toEqual({ timedOut: true })
})

test('resolveHookTimeouts: explicit { timeout } overrides; otherwise the AWS default (ms)', () => {
  const t = resolveHookTimeouts({ ready: true, run: { timeout: 5 } })
  expect(t.run).toBe(5000) // explicit 5s → ms
  expect(t.ready).toBe(60000) // AWS default 60s
  expect(t.resume).toBe(1000) // AWS default 1s
  expect(t.suspend).toBe(1000)
  expect(t.terminate).toBe(1000)
})

test('resolveHookTimeouts: all AWS defaults when nothing is configured', () => {
  const t = resolveHookTimeouts(undefined)
  expect(t).toEqual({
    ready: 60000,
    run: 1000,
    resume: 1000,
    suspend: 1000,
    terminate: 1000,
  })
})

test('passes an abort signal on the request init', async () => {
  let seenInit
  const fire = createHookFirer({
    enabledHooks: new Set(['ready']),
    fetchImpl: async (url, init) => {
      seenInit = init
      return new Response('{}')
    },
  })
  await fire('ready', inst)
  expect(seenInit.signal).toBeInstanceOf(AbortSignal)
})
