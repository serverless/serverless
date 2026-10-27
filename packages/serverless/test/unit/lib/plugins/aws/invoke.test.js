import { jest } from '@jest/globals'

const { default: AwsInvoke } =
  await import('../../../../../lib/plugins/aws/invoke.js')
const { getPluginWriters } = await import('@serverless/util')
const { default: ServerlessError } =
  await import('../../../../../lib/serverless-error.js')

const createProvider = (overrides = {}) => ({
  getRegion: jest.fn().mockReturnValue('us-east-1'),
  getCredentials: jest.fn().mockResolvedValue({ credentials: {} }),
  naming: { getStackName: jest.fn().mockReturnValue('test-stack') },
  request: jest.fn().mockResolvedValue({}),
  ...overrides,
})

const createServerless = (provider = createProvider()) => ({
  service: { service: 'test-service', provider: { name: 'aws' } },
  getProvider: jest.fn().mockReturnValue(provider),
  serviceDir: '/path/to/service',
  utils: { readFile: jest.fn().mockResolvedValue('{}') },
})

const createMockUtils = () => ({
  log: {
    notice: jest.fn(),
    info: jest.fn(),
    error: jest.fn(),
    blankLine: jest.fn(),
    debug: jest.fn(),
  },
  progress: { notice: jest.fn(), remove: jest.fn() },
})

// Everything written to the real process.stdout and process.stderr while `fn` runs, without
// terminal styling.
const captured = async (fn) => {
  const writes = { stdout: [], stderr: [] }
  const spies = ['stdout', 'stderr'].map((name) =>
    jest.spyOn(process[name], 'write').mockImplementation((chunk) => {
      writes[name].push(String(chunk))
      return true
    }),
  )
  try {
    await fn()
  } finally {
    for (const spy of spies) spy.mockRestore()
  }
  // eslint-disable-next-line no-control-regex
  const plain = (parts) => parts.join('').replace(/\x1b\[[0-9;]*m/g, '')
  return { stdout: plain(writes.stdout), stderr: plain(writes.stderr) }
}

function makeInvokePlugin(options = {}) {
  const serverless = createServerless()
  const pluginUtils = createMockUtils()
  return new AwsInvoke(serverless, options, pluginUtils)
}

describe('AwsInvoke', () => {
  describe('invoke:invoke hook', () => {
    test('throws when neither --function nor --agent nor --sandbox is provided', async () => {
      const inst = makeInvokePlugin({})
      await expect(inst.hooks['invoke:invoke']()).rejects.toThrow(
        /--function|--agent|--sandbox/,
      )
    })

    test('core invoke skips (no throw) when only --sandbox is provided', async () => {
      const inst = makeInvokePlugin({ sandbox: 'echo' })
      // Should not throw the "required options" error, and should not attempt
      // a Lambda invoke (that is handled by the invoke-sandbox plugin).
      await expect(inst.hooks['invoke:invoke']()).resolves.toBeUndefined()
    })

    test('core invoke skips (no throw) when only --agent is provided', async () => {
      const inst = makeInvokePlugin({ agent: 'myAgent' })
      await expect(inst.hooks['invoke:invoke']()).resolves.toBeUndefined()
    })

    test('names --web-app in the missing-option error', async () => {
      const inst = makeInvokePlugin({})
      await expect(inst.hooks['invoke:invoke']()).rejects.toMatchObject({
        code: 'INVOKE_MISSING_OPTION',
        stack: undefined,
        message:
          'One of the required options must be provided: --function (-f), --agent (-a), --sandbox, or --web-app',
      })
    })

    test('core invoke skips (no throw) when only --web-app is provided', async () => {
      const inst = makeInvokePlugin({ 'web-app': 'api' })
      await expect(inst.hooks['invoke:invoke']()).resolves.toBeUndefined()
    })

    test.each([{ function: 'hello' }, { agent: 'a' }, { sandbox: 's' }])(
      'rejects --web-app combined with %p',
      async (other) => {
        const inst = makeInvokePlugin({ 'web-app': 'api', ...other })
        await expect(inst.hooks['invoke:invoke']()).rejects.toMatchObject({
          code: 'INVOKE_MUTUAL_EXCLUSIVITY',
          stack: undefined,
          message:
            'Cannot combine --web-app with --function, --agent or --sandbox.',
        })
      },
    )

    const FUNCTION_ONLY = [
      ['qualifier', '1'],
      ['type', 'Event'],
      ['raw', true],
      ['context', '{}'],
      ['contextPath', 'context.json'],
      ['tenant-id', 'tenant-1'],
      ['durable-execution-name', 'run-1'],
      ['session-id', 's'.repeat(33)],
    ]

    test.each([...FUNCTION_ONLY, ['port', '3000'], ['json', true]])(
      'rejects --%s with --web-app',
      async (flag, value) => {
        const inst = makeInvokePlugin({ 'web-app': 'api', [flag]: value })
        await expect(inst.hooks['invoke:invoke']()).rejects.toMatchObject({
          code: 'INVOKE_OPTION_NOT_AVAILABLE',
          stack: undefined,
          message: `--${flag} is not available with --web-app.`,
        })
      },
    )

    test.each([...FUNCTION_ONLY, ['log', true], ['json', true]])(
      'rejects --%s with --sandbox',
      async (flag, value) => {
        const inst = makeInvokePlugin({ sandbox: 'echo', [flag]: value })
        await expect(inst.hooks['invoke:invoke']()).rejects.toMatchObject({
          code: 'INVOKE_OPTION_NOT_AVAILABLE',
          stack: undefined,
          message: `--${flag} is not available with --sandbox.`,
        })
      },
    )

    test('names every flag that is not available in one line', async () => {
      const inst = makeInvokePlugin({
        'web-app': 'api',
        qualifier: '1',
        raw: true,
        type: 'Event',
      })
      await expect(inst.hooks['invoke:invoke']()).rejects.toMatchObject({
        message:
          '--qualifier, --type and --raw are not available with --web-app.',
      })
      const two = makeInvokePlugin({
        sandbox: 'echo',
        raw: true,
        type: 'Event',
      })
      await expect(two.hooks['invoke:invoke']()).rejects.toMatchObject({
        message: '--type and --raw are not available with --sandbox.',
      })
    })

    test('keeps the flags a web app or sandbox request reads', async () => {
      const webApp = makeInvokePlugin({
        'web-app': 'api',
        path: '/health',
        method: 'POST',
        data: '{}',
        log: true,
        header: ['X-A: 1'],
      })
      await expect(webApp.hooks['invoke:invoke']()).resolves.toBeUndefined()
      const sandbox = makeInvokePlugin({
        sandbox: 'echo',
        path: '/health',
        method: 'POST',
        data: '{}',
        port: '3000',
        header: ['X-A: 1'],
      })
      await expect(sandbox.hooks['invoke:invoke']()).resolves.toBeUndefined()
    })

    test.each([{ function: 'hello' }, { agent: 'a' }])(
      'rejects --header with %p',
      async (target) => {
        const inst = makeInvokePlugin({ ...target, header: ['X-A: 1'] })
        await expect(inst.hooks['invoke:invoke']()).rejects.toMatchObject({
          code: 'INVOKE_OPTION_NOT_AVAILABLE',
          stack: undefined,
          message: `--header is not available with --${Object.keys(target)[0]}.`,
        })
      },
    )

    test('rejects --json with --agent', async () => {
      const inst = makeInvokePlugin({ agent: 'a', json: true })
      await expect(inst.hooks['invoke:invoke']()).rejects.toMatchObject({
        code: 'INVOKE_OPTION_NOT_AVAILABLE',
        stack: undefined,
        message: '--json is not available with --agent.',
      })
    })

    test('leaves a --sandbox combined with --function to the sandbox plugin', async () => {
      const inst = makeInvokePlugin({
        sandbox: 'echo',
        function: 'hello',
        qualifier: '1',
      })
      await expect(inst.hooks['invoke:invoke']()).resolves.toBeUndefined()
    })
  })
})

describe('AwsInvoke invoke request', () => {
  const make = (options = {}) => {
    const provider = createProvider({
      request: jest.fn().mockResolvedValue({ StatusCode: 202 }),
    })
    const inst = new AwsInvoke(
      createServerless(provider),
      { function: 'worker', ...options },
      createMockUtils(),
    )
    return { inst, provider }
  }
  const durable = (executionTimeout = 600) => ({
    name: 'fn',
    durableConfig: { executionTimeout },
  })

  test('sends Qualifier "durable" through SDK v3 for a durable function', async () => {
    const { inst, provider } = make({ functionObj: durable() })
    await inst.invoke()
    expect(provider.request).toHaveBeenCalledWith(
      'Lambda',
      'invoke',
      expect.objectContaining({ FunctionName: 'fn', Qualifier: 'durable' }),
      { sdkVersion: 3 },
    )
    expect(inst.qualifier).toBe('durable')
    expect(inst.qualifierDefaulted).toBe(true)
  })

  test('an explicit --qualifier wins', async () => {
    const { inst, provider } = make({
      functionObj: durable(),
      qualifier: '$LATEST',
    })
    await inst.invoke()
    expect(provider.request).toHaveBeenCalledWith(
      'Lambda',
      'invoke',
      expect.objectContaining({ FunctionName: 'fn', Qualifier: '$LATEST' }),
      { sdkVersion: 3 },
    )
    expect(inst.qualifier).toBe('$LATEST')
    expect(inst.qualifierDefaulted).toBe(false)
  })

  test('uses the provisioned-concurrency alias of a durable function', async () => {
    const { inst, provider } = make({
      functionObj: {
        ...durable(),
        provisionedConcurrency: { executions: 1, alias: 'live' },
      },
    })
    await inst.invoke()
    expect(provider.request).toHaveBeenCalledWith(
      'Lambda',
      'invoke',
      expect.objectContaining({ FunctionName: 'fn', Qualifier: 'live' }),
      { sdkVersion: 3 },
    )
    expect(inst.qualifier).toBe('live')
    expect(inst.qualifierDefaulted).toBe(true)
  })

  test('leaves a non-durable function unqualified and still uses SDK v3', async () => {
    const { inst, provider } = make({ functionObj: { name: 'fn' } })
    await inst.invoke()
    expect(provider.request).toHaveBeenCalledTimes(1)
    const [service, method, params, sdk] = provider.request.mock.calls[0]
    expect([service, method, sdk]).toEqual([
      'Lambda',
      'invoke',
      { sdkVersion: 3 },
    ])
    expect(params).toEqual(expect.objectContaining({ FunctionName: 'fn' }))
    expect(params).not.toHaveProperty('Qualifier')
    expect(inst.qualifier).toBeUndefined()
    expect(inst.qualifierDefaulted).toBe(false)
  })

  test('stops a synchronous call when executionTimeout is above 900 seconds', async () => {
    const { inst, provider } = make({ functionObj: durable('901') })
    await expect(inst.invoke()).rejects.toBeInstanceOf(ServerlessError)
    await expect(inst.invoke()).rejects.toMatchObject({
      code: 'INVOKE_DURABLE_SYNC_TIMEOUT',
      message:
        'Function "worker" is a durable function with an execution timeout of 901 seconds. Lambda runs a durable function synchronously only when its execution timeout is 900 seconds (15 minutes) or less. Run the same command with --type Event to start it asynchronously.',
    })
    expect(provider.request).not.toHaveBeenCalled()
  })

  test('allows a synchronous call at 900 seconds', async () => {
    const { inst, provider } = make({ functionObj: durable(900) })
    await inst.invoke()
    expect(provider.request).toHaveBeenCalledWith(
      'Lambda',
      'invoke',
      expect.objectContaining({
        InvocationType: 'RequestResponse',
        Qualifier: 'durable',
      }),
      { sdkVersion: 3 },
    )
  })

  test('allows --type Event above 900 seconds', async () => {
    const { inst, provider } = make({
      functionObj: durable(3600),
      type: 'Event',
    })
    await inst.invoke()
    expect(provider.request).toHaveBeenCalledWith(
      'Lambda',
      'invoke',
      expect.objectContaining({
        InvocationType: 'Event',
        Qualifier: 'durable',
      }),
      { sdkVersion: 3 },
    )
  })

  test('allows --type DryRun above 900 seconds and still defaults the qualifier', async () => {
    const { inst, provider } = make({
      functionObj: durable(3600),
      type: 'DryRun',
    })
    await inst.invoke()
    expect(provider.request).toHaveBeenCalledWith(
      'Lambda',
      'invoke',
      expect.objectContaining({
        InvocationType: 'DryRun',
        Qualifier: 'durable',
      }),
      { sdkVersion: 3 },
    )
    expect(inst.qualifierDefaulted).toBe(true)
  })

  const lambdaError = (message, code, providerCode) =>
    Object.assign(new ServerlessError(message, code), {
      providerError: { code: providerCode },
    })
  const aliasNotFound = () =>
    lambdaError(
      'Function not found: arn:aws:lambda:us-east-1:111122223333:function:fn:durable',
      'AWS_LAMBDA_INVOKE_RESOURCE_NOT_FOUND_EXCEPTION',
      'ResourceNotFoundException',
    )

  test('explains a missing alias it chose itself', async () => {
    const { inst, provider } = make({ functionObj: durable() })
    const error = aliasNotFound()
    provider.request.mockRejectedValue(error)
    await expect(inst.invoke()).rejects.toBe(error)
    expect(error).toMatchObject({
      code: 'AWS_LAMBDA_INVOKE_RESOURCE_NOT_FOUND_EXCEPTION',
      message:
        'Function not found: arn:aws:lambda:us-east-1:111122223333:function:fn:durable The "durable" alias is published by "serverless deploy": deploy the service, or pass --qualifier.',
    })
    expect(error.stack).toBeUndefined()
  })

  test('leaves a missing --qualifier alias unexplained', async () => {
    const { inst, provider } = make({
      functionObj: durable(),
      qualifier: 'live',
    })
    const error = aliasNotFound()
    provider.request.mockRejectedValue(error)
    await expect(inst.invoke()).rejects.toBe(error)
    expect(error).toMatchObject({
      code: 'AWS_LAMBDA_INVOKE_RESOURCE_NOT_FOUND_EXCEPTION',
      message:
        'Function not found: arn:aws:lambda:us-east-1:111122223333:function:fn:durable',
    })
    expect(error.stack).toContain('Function not found')
  })

  test('explains an execution name used with another payload', async () => {
    const arn =
      'arn:aws:lambda:us-east-1:111122223333:function:fn:durable/durable-execution/order-1/0a1b2c3d'
    const { inst, provider } = make({
      functionObj: durable(),
      'durable-execution-name': 'order-1',
    })
    const error = lambdaError(
      `Execution already started: ${arn}`,
      'AWS_LAMBDA_INVOKE_DURABLE_EXECUTION_ALREADY_STARTED_EXCEPTION',
      'DurableExecutionAlreadyStartedException',
    )
    provider.request.mockRejectedValue(error)
    await expect(inst.invoke()).rejects.toBe(error)
    expect(error).toMatchObject({
      code: 'AWS_LAMBDA_INVOKE_DURABLE_EXECUTION_ALREADY_STARTED_EXCEPTION',
      message: `Execution already started: ${arn} An execution with this name already exists with a different payload: use a new --durable-execution-name, or send the same payload to get the existing execution.`,
    })
    expect(error.stack).toBeUndefined()
  })
})

describe('AwsInvoke and a Dev Mode session in this directory', () => {
  const REQUEST = '3f2a9c1e-7b1d-4c55-9a51-0d2e3f4a5b6c'
  const FILE = '.serverless/dev/invocations/hello/1759661067-3f2a9c1e.json'
  const v2Reply = (extra = {}) =>
    Object.defineProperty(
      { Payload: Buffer.from('{"ok":true}'), ...extra },
      '$response',
      { value: { requestId: REQUEST } },
    )
  const v3Reply = (extra = {}) => ({
    Payload: new TextEncoder().encode('{"ok":true}'),
    $metadata: { requestId: REQUEST },
    ...extra,
  })

  // The CLI runs in the service directory unless a test says otherwise.
  beforeEach(() => {
    jest.spyOn(process, 'cwd').mockReturnValue('/path/to/service')
  })
  afterEach(() => {
    jest.restoreAllMocks()
  })

  const make = ({ options = {}, handled = null, log: realLog } = {}) => {
    const provider = createProvider({
      getStage: jest.fn().mockReturnValue('dev'),
    })
    const serverless = createServerless(provider)
    const log = realLog ?? {
      notice: jest.fn(),
      info: jest.fn(),
      error: jest.fn(),
      blankLine: jest.fn(),
      debug: jest.fn(),
      aside: jest.fn(),
    }
    const inst = new AwsInvoke(
      serverless,
      { function: 'hello', ...options },
      { log, progress: { notice: jest.fn(), remove: jest.fn() } },
    )
    inst.findHandledInvocation = jest.fn(async () => handled)
    return { inst, log }
  }

  const stdoutOf = async (fn) => (await captured(fn)).stdout

  test.each([
    ['AWS SDK v2', v2Reply],
    ['AWS SDK v3', v3Reply],
  ])(
    'with the %s response, the call is matched by its request id',
    async (_name, reply) => {
      const { inst, log } = make({
        handled: {
          file: FILE,
          record: { logs: { lines: [], truncated: false } },
        },
      })
      // The result goes to stdout; captured, it is not printed in the test run.
      await stdoutOf(() => inst.log(reply()))
      expect(inst.findHandledInvocation).toHaveBeenCalledWith(
        expect.objectContaining({
          serviceDir: '/path/to/service',
          service: 'test-service',
          stage: 'dev',
          region: 'us-east-1',
          functionKey: 'hello',
          requestId: REQUEST,
          invocationType: 'RequestResponse',
        }),
      )
      // A secondary line, as invoke's own log lines are.
      expect(log.aside).toHaveBeenCalledWith(
        `Dev Mode: handled by your working copy · request 3f2a9c1e · ${FILE}`,
      )
    },
  )

  test.each([
    [
      'a Compose root',
      '/path/to',
      { compose: { isWithinCompose: true, serviceName: 'service' } },
    ],
    ['the parent directory, with --config', '/path/to', {}],
  ])(
    'run from %s, the file is named as it is reached from there',
    async (_, cwd, extra) => {
      jest.spyOn(process, 'cwd').mockReturnValue(cwd)
      const { inst, log } = make({
        options: extra.compose ? {} : { config: 'service/serverless.yml' },
        handled: {
          file: FILE,
          record: { logs: { lines: [], truncated: false } },
        },
      })
      Object.assign(inst.serverless, extra)
      await stdoutOf(() => inst.log(v3Reply()))
      expect(log.aside).toHaveBeenCalledWith(
        `Dev Mode: handled by your working copy · request 3f2a9c1e · service/${FILE}`,
      )
    },
  )

  test.each([
    [
      'the --qualifier given',
      { type: 'Event', qualifier: 'live' },
      { name: 'hello-fn' },
      'Event',
      'live',
    ],
    [
      'the alias a durable function defaults to',
      {},
      { name: 'hello-fn', durableConfig: { executionTimeout: 600 } },
      'RequestResponse',
      'durable',
    ],
  ])(
    '--type and %s reach the lookup, which decides from them whether to look at all',
    async (_name, options, functionObj, invocationType, qualifier) => {
      const { inst } = make({ options: { ...options, functionObj } })
      const reply = await inst.invoke()
      expect(reply).toEqual({})
      await stdoutOf(() => inst.log(v3Reply()))
      expect(inst.findHandledInvocation).toHaveBeenCalledWith(
        expect.objectContaining({
          functionKey: 'hello',
          requestId: REQUEST,
          invocationType,
          qualifier,
        }),
      )
    },
  )

  test('stdout is byte for byte the same whether or not the session ran the call; the Dev Mode lines go to stderr', async () => {
    // The real plugin logger and writeText: a Dev Mode line written to stdout fails this test.
    const { log } = getPluginWriters('aws-invoke-dev-mode-test')
    const reply = () =>
      v3Reply({
        LogResult: Buffer.from(
          'START RequestId: x\nbridge line\nREPORT RequestId: x\n',
        ).toString('base64'),
      })
    const run = async (handled) => {
      const { inst } = make({ options: { log: true }, handled, log })
      inst.options.log = 'Tail'
      return captured(() => inst.log(reply()))
    }
    const withSession = await run({
      file: FILE,
      record: { logs: { lines: ['local line'], truncated: false } },
    })
    const without = await run(null)
    expect(withSession.stdout).toBe(without.stdout)
    expect(withSession.stdout).toContain('"ok": true')
    expect(withSession.stdout).not.toContain('Dev Mode')
    expect(withSession.stdout).not.toContain('local line')
    expect(withSession.stderr).toContain(
      `Dev Mode: handled by your working copy · request 3f2a9c1e · ${FILE}`,
    )
    expect(withSession.stderr).toContain(
      'Dev Mode: log lines from your working copy',
    )
    expect(withSession.stderr).toContain('local line')
    expect(without.stderr).not.toContain('Dev Mode')
  })

  test('with --log, the local log lines follow the CloudWatch tail under their heading', async () => {
    const { inst, log } = make({
      handled: {
        file: FILE,
        record: {
          logs: { lines: ['local one', 'local two'], truncated: false },
        },
      },
    })
    inst.options.log = 'Tail'
    const order = []
    log.aside.mockImplementation((line) => order.push(['aside', line]))
    log.notice.mockImplementation((line) => order.push(['notice', line]))
    await stdoutOf(() =>
      inst.log(
        v3Reply({
          LogResult: Buffer.from(
            'START RequestId: x\nREPORT RequestId: x\n',
          ).toString('base64'),
        }),
      ),
    )
    const tail = order.findIndex(([, line]) => String(line).includes('REPORT'))
    const handledAt = order.findIndex(([, line]) =>
      line.startsWith('Dev Mode: handled'),
    )
    const heading = order.findIndex(
      ([, line]) => line === 'Dev Mode: log lines from your working copy',
    )
    expect(tail).toBeGreaterThanOrEqual(0)
    expect(handledAt).toBeGreaterThan(tail)
    expect(heading).toBeGreaterThan(handledAt)
    expect(order.slice(heading + 1)).toEqual([
      ['aside', 'local one'],
      ['aside', 'local two'],
    ])
  })

  test('without --log, only the handled line is added', async () => {
    const { inst, log } = make({
      handled: {
        file: FILE,
        record: { logs: { lines: ['local one'], truncated: false } },
      },
    })
    inst.options.log = 'None'
    await stdoutOf(() => inst.log(v3Reply()))
    expect(log.aside).toHaveBeenCalledTimes(1)
    expect(log.notice).not.toHaveBeenCalled()
    expect(log.aside).not.toHaveBeenCalledWith('local one')
  })

  test('a failed invocation still names the file, then fails as before', async () => {
    const { inst, log } = make({
      handled: {
        file: FILE,
        record: { logs: { lines: [], truncated: false } },
      },
    })
    await expect(
      stdoutOf(() => inst.log(v3Reply({ FunctionError: 'Unhandled' }))),
    ).rejects.toMatchObject({
      code: 'AWS_LAMBDA_INVOCATION_FAILED',
      stack: undefined,
    })
    expect(log.aside).toHaveBeenCalledWith(
      expect.stringContaining('Dev Mode: handled'),
    )
  })

  test('a lookup that fails is a debug line, never a failed invoke', async () => {
    const { inst, log } = make()
    inst.findHandledInvocation = jest.fn(async () => {
      throw new Error('disk on fire')
    })
    await stdoutOf(() => inst.log(v3Reply()))
    expect(log.debug).toHaveBeenCalledWith(
      expect.stringContaining('disk on fire'),
    )
    expect(log.notice).not.toHaveBeenCalled()
    expect(log.aside).not.toHaveBeenCalled()
  })

  test('no session: nothing is added', async () => {
    const { inst, log } = make()
    await stdoutOf(() => inst.log(v2Reply()))
    expect(log.notice).not.toHaveBeenCalled()
    expect(log.aside).not.toHaveBeenCalled()
  })
})

describe('AwsInvoke output', () => {
  const ARN =
    'arn:aws:lambda:us-east-1:111122223333:function:shop-dev-worker:4/durable-execution/order-1042/2f6c0d3e'
  const durable = {
    name: 'worker-fn',
    durableConfig: { executionTimeout: 600 },
  }
  const plain = { name: 'worker-fn' }

  // The real plugin logger and writeText, so a line on the wrong stream fails the test.
  const run = async ({ reply, options = {}, functionObj = durable }) => {
    const provider = createProvider({
      getStage: jest.fn().mockReturnValue('dev'),
      request: jest.fn().mockResolvedValue(reply),
    })
    const { log } = getPluginWriters('aws-invoke-output-test')
    const inst = new AwsInvoke(
      createServerless(provider),
      { function: 'worker', functionObj, ...options },
      { log, progress: { notice: jest.fn(), remove: jest.fn() } },
    )
    inst.findHandledInvocation = jest.fn(async () => null)
    let error
    const output = await captured(async () => {
      try {
        await inst.log(await inst.invoke())
      } catch (e) {
        error = e
      }
    })
    return { ...output, error }
  }
  const payloadOf = (text) => new TextEncoder().encode(text)
  const tail = Buffer.from(
    'START RequestId: x\nhandler line\nREPORT RequestId: x\n',
  ).toString('base64')

  test('prints the durable execution ARN on stderr after an Event invoke, and nothing on stdout', async () => {
    const { stdout, stderr, error } = await run({
      reply: { StatusCode: 202, DurableExecutionArn: ARN },
      options: { type: 'Event' },
    })
    expect(error).toBeUndefined()
    expect(stdout).toBe('')
    expect(stderr).toContain(`Durable execution started: ${ARN}`)
  })

  test('names the execution after a synchronous invoke', async () => {
    const { stdout, stderr } = await run({
      reply: {
        StatusCode: 200,
        ExecutedVersion: '4',
        DurableExecutionArn: ARN,
        Payload: payloadOf('{"ok":true}'),
      },
    })
    expect(stdout).toBe(`${JSON.stringify({ ok: true }, null, 4)}\n`)
    expect(stderr).toContain(`Durable execution: ${ARN}`)
    expect(stderr).not.toContain('Durable execution started')
  })

  test('prints nothing on stderr for a plain function', async () => {
    const { stdout, stderr } = await run({
      reply: {
        StatusCode: 200,
        ExecutedVersion: '$LATEST',
        Payload: payloadOf('{"ok":true}'),
      },
      functionObj: plain,
    })
    expect(stdout).toContain('"ok": true')
    expect(stderr).toBe('')
  })

  test('--json prints one object on stdout', async () => {
    const { stdout, stderr, error } = await run({
      reply: { StatusCode: 202, DurableExecutionArn: ARN },
      options: { type: 'Event', json: true },
    })
    expect(error).toBeUndefined()
    expect(stdout.trimEnd().split('\n')).toHaveLength(1)
    const result = JSON.parse(stdout)
    expect(result).toEqual({
      statusCode: 202,
      qualifier: 'durable',
      executedVersion: null,
      durableExecutionArn: ARN,
      functionError: null,
      payload: null,
      log: null,
    })
    expect(Object.keys(result)).toEqual([
      'statusCode',
      'qualifier',
      'executedVersion',
      'durableExecutionArn',
      'functionError',
      'payload',
      'log',
    ])
    expect(stderr).toBe('')
  })

  test('--json parses a JSON payload', async () => {
    const { stdout } = await run({
      reply: {
        StatusCode: 200,
        ExecutedVersion: '$LATEST',
        Payload: payloadOf('{"ok":true}'),
      },
      options: { json: true },
      functionObj: plain,
    })
    expect(JSON.parse(stdout)).toEqual({
      statusCode: 200,
      qualifier: null,
      executedVersion: '$LATEST',
      durableExecutionArn: null,
      functionError: null,
      payload: { ok: true },
      log: null,
    })
  })

  test('--json keeps a non-JSON payload as a string', async () => {
    const { stdout, error } = await run({
      reply: {
        StatusCode: 200,
        ExecutedVersion: '4',
        DurableExecutionArn: ARN,
        Payload: payloadOf('plain text'),
      },
      options: { json: true },
    })
    expect(error).toBeUndefined()
    expect(JSON.parse(stdout).payload).toBe('plain text')
  })

  test('--json with --log puts the decoded tail in log', async () => {
    const { stdout, stderr } = await run({
      reply: {
        StatusCode: 200,
        ExecutedVersion: '$LATEST',
        Payload: payloadOf('{"ok":true}'),
        LogResult: tail,
      },
      options: { json: true, log: true },
      functionObj: plain,
    })
    expect(stdout.trimEnd().split('\n')).toHaveLength(1)
    expect(JSON.parse(stdout).log).toBe(
      'START RequestId: x\nhandler line\nREPORT RequestId: x\n',
    )
    expect(stderr).not.toContain('handler line')
  })

  test('--json with a function error prints the object, then fails as before', async () => {
    const { stdout, error } = await run({
      reply: {
        StatusCode: 200,
        ExecutedVersion: '$LATEST',
        FunctionError: 'Unhandled',
        Payload: payloadOf('{"errorMessage":"boom"}'),
      },
      options: { json: true },
      functionObj: plain,
    })
    expect(error).toMatchObject({
      code: 'AWS_LAMBDA_INVOCATION_FAILED',
      stack: undefined,
    })
    const result = JSON.parse(stdout)
    expect(result.functionError).toBe('Unhandled')
    expect(result.payload).toEqual({ errorMessage: 'boom' })
  })

  test('--json=false keeps the text output', async () => {
    const { stdout, stderr } = await run({
      reply: { StatusCode: 202, DurableExecutionArn: ARN },
      options: { type: 'Event', json: 'false' },
    })
    expect(stdout).toBe('')
    expect(stderr).toContain(`Durable execution started: ${ARN}`)
  })
})
