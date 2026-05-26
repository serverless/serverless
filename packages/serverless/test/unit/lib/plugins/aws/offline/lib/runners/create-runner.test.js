import { jest } from '@jest/globals'

// Mock both factories before importing the SUT so the dispatch helper
// picks up the spies (jest.unstable_mockModule is the ESM-safe path —
// regular jest.mock cannot intercept dynamic imports at runtime).
const inProcessFactory = jest.fn(() => ({
  invoke: jest.fn(),
  invalidate: jest.fn(),
  terminate: jest.fn(),
}))
const workerThreadFactory = jest.fn(() => ({
  invoke: jest.fn(),
  invalidate: jest.fn(),
  terminate: jest.fn(),
}))

jest.unstable_mockModule(
  '../../../../../../../../lib/plugins/aws/offline/lib/runners/in-process.js',
  () => ({ createInProcessRunner: inProcessFactory }),
)
jest.unstable_mockModule(
  '../../../../../../../../lib/plugins/aws/offline/lib/runners/worker-thread.js',
  () => ({ createWorkerThreadRunner: workerThreadFactory }),
)

const { createRunner } =
  await import('../../../../../../../../lib/plugins/aws/offline/lib/runners/create-runner.js')

describe('createRunner', () => {
  beforeEach(() => {
    inProcessFactory.mockClear()
    workerThreadFactory.mockClear()
  })

  it('uses createInProcessRunner when useInProcess is true', () => {
    createRunner({ useInProcess: true, terminateIdleLambdaTime: 60 })

    expect(inProcessFactory).toHaveBeenCalledTimes(1)
    expect(inProcessFactory).toHaveBeenCalledWith()
    expect(workerThreadFactory).not.toHaveBeenCalled()
  })

  it('uses createWorkerThreadRunner when useInProcess is false and forwards terminateIdleLambdaTime', () => {
    createRunner({ useInProcess: false, terminateIdleLambdaTime: 60 })

    expect(workerThreadFactory).toHaveBeenCalledTimes(1)
    expect(workerThreadFactory).toHaveBeenCalledWith({
      servicePath: '',
      terminateIdleLambdaTime: 60,
    })
    expect(inProcessFactory).not.toHaveBeenCalled()
  })
})
