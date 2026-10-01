// detectAgent() runs before every command, so it must always settle: a library check that never
// settles falls back to "not an agent" after a bounded wait, and a failure is remembered (for the
// --debug log) instead of thrown. The library is mocked; each test sets its behaviour.
import { afterEach, beforeEach, expect, jest, test } from '@jest/globals'

let determineAgentImpl
jest.unstable_mockModule('@vercel/detect-agent', () => ({
  determineAgent: (...args) => determineAgentImpl(...args),
}))

const {
  DETECTION_TIMEOUT_MS,
  detectAgent,
  getAgentDetectionError,
  resetAgentDetectionForTests,
} = await import('@serverless/util/src/agent/index.js')

const NOT_AN_AGENT = { isAgent: false, name: undefined }
const never = () => new Promise(() => {})

beforeEach(() => {
  resetAgentDetectionForTests()
})
afterEach(() => {
  jest.useRealTimers()
  jest.restoreAllMocks()
  resetAgentDetectionForTests()
})

test('a check that never settles → not an agent once the timeout passes', async () => {
  determineAgentImpl = never
  const started = Date.now()
  await expect(detectAgent({ timeoutMs: 20 })).resolves.toEqual(NOT_AN_AGENT)
  expect(Date.now() - started).toBeLessThan(1000)
  expect(getAgentDetectionError()?.message).toMatch(/timed out after 20 ms/)
})

test('the default bound is one second', async () => {
  expect(DETECTION_TIMEOUT_MS).toBe(1000)
  jest.useFakeTimers()
  determineAgentImpl = never
  let settled = false
  const detection = detectAgent().then((agent) => {
    settled = true
    return agent
  })
  await jest.advanceTimersByTimeAsync(DETECTION_TIMEOUT_MS - 1)
  expect(settled).toBe(false)
  await jest.advanceTimersByTimeAsync(1)
  await expect(detection).resolves.toEqual(NOT_AN_AGENT)
})

// A timer that does not hold the event loop would let Node exit mid-detection: the command
// would silently not run.
test('the timeout timer keeps the process alive while detection is pending', async () => {
  const setTimeoutSpy = jest.spyOn(globalThis, 'setTimeout')
  determineAgentImpl = never
  const detection = detectAgent({ timeoutMs: 50 })
  const timer = setTimeoutSpy.mock.results.at(-1).value
  expect(timer.hasRef()).toBe(true)
  await detection
})

test('a check that settles clears the timer', async () => {
  jest.useFakeTimers()
  determineAgentImpl = async () => ({
    isAgent: true,
    agent: { name: 'claude' },
  })
  await expect(detectAgent()).resolves.toEqual({
    isAgent: true,
    name: 'claude',
  })
  expect(jest.getTimerCount()).toBe(0)
  expect(getAgentDetectionError()).toBeNull()
})

test('a failing check → not an agent, and the error is remembered', async () => {
  determineAgentImpl = async () => {
    throw new Error('boom')
  }
  await expect(detectAgent()).resolves.toEqual(NOT_AN_AGENT)
  expect(getAgentDetectionError()).toBeInstanceOf(Error)
  expect(getAgentDetectionError().message).toBe('boom')
})

test('a synchronous non-Error throw is remembered as an Error', async () => {
  determineAgentImpl = () => {
    throw 'plain string'
  }
  await expect(detectAgent()).resolves.toEqual(NOT_AN_AGENT)
  expect(getAgentDetectionError().message).toBe('plain string')
})

test('reset clears a remembered error', async () => {
  determineAgentImpl = async () => {
    throw new Error('boom')
  }
  await detectAgent()
  resetAgentDetectionForTests()
  expect(getAgentDetectionError()).toBeNull()
})

test.each([
  ['null options', null],
  ['timeoutMs: Infinity', { timeoutMs: Infinity }],
  ['timeoutMs: 0', { timeoutMs: 0 }],
  ['timeoutMs: NaN', { timeoutMs: NaN }],
  ['timeoutMs: "20"', { timeoutMs: '20' }],
])('%s → the default bound, no warning', async (_label, options) => {
  const emitWarning = jest.spyOn(process, 'emitWarning')
  jest.useFakeTimers()
  determineAgentImpl = never
  let settled = false
  const detection = detectAgent(options).then((agent) => {
    settled = true
    return agent
  })
  await jest.advanceTimersByTimeAsync(DETECTION_TIMEOUT_MS - 1)
  expect(settled).toBe(false)
  await jest.advanceTimersByTimeAsync(1)
  await expect(detection).resolves.toEqual(NOT_AN_AGENT)
  expect(getAgentDetectionError().message).toBe(
    `timed out after ${DETECTION_TIMEOUT_MS} ms`,
  )
  expect(emitWarning).not.toHaveBeenCalled()
})
