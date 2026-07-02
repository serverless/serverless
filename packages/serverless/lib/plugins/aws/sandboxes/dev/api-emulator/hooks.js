'use strict'

export const HOOK_PATH = '/aws/lambda-microvms/runtime/v1'

// The AWS platform default timeout for each hook (seconds), applied when the
// user doesn't set an explicit `{ timeout }`. Live-verified against the service:
// `ready` gets 60s; every other hook gets 1s. The framework itself sets no
// timeout on the deployed image, so these are the durations a deployed sandbox
// actually runs under — the emulator mirrors them so dev catches a too-slow
// hook that production would terminate.
const AWS_DEFAULT_TIMEOUT_SEC = {
  ready: 60,
  run: 1,
  resume: 1,
  suspend: 1,
  terminate: 1,
}

/**
 * Resolve the effective per-hook timeout (in ms) the emulator should enforce:
 * the user's explicit `hooks.<name>.timeout` (seconds) when set, otherwise the
 * AWS platform default. Mirrors what a deployed sandbox runs under.
 */
export function resolveHookTimeouts(hooks) {
  const out = {}
  for (const [name, def] of Object.entries(AWS_DEFAULT_TIMEOUT_SEC)) {
    const h = hooks?.[name]
    const explicit =
      h && typeof h === 'object' && h.timeout != null ? h.timeout : undefined
    out[name] = (explicit ?? def) * 1000
  }
  return out
}

export function createHookFirer({
  enabledHooks = new Set(),
  hookPort = 9000,
  fetchImpl = fetch,
  // Per-hook effective timeouts (ms), from resolveHookTimeouts(). Falls back to
  // `hookTimeoutMs` for any hook not present in the map.
  hookTimeouts = {},
  hookTimeoutMs = 10_000,
  logger,
} = {}) {
  // Returns { status } when the hook POST completes (so callers can both report which hooks fired
  // AND enforce the platform's non-2xx gate), or null when not delivered (disabled, no :9000 port
  // mapping, or a network error).
  return async function fire(name, instance, runHookPayload) {
    if (!enabledHooks.has(name)) return null
    const hostPort = instance?.portMap?.[hookPort]
    if (!hostPort) return null
    // Only `run` carries a JSON body + content-type; the empty-body hooks
    // (ready/suspend/resume/terminate) are a bare POST (no content-type).
    const init = { method: 'POST' }
    if (name === 'run') {
      init.headers = { 'content-type': 'application/json' }
      init.body = JSON.stringify({
        microvmId: instance.microvmId,
        runHookPayload: runHookPayload ?? '',
      })
    }
    // Bound each POST by the hook's effective timeout (the user's explicit value
    // or the AWS default), so the emulator terminates a too-slow hook exactly as
    // production would. A timeout is reported as `{ timedOut: true }` — distinct
    // from a non-delivery (`null`) — so the caller's gate can fail the launch,
    // matching AWS's "run hook timed out → TERMINATED" behavior. Other delivery
    // failures stay best-effort `null`.
    const controller = new AbortController()
    const timer = setTimeout(
      () => controller.abort(),
      hookTimeouts[name] ?? hookTimeoutMs,
    )
    init.signal = controller.signal
    try {
      const res = await fetchImpl(
        `http://127.0.0.1:${hostPort}${HOOK_PATH}/${name}`,
        init,
      )
      return { status: res.status }
    } catch (err) {
      if (err?.name === 'AbortError') {
        logger?.debug?.(`hook '${name}' timed out`)
        return { timedOut: true }
      }
      logger?.debug?.(`hook '${name}' failed: ${err.message}`)
      return null
    } finally {
      clearTimeout(timer)
    }
  }
}
