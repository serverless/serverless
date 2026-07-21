import { jest } from '@jest/globals'

// Mock the router so we can inject a runner stub with a controlled
// getServiceUniqueId() behavior.
const mockGetRunner = jest.fn()
jest.unstable_mockModule('../../../../../src/lib/router.js', () => ({
  getRunner: mockGetRunner,
}))

const { resolveConfigAndGetState } =
  await import('../../../../../src/lib/runners/compose/state.js')

// Minimal runner stub. `runnerType` is read via `runner.constructor.runnerType`,
// so it lives on the class as a static.
class FakeRunner {
  static runnerType = 'aws'
  constructor(getServiceUniqueId) {
    this.getServiceUniqueId = getServiceUniqueId
  }
}

const callResolve = ({ getServiceUniqueId, getServiceState }) => {
  mockGetRunner.mockResolvedValue({
    runner: new FakeRunner(getServiceUniqueId),
  })
  return resolveConfigAndGetState({
    command: ['get-state'],
    options: {},
    compose: {},
    state: { getServiceState },
  })
}

describe('compose/state resolveConfigAndGetState', () => {
  afterEach(() => {
    jest.clearAllMocks()
  })

  test('tolerates a not-yet-deployed dependency (STACK_DOES_NOT_EXIST sentinel) as no-state', async () => {
    // A first-run subset get-state pass reads dependencies that are not deployed
    // yet. getServiceUniqueId throws a STACK_DOES_NOT_EXIST-coded sentinel for an
    // absent stack (see runners/framework.js) — that is the expected "no state"
    // case, not a failure.
    const sentinel = new Error('Stack foo-dev does not exist')
    sentinel.code = 'STACK_DOES_NOT_EXIST'
    await expect(
      callResolve({
        getServiceUniqueId: jest.fn().mockRejectedValue(sentinel),
        getServiceState: jest.fn(),
      }),
    ).resolves.toBeUndefined()
  })

  test('re-throws a non-stack "does not exist" error (message alone is not treated as no-state)', async () => {
    // Only the coded sentinel means "not deployed". An unrelated error whose
    // message happens to contain "does not exist" (S3 bucket, org, etc.) is a
    // real failure and must propagate.
    await expect(
      callResolve({
        getServiceUniqueId: jest
          .fn()
          .mockRejectedValue(new Error('The specified bucket does not exist')),
        getServiceState: jest.fn(),
      }),
    ).rejects.toThrow('The specified bucket does not exist')
  })

  test('re-throws any other error from getServiceUniqueId (does not swallow real failures)', async () => {
    await expect(
      callResolve({
        getServiceUniqueId: jest
          .fn()
          .mockRejectedValue(new Error('ThrottlingException: Rate exceeded')),
        getServiceState: jest.fn(),
      }),
    ).rejects.toThrow('ThrottlingException: Rate exceeded')
  })

  test('returns undefined when the stack exists but no service state is stored', async () => {
    await expect(
      callResolve({
        getServiceUniqueId: jest
          .fn()
          .mockResolvedValue({ serviceUniqueId: 'foo-dev' }),
        getServiceState: jest.fn().mockResolvedValue(undefined),
      }),
    ).resolves.toBeUndefined()
  })

  test('returns the fetched state when it exists', async () => {
    const fetchedState = { outputs: { TopicArn: 'arn:aws:sns:...' } }
    await expect(
      callResolve({
        getServiceUniqueId: jest
          .fn()
          .mockResolvedValue({ serviceUniqueId: 'foo-dev' }),
        getServiceState: jest.fn().mockResolvedValue(fetchedState),
      }),
    ).resolves.toEqual({ state: fetchedState })
  })
})
