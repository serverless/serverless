import { jest } from '@jest/globals'
import { createHookBridge } from '../../../../../../../lib/plugins/aws/offline/lib/hook-bridge.js'

const makePluginManager = (eventsWithListeners = []) => {
  const calls = []
  const hooks = {}
  // Pre-register an empty array per event we care about — runHooks is called
  // only when the array has at least one entry.
  for (const name of eventsWithListeners) {
    hooks[name] = [{ pluginName: 'test', hook: () => {} }]
  }
  return {
    calls,
    hooks,
    runHooks: jest.fn(async (eventName) => {
      calls.push(eventName)
    }),
  }
}

describe('createHookBridge', () => {
  it('fireInit fires before:/at/after offline:start:init in order', async () => {
    const pm = makePluginManager([
      'before:offline:start:init',
      'offline:start:init',
      'after:offline:start:init',
    ])
    await createHookBridge(pm).fireInit()
    expect(pm.calls).toEqual([
      'before:offline:start:init',
      'offline:start:init',
      'after:offline:start:init',
    ])
  })

  it('fireReady fires before:/at/after offline:start:ready in order', async () => {
    const pm = makePluginManager([
      'before:offline:start:ready',
      'offline:start:ready',
      'after:offline:start:ready',
    ])
    await createHookBridge(pm).fireReady()
    expect(pm.calls).toEqual([
      'before:offline:start:ready',
      'offline:start:ready',
      'after:offline:start:ready',
    ])
  })

  it('fireEnd fires before:/at/after offline:start:end in order', async () => {
    const pm = makePluginManager([
      'before:offline:start:end',
      'offline:start:end',
      'after:offline:start:end',
    ])
    await createHookBridge(pm).fireEnd()
    expect(pm.calls).toEqual([
      'before:offline:start:end',
      'offline:start:end',
      'after:offline:start:end',
    ])
  })

  it('fireFunctionsUpdated fires offline:functionsUpdated:cleanup', async () => {
    const pm = makePluginManager(['offline:functionsUpdated:cleanup'])
    await createHookBridge(pm).fireFunctionsUpdated()
    expect(pm.calls).toEqual(['offline:functionsUpdated:cleanup'])
  })

  it('never fires the bare offline:start lifecycle events', async () => {
    const pm = makePluginManager([
      'before:offline:start',
      'offline:start',
      'after:offline:start',
    ])
    const bridge = createHookBridge(pm)
    await bridge.fireInit()
    await bridge.fireReady()
    await bridge.fireEnd()
    expect(pm.calls).not.toContain('before:offline:start')
    expect(pm.calls).not.toContain('offline:start')
    expect(pm.calls).not.toContain('after:offline:start')
    expect(pm.runHooks).not.toHaveBeenCalled()
  })

  it('does NOT fire canonical events (framework handles those)', async () => {
    const pm = makePluginManager([
      'before:offline:offline',
      'offline:offline',
      'after:offline:offline',
    ])
    const bridge = createHookBridge(pm)
    await bridge.fireInit()
    await bridge.fireReady()
    await bridge.fireEnd()
    expect(pm.calls).not.toContain('before:offline:offline')
    expect(pm.calls).not.toContain('offline:offline')
    expect(pm.calls).not.toContain('after:offline:offline')
  })

  it('emits no event name more than once across a full init→ready→end run', async () => {
    const pm = makePluginManager([
      'before:offline:start:init',
      'offline:start:init',
      'after:offline:start:init',
      'before:offline:start:ready',
      'offline:start:ready',
      'after:offline:start:ready',
      'before:offline:start:end',
      'offline:start:end',
      'after:offline:start:end',
    ])
    const bridge = createHookBridge(pm)
    await bridge.fireInit()
    await bridge.fireReady()
    await bridge.fireEnd()
    const unique = new Set(pm.calls)
    expect(unique.size).toBe(pm.calls.length)
    expect(pm.calls).toEqual([
      'before:offline:start:init',
      'offline:start:init',
      'after:offline:start:init',
      'before:offline:start:ready',
      'offline:start:ready',
      'after:offline:start:ready',
      'before:offline:start:end',
      'offline:start:end',
      'after:offline:start:end',
    ])
  })

  it('no-ops silently when no listener is registered for an event', async () => {
    const pm = makePluginManager([]) // no events registered
    await createHookBridge(pm).fireInit()
    expect(pm.runHooks).not.toHaveBeenCalled()
    expect(pm.calls).toEqual([])
  })

  it('awaits each runHooks call in sequence', async () => {
    const pm = makePluginManager([
      'before:offline:start:init',
      'offline:start:init',
    ])
    let resolveFirst
    pm.runHooks = jest.fn(async (eventName) => {
      pm.calls.push(`enter:${eventName}`)
      if (eventName === 'before:offline:start:init') {
        await new Promise((r) => {
          resolveFirst = r
        })
      }
      pm.calls.push(`exit:${eventName}`)
    })
    const finished = createHookBridge(pm).fireInit()
    expect(pm.calls).toEqual(['enter:before:offline:start:init'])
    resolveFirst()
    await finished
    expect(pm.calls).toEqual([
      'enter:before:offline:start:init',
      'exit:before:offline:start:init',
      'enter:offline:start:init',
      'exit:offline:start:init',
    ])
  })
})
