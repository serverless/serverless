'use strict'

export const HOOK_PATH = '/aws/lambda-microvms/runtime/v1'

export function createHookFirer({
  enabledHooks = new Set(),
  hookPort = 9000,
  fetchImpl = fetch,
  logger,
} = {}) {
  // Returns { status } when the hook POST completes (so callers can both report which hooks fired
  // AND enforce the platform's non-2xx gate), or null when not delivered (disabled, no :9000 port
  // mapping, or a network error).
  return async function fire(name, instance, runHookPayload) {
    if (!enabledHooks.has(name)) return null
    const hostPort = instance?.portMap?.[hookPort]
    if (!hostPort) return null
    // Live capture (Appendix A): only `run` carries a JSON body + content-type; the empty-body
    // hooks (ready/suspend/resume/terminate) are a bare POST (no content-type).
    const init = { method: 'POST' }
    if (name === 'run') {
      init.headers = { 'content-type': 'application/json' }
      init.body = JSON.stringify({
        microvmId: instance.microvmId,
        runHookPayload: runHookPayload ?? '',
      })
    }
    try {
      const res = await fetchImpl(
        `http://127.0.0.1:${hostPort}${HOOK_PATH}/${name}`,
        init,
      )
      return { status: res.status }
    } catch (err) {
      logger?.debug?.(`hook '${name}' failed: ${err.message}`)
      return null
    }
  }
}
