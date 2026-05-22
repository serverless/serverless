/**
 * Emits legacy lifecycle event names so bundler plugins and other listeners
 * registered on the community `serverless-offline` plugin's events keep
 * working unchanged.
 *
 * Canonical events (`before:offline:offline`, `offline:offline`,
 * `after:offline:offline`) are dispatched by the Framework's invoke loop
 * around our `offline:offline` hook — the bridge must NOT fire them.
 *
 * Hooks are fired via `pluginManager.runHooks(eventName, hooksArray)`,
 * which iterates registered listeners. If no listener is registered for an
 * event, the bridge silently no-ops.
 *
 * @param {object} pluginManager - Framework's plugin manager; must expose
 *   `hooks` (a map of `eventName` to `Array<{ pluginName, hook }>`) and
 *   `runHooks(eventName, hooks)`.
 */
export function createHookBridge(pluginManager) {
  const emit = async (eventName) => {
    const hooks = pluginManager.hooks?.[eventName] || []
    if (hooks.length === 0) return
    await pluginManager.runHooks(eventName, hooks)
  }

  const emitAll = async (...eventNames) => {
    for (const name of eventNames) {
      await emit(name)
    }
  }

  return {
    fireBeforeStart: () => emit('before:offline:start'),
    fireStart: () => emitAll('offline:start', 'offline:start:init'),
    fireReady: () => emit('offline:start:ready'),
    fireEnd: () => emitAll('offline:start:end', 'after:offline:start'),
    fireFunctionsUpdated: () => emit('offline:functionsUpdated:cleanup'),
  }
}
