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
  it('fireBeforeStart fires the legacy before:offline:start event', async () => {
    const pm = makePluginManager(['before:offline:start'])
    await createHookBridge(pm).fireBeforeStart()
    expect(pm.calls).toEqual(['before:offline:start'])
  })

  it('fireStart fires legacy offline:start then offline:start:init', async () => {
    const pm = makePluginManager(['offline:start', 'offline:start:init'])
    await createHookBridge(pm).fireStart()
    expect(pm.calls).toEqual(['offline:start', 'offline:start:init'])
  })

  it('fireReady fires legacy offline:start:ready', async () => {
    const pm = makePluginManager(['offline:start:ready'])
    await createHookBridge(pm).fireReady()
    expect(pm.calls).toEqual(['offline:start:ready'])
  })

  it('fireEnd fires legacy offline:start:end then after:offline:start', async () => {
    const pm = makePluginManager(['offline:start:end', 'after:offline:start'])
    await createHookBridge(pm).fireEnd()
    expect(pm.calls).toEqual(['offline:start:end', 'after:offline:start'])
  })

  it('fireFunctionsUpdated fires legacy offline:functionsUpdated:cleanup', async () => {
    const pm = makePluginManager(['offline:functionsUpdated:cleanup'])
    await createHookBridge(pm).fireFunctionsUpdated()
    expect(pm.calls).toEqual(['offline:functionsUpdated:cleanup'])
  })

  it('does NOT fire canonical events (framework handles those)', async () => {
    const pm = makePluginManager([
      'before:offline:offline',
      'offline:offline',
      'after:offline:offline',
    ])
    const bridge = createHookBridge(pm)
    await bridge.fireBeforeStart()
    await bridge.fireStart()
    await bridge.fireReady()
    await bridge.fireEnd()
    expect(pm.calls).not.toContain('before:offline:offline')
    expect(pm.calls).not.toContain('offline:offline')
    expect(pm.calls).not.toContain('after:offline:offline')
  })

  it('no-ops silently when no listener is registered for an event', async () => {
    const pm = makePluginManager([]) // no events registered
    await createHookBridge(pm).fireBeforeStart()
    expect(pm.runHooks).not.toHaveBeenCalled()
    expect(pm.calls).toEqual([])
  })

  it('awaits each runHooks call in sequence', async () => {
    const pm = makePluginManager(['offline:start', 'offline:start:init'])
    let resolveFirst
    pm.runHooks = jest.fn(async (eventName) => {
      pm.calls.push(`enter:${eventName}`)
      if (eventName === 'offline:start') {
        await new Promise((r) => {
          resolveFirst = r
        })
      }
      pm.calls.push(`exit:${eventName}`)
    })
    const finished = createHookBridge(pm).fireStart()
    expect(pm.calls).toEqual(['enter:offline:start'])
    resolveFirst()
    await finished
    expect(pm.calls).toEqual([
      'enter:offline:start',
      'exit:offline:start',
      'enter:offline:start:init',
      'exit:offline:start:init',
    ])
  })
})
