import { jest } from '@jest/globals'

const dataplane = {
  makeClient: jest.fn(async () => ({})),
  resolveSandboxOutputs: jest.fn(async () => ({
    imageIdentifier: 'arn:img',
    executionRoleArn: 'arn:role',
    connectorArn: undefined,
  })),
  runMicrovm: jest.fn(async () => ({
    microvmId: 'mv-1',
    endpoint: 'host.example',
    state: 'PENDING',
  })),
  waitUntilRunning: jest.fn(async () => ({
    state: 'RUNNING',
    endpoint: 'host.example',
  })),
  createAuthToken: jest.fn(async () => 'JWE'),
  terminateMicrovm: jest.fn(async () => {}),
}
jest.unstable_mockModule(
  '../../../../../lib/plugins/aws/sandboxes/runtime/dataplane.js',
  () => dataplane,
)

const { default: AwsInvokeSandbox } =
  await import('../../../../../lib/plugins/aws/invoke-sandbox.js')

beforeEach(() => jest.clearAllMocks())

function makeInstance(options, sandboxes) {
  const serverless = {
    service: { sandboxes },
    getProvider: () => ({
      getRegion: () => 'us-east-1',
      getCredentials: async () => ({ credentials: {} }),
      naming: { getStackName: () => 'svc-dev' },
    }),
  }
  return new AwsInvokeSandbox(serverless, options, {
    log: { error() {}, debug() {} },
    progress: { notice() {}, remove() {} },
  })
}

test('does nothing when --sandbox is not set', async () => {
  const inst = makeInstance({}, { echo: { artifact: './app' } })
  await inst.hooks['invoke:invoke']()
  expect(dataplane.runMicrovm).not.toHaveBeenCalled()
})

test('resolveTarget throws with clear message when --sandbox is missing', () => {
  const inst = makeInstance(
    { sandbox: undefined },
    { only: { artifact: './a' } },
  )
  expect(() => inst.resolveTarget()).toThrow(/--sandbox <name>/i)
})

test('resolveTarget throws with available names when --sandbox is missing', () => {
  const inst = makeInstance({ sandbox: undefined }, { a: {}, b: {} })
  expect(() => inst.resolveTarget()).toThrow(/a, b/)
})

test('resolveTarget throws when the named sandbox is unknown', () => {
  const inst = makeInstance({ sandbox: 'nope' }, { echo: {} })
  expect(() => inst.resolveTarget()).toThrow(/not found/i)
})

test('full round-trip runs, tokens, fetches, prints, and always terminates', async () => {
  global.fetch = jest.fn(async () => ({
    status: 200,
    text: async () => '{"ok":true}',
  }))
  const inst = makeInstance(
    { sandbox: 'echo', path: '/hello', port: 8080 },
    { echo: { artifact: './app' } },
  )
  await inst.hooks['invoke:invoke']()
  expect(dataplane.runMicrovm).toHaveBeenCalled()
  expect(global.fetch).toHaveBeenCalledWith(
    'https://host.example/hello',
    expect.objectContaining({
      headers: expect.objectContaining({
        'X-aws-proxy-auth': 'JWE',
        'X-aws-proxy-port': '8080',
      }),
    }),
  )
  // auto-terminate always runs (logger passed as third arg for M4 warn)
  expect(dataplane.terminateMicrovm).toHaveBeenCalledWith(
    expect.anything(),
    'mv-1',
    expect.anything(),
  )
})

test('honors an http:// endpoint (local dev emulator) instead of forcing https', async () => {
  // The dev emulator returns a full http://127.0.0.1:<port> URL; invoke must use it as-is,
  // not build https://http://… (which fails to connect).
  dataplane.waitUntilRunning.mockResolvedValueOnce({
    state: 'RUNNING',
    endpoint: 'http://127.0.0.1:9100',
  })
  global.fetch = jest.fn(async () => ({
    status: 200,
    text: async () => 'ok',
  }))
  const inst = makeInstance(
    { sandbox: 'echo', path: '/health', port: 8080 },
    { echo: { artifact: './app' } },
  )
  await inst.hooks['invoke:invoke']()
  expect(global.fetch).toHaveBeenCalledWith(
    'http://127.0.0.1:9100/health',
    expect.anything(),
  )
})

test('terminates even when the HTTP request throws', async () => {
  global.fetch = jest.fn(async () => {
    throw new Error('network')
  })
  const inst = makeInstance({ sandbox: 'echo' }, { echo: {} })
  await expect(inst.hooks['invoke:invoke']()).rejects.toThrow()
  expect(dataplane.terminateMicrovm).toHaveBeenCalledWith(
    expect.anything(),
    'mv-1',
    expect.anything(),
  )
})
