/**
 * Emits both canonical and legacy lifecycle events at each offline boot
 * moment. The legacy event names exist so bundler plugins and other
 * downstream listeners that hooked the community `serverless-offline`
 * plugin's events keep working unchanged.
 *
 * @param {object} pluginManager - Framework's plugin manager; must expose
 *   `spawn(eventName)` returning a Promise.
 */
export function createHookBridge(pluginManager) {
  const emit = async (...eventNames) => {
    for (const name of eventNames) {
      await pluginManager.spawn(name)
    }
  }

  return {
    fireBeforeStart: () =>
      emit('before:offline:offline', 'before:offline:start'),
    fireStart: () =>
      emit('offline:offline', 'offline:start', 'offline:start:init'),
    fireReady: () => emit('offline:start:ready'),
    fireEnd: () =>
      emit('after:offline:offline', 'after:offline:start', 'offline:start:end'),
    fireFunctionsUpdated: () => emit('offline:functionsUpdated:cleanup'),
  }
}
