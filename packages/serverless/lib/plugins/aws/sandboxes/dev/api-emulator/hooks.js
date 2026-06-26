'use strict'

export const HOOK_PATH = '/aws/lambda-microvms/runtime/v1'

export function createHookFirer({
  enabledHooks = new Set(),
  hookPort = 9000,
  fetchImpl = fetch,
  logger,
} = {}) {
  // Returns true if the hook was actually delivered (enabled + a reachable port + the POST
  // succeeded), false otherwise — so callers can report exactly which hooks fired.
  return async function fire(name, instance, runHookPayload) {
    if (!enabledHooks.has(name)) return false
    const hostPort = instance?.portMap?.[hookPort]
    if (!hostPort) return false
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
      await fetchImpl(`http://127.0.0.1:${hostPort}${HOOK_PATH}/${name}`, init)
      return true
    } catch (err) {
      logger?.debug?.(`hook '${name}' failed: ${err.message}`)
      return false
    }
  }
}
