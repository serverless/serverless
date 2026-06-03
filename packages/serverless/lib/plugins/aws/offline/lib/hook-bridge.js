/**
 * Mirrors the community `serverless-offline` plugin's `offline start`
 * lifecycle so listeners registered on its events keep working unchanged.
 *
 * `offline start` is a regular command, so the Framework runs each of its
 * lifecycle sub-events (`init`, `ready`, `end`) as a before→at→after triplet
 * (see `PluginManager.invoke()`). We reproduce that exact triplet here per
 * sub-event, which means every companion handler lands on precisely one
 * fired event — no gaps and no double-starts.
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

  // Run a lifecycle event as the Framework's invoke loop does: before → at →
  // after (PluginManager.invoke()).
  const emitLifecycle = async (name) => {
    await emit('before:' + name)
    await emit(name)
    await emit('after:' + name)
  }

  return {
    fireInit: () => emitLifecycle('offline:start:init'),
    fireReady: () => emitLifecycle('offline:start:ready'),
    fireEnd: () => emitLifecycle('offline:start:end'),
    fireFunctionsUpdated: () => emit('offline:functionsUpdated:cleanup'),
  }
}
