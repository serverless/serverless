import { jest } from '@jest/globals'

const { default: AwsInvoke } =
  await import('../../../../../lib/plugins/aws/invoke.js')
const { getPluginWriters } = await import('@serverless/util')

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

    test.each([...FUNCTION_ONLY, ['port', '3000']])(
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

    test.each([...FUNCTION_ONLY, ['log', true]])(
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

  test('--type and --qualifier reach the lookup, which decides from them whether to look at all', async () => {
    const { inst } = make({
      options: { type: 'Event', qualifier: 'live' },
    })
    await stdoutOf(() => inst.log(v3Reply()))
    expect(inst.findHandledInvocation).toHaveBeenCalledWith(
      expect.objectContaining({
        functionKey: 'hello',
        requestId: REQUEST,
        invocationType: 'Event',
        qualifier: 'live',
      }),
    )
  })

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
