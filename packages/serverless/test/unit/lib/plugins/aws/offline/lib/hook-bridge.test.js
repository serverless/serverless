import { jest } from '@jest/globals'
import { createHookBridge } from '../../../../../../../lib/plugins/aws/offline/lib/hook-bridge.js'

const makePluginManager = () => {
  const calls = []
  return {
    calls,
    spawn: jest.fn(async (event) => {
      calls.push(event)
    }),
  }
}

describe('createHookBridge', () => {
  it('fireBeforeStart emits canonical + legacy before-events in order', async () => {
    const pm = makePluginManager()
    const bridge = createHookBridge(pm)
    await bridge.fireBeforeStart()
    expect(pm.calls).toEqual(['before:offline:offline', 'before:offline:start'])
  })

  it('fireStart emits offline:offline, offline:start, offline:start:init', async () => {
    const pm = makePluginManager()
    const bridge = createHookBridge(pm)
    await bridge.fireStart()
    expect(pm.calls).toEqual([
      'offline:offline',
      'offline:start',
      'offline:start:init',
    ])
  })

  it('fireReady emits offline:start:ready', async () => {
    const pm = makePluginManager()
    const bridge = createHookBridge(pm)
    await bridge.fireReady()
    expect(pm.calls).toEqual(['offline:start:ready'])
  })

  it('fireEnd emits after:offline:offline, after:offline:start, offline:start:end', async () => {
    const pm = makePluginManager()
    const bridge = createHookBridge(pm)
    await bridge.fireEnd()
    expect(pm.calls).toEqual([
      'after:offline:offline',
      'after:offline:start',
      'offline:start:end',
    ])
  })

  it('fireFunctionsUpdated emits offline:functionsUpdated:cleanup', async () => {
    const pm = makePluginManager()
    const bridge = createHookBridge(pm)
    await bridge.fireFunctionsUpdated()
    expect(pm.calls).toEqual(['offline:functionsUpdated:cleanup'])
  })

  it('awaits each spawn call in sequence', async () => {
    const pm = makePluginManager()
    let resolveFirst
    pm.spawn = jest.fn(async (event) => {
      pm.calls.push(`enter:${event}`)
      if (event === 'before:offline:offline') {
        await new Promise((r) => {
          resolveFirst = r
        })
      }
      pm.calls.push(`exit:${event}`)
    })
    const bridge = createHookBridge(pm)
    const finished = bridge.fireBeforeStart()
    // first call entered but not exited
    expect(pm.calls).toEqual(['enter:before:offline:offline'])
    resolveFirst()
    await finished
    expect(pm.calls).toEqual([
      'enter:before:offline:offline',
      'exit:before:offline:offline',
      'enter:before:offline:start',
      'exit:before:offline:start',
    ])
  })
})
