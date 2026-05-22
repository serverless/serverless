import { jest } from '@jest/globals'
import { createOrchestrator } from '../../../../../../../lib/plugins/aws/offline/lib/orchestrator.js'

describe('createOrchestrator', () => {
  it('start() resolves after onReady() callback returns', async () => {
    const onReady = jest.fn()
    const o = createOrchestrator({ logger: { notice: jest.fn() } })
    await o.start({ onReady })
    expect(onReady).toHaveBeenCalledTimes(1)
  })

  it('shutdown() runs registered teardown callbacks in reverse-registration order', async () => {
    const calls = []
    const o = createOrchestrator({ logger: { notice: jest.fn() } })
    o.onShutdown(async () => calls.push('a'))
    o.onShutdown(async () => calls.push('b'))
    o.onShutdown(async () => calls.push('c'))
    await o.shutdown()
    expect(calls).toEqual(['c', 'b', 'a'])
  })

  it('shutdown() is idempotent', async () => {
    const teardown = jest.fn()
    const o = createOrchestrator({ logger: { notice: jest.fn() } })
    o.onShutdown(teardown)
    await o.shutdown()
    await o.shutdown()
    expect(teardown).toHaveBeenCalledTimes(1)
  })

  it('logs starting / ready / stopping at the right moments', async () => {
    const notice = jest.fn()
    const o = createOrchestrator({ logger: { notice } })
    await o.start({ onReady: () => {} })
    await o.shutdown()
    expect(notice).toHaveBeenCalledWith('starting')
    expect(notice).toHaveBeenCalledWith('ready')
    expect(notice).toHaveBeenCalledWith('stopping')
  })

  it('continues teardown even if one callback throws, and rethrows the first error after', async () => {
    const calls = []
    const o = createOrchestrator({ logger: { notice: jest.fn() } })
    o.onShutdown(async () => {
      calls.push('a')
    })
    o.onShutdown(async () => {
      calls.push('boom')
      throw new Error('boom')
    })
    o.onShutdown(async () => {
      calls.push('c')
    })
    await expect(o.shutdown()).rejects.toThrow('boom')
    expect(calls).toEqual(['c', 'boom', 'a'])
  })
})
