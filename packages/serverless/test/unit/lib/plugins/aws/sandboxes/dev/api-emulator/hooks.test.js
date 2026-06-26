// hooks.test.js
import {
  createHookFirer,
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
  expect(await fire('ready', inst)).toBe(true) // delivered
  expect(await fire('run', inst, '{"x":1}')).toBe(true)
  expect(await fire('suspend', inst)).toBe(false) // not enabled → skipped
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
  expect(await fire('ready', { microvmId: 'x', portMap: {} })).toBe(false) // no 9000 port
  expect(await fire('terminate', inst)).toBe(false) // not enabled
  expect(called).toBe(false)
})

test('hook failure is swallowed (best-effort, never throws) and reports false', async () => {
  const fire = createHookFirer({
    enabledHooks: new Set(['terminate']),
    fetchImpl: async () => {
      throw new Error('down')
    },
  })
  await expect(fire('terminate', inst)).resolves.toBe(false)
})
