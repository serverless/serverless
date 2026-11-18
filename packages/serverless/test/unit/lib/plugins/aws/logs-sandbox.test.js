import { jest } from '@jest/globals'

const send = jest.fn(async () => ({
  events: [{ timestamp: 1, message: 'hello' }],
  nextToken: undefined,
}))
jest.unstable_mockModule('@aws-sdk/client-cloudwatch-logs', () => ({
  CloudWatchLogsClient: class {
    send = send
  },
  FilterLogEventsCommand: class {
    constructor(input) {
      this.input = input
    }
  },
}))
const { default: AwsLogsSandbox } =
  await import('../../../../../lib/plugins/aws/logs-sandbox.js')

function makeInstance(options, sandboxes) {
  const serverless = {
    service: { service: 'svc', sandboxes },
    getProvider: () => ({
      getRegion: () => 'us-east-1',
      getStage: () => 'dev',
      getCredentials: async () => ({ credentials: {} }),
    }),
  }
  return new AwsLogsSandbox(serverless, options, {
    log: { notice() {}, error() {} },
  })
}

beforeEach(() => jest.clearAllMocks())

test('no-op when --sandbox not set', async () => {
  const inst = makeInstance({}, { echo: {} })
  await inst.hooks['logs:logs']()
  expect(send).not.toHaveBeenCalled()
})

test('derives the /aws/lambda-microvms/<name> log group', () => {
  const inst = makeInstance({ sandbox: 'echo' }, { echo: {} })
  expect(inst.logGroupName('echo')).toBe('/aws/lambda-microvms/svc-echo-dev')
})

test('filters + prints events for the resolved sandbox', async () => {
  const inst = makeInstance({ sandbox: 'echo' }, { echo: {} })
  await inst.hooks['logs:logs']()
  expect(send).toHaveBeenCalled()
  expect(send.mock.calls[0][0].input.logGroupName).toBe(
    '/aws/lambda-microvms/svc-echo-dev',
  )
})

// M1 — resolveTarget must require a non-empty string sandbox name
test('resolveTarget throws with clear message when --sandbox is missing', () => {
  const inst = makeInstance({ sandbox: undefined }, { echo: {} })
  expect(() => inst.resolveTarget()).toThrow(/--sandbox <name>/i)
})

test('resolveTarget throws listing available names when --sandbox is missing', () => {
  const inst = makeInstance({ sandbox: undefined }, { alpha: {}, beta: {} })
  expect(() => inst.resolveTarget()).toThrow(/alpha, beta/)
})

test('resolveTarget throws SANDBOX_NOT_FOUND for an unknown name', () => {
  const inst = makeInstance({ sandbox: 'nope' }, { echo: {} })
  expect(() => inst.resolveTarget()).toThrow(/not found/i)
})

const thrownBy = (fn) => {
  try {
    fn()
  } catch (error) {
    return error
  }
  throw new Error('expected an error')
}

test.each([
  ['NO_SANDBOXES_DEFINED', { sandbox: 'echo' }, {}],
  ['SANDBOX_NAME_REQUIRED', { sandbox: true }, { echo: {} }],
  ['SANDBOX_NOT_FOUND', { sandbox: 'nope' }, { echo: {} }],
])(
  'resolveTarget throws %s without a stack trace',
  (code, options, sandboxes) => {
    const error = thrownBy(() =>
      makeInstance(options, sandboxes).resolveTarget(),
    )
    expect(error).toMatchObject({ code, stack: undefined })
  },
)

test('--sandbox with --function throws without a stack trace', async () => {
  const inst = makeInstance({ sandbox: 'echo', function: 'f' }, { echo: {} })
  await expect(inst.hooks['logs:logs']()).rejects.toMatchObject({
    code: 'LOGS_MUTUAL_EXCLUSIVITY',
    stack: undefined,
  })
})

test('a missing log group throws without a stack trace', async () => {
  send.mockRejectedValueOnce(
    Object.assign(new Error('gone'), { name: 'ResourceNotFoundException' }),
  )
  const inst = makeInstance({ sandbox: 'echo' }, { echo: {} })
  await expect(inst.hooks['logs:logs']()).rejects.toMatchObject({
    code: 'SANDBOX_LOG_GROUP_NOT_FOUND',
    stack: undefined,
  })
})

// I2 — --startTime is honored and passed through to FilterLogEventsCommand
test('uses default 10-min window when --startTime is absent', async () => {
  const before = Date.now()
  const inst = makeInstance({ sandbox: 'echo' }, { echo: {} })
  await inst.hooks['logs:logs']()
  const usedStartTime = send.mock.calls[0][0].input.startTime
  // Should be within ~10 min + a small buffer of the current time
  expect(usedStartTime).toBeGreaterThanOrEqual(before - 10 * 60 * 1000 - 2000)
  expect(usedStartTime).toBeLessThanOrEqual(Date.now())
})

test('honors --startTime relative duration (e.g. 1h)', async () => {
  const before = Date.now()
  const inst = makeInstance({ sandbox: 'echo', startTime: '1h' }, { echo: {} })
  await inst.hooks['logs:logs']()
  const usedStartTime = send.mock.calls[0][0].input.startTime
  // Should be ~1 hour ago (within a small buffer)
  const oneHourAgo = before - 60 * 60 * 1000
  expect(usedStartTime).toBeGreaterThanOrEqual(oneHourAgo - 2000)
  expect(usedStartTime).toBeLessThanOrEqual(Date.now())
})

test('honors --startTime absolute ISO timestamp', async () => {
  const isoTime = '2025-01-01T00:00:00Z'
  const expectedMs = new Date(isoTime).getTime()
  const inst = makeInstance(
    { sandbox: 'echo', startTime: isoTime },
    { echo: {} },
  )
  await inst.hooks['logs:logs']()
  const usedStartTime = send.mock.calls[0][0].input.startTime
  expect(usedStartTime).toBe(expectedMs)
})
