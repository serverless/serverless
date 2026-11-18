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
  await expect(inst.hooks['invoke:invoke']()).rejects.toMatchObject({
    code: 'INVOKE_MUTUAL_EXCLUSIVITY',
    stack: undefined,
  })
})

test('an error response and access denied throw without a stack trace', async () => {
  global.fetch = jest.fn(async () => ({ status: 500, text: async () => '' }))
  const write = jest.spyOn(process.stdout, 'write').mockReturnValue(true)
  try {
    const inst = makeInstance({ sandbox: 'echo' }, { echo: {} })
    await expect(inst.hooks['invoke:invoke']()).rejects.toMatchObject({
      code: 'SANDBOX_INVOKE_HTTP_ERROR',
      stack: undefined,
    })
    dataplane.runMicrovm.mockRejectedValueOnce(
      Object.assign(new Error('denied'), { name: 'AccessDeniedException' }),
    )
    await expect(inst.hooks['invoke:invoke']()).rejects.toMatchObject({
      code: 'SANDBOX_INVOKE_ACCESS_DENIED',
      stack: undefined,
    })
  } finally {
    write.mockRestore()
  }
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

test('sends each --header with the request, next to the proxy headers', async () => {
  global.fetch = jest.fn(async () => ({ status: 200, text: async () => 'ok' }))
  const write = jest.spyOn(process.stdout, 'write').mockReturnValue(true)
  try {
    const inst = makeInstance(
      {
        sandbox: 'echo',
        method: 'POST',
        data: '{"a":1}',
        header: ['Content-Type: application/json', 'X-Trace: abc'],
      },
      { echo: {} },
    )
    await inst.hooks['invoke:invoke']()
  } finally {
    write.mockRestore()
  }
  const [, init] = global.fetch.mock.calls[0]
  expect(init.body).toBe('{"a":1}')
  expect(init.headers).toEqual({
    'content-type': 'application/json',
    'x-trace': 'abc',
    'X-aws-proxy-auth': 'JWE',
    'X-aws-proxy-port': '8080',
  })
})

test.each([
  [
    'X-Aws-Proxy-Auth: token',
    'INVOKE_RESERVED_HEADER',
    '--header cannot set X-Aws-Proxy-Auth: the Framework sets it to reach the sandbox through the AWS proxy.',
  ],
  [
    'x-aws-proxy-port: 1',
    'INVOKE_RESERVED_HEADER',
    '--header cannot set x-aws-proxy-port: the Framework sets it to reach the sandbox through the AWS proxy.',
  ],
  [
    'Host: example.com',
    'INVOKE_RESERVED_HEADER',
    "--header cannot set Host: the Framework sets it from the sandbox's endpoint.",
  ],
  [
    'no-colon',
    'INVOKE_INVALID_HEADER',
    "Each --header must be one line in the form 'Name: value', for example --header 'Content-Type: application/json'.",
  ],
  [
    'X-Name: żółw',
    'INVOKE_INVALID_HEADER',
    'The --header X-Name value must be printable ASCII text. Encode other characters first, for example with encodeURIComponent.',
  ],
])(
  'stops on --header %p before starting an instance',
  async (header, code, message) => {
    global.fetch = jest.fn()
    const inst = makeInstance(
      { sandbox: 'echo', header: [header] },
      { echo: {} },
    )
    await expect(inst.hooks['invoke:invoke']()).rejects.toMatchObject({
      code,
      message,
      stack: undefined,
    })
    expect(dataplane.runMicrovm).not.toHaveBeenCalled()
    expect(global.fetch).not.toHaveBeenCalled()
  },
)
