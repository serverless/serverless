import { jest } from '@jest/globals'

// Router-delegation tests for the `agent` command in CoreRunner (Task 7):
//   * `agent skills install` -> CoreRunner's agentSkillsInstall (unchanged)
//   * `agent inspect`         -> delegated to the framework runner
//   * unknown `agent <x>`     -> helpful skills hint
// Plus a yargs-parse check that `--name a --name b` becomes an array through
// the sf-core CLI schema (the layer that honors `array: true`).

const mockLog = {
  notice: jest.fn(),
  warning: jest.fn(),
  error: jest.fn(),
  success: jest.fn(),
  debug: jest.fn(),
  logo: jest.fn(),
  aside: jest.fn(),
  isInteractive: () => false,
  blankLine: jest.fn(),
}

jest.unstable_mockModule('@serverless/util', () => ({
  log: { get: () => mockLog },
  progress: { get: () => ({ notice: jest.fn(), remove: jest.fn() }) },
  ServerlessError: class ServerlessError extends Error {
    constructor(message, code, options) {
      super(message)
      this.code = code
      this.options = options
    }
  },
  ServerlessErrorCodes: {
    general: { CONFIG_FILE_NOT_FOUND: 'CONFIG_FILE_NOT_FOUND' },
  },
  setGlobalRendererSettings: jest.fn(),
  writeText: jest.fn(),
  resolveStateStore: jest.fn(),
}))

// The base Runner (../index.js) pulls in a heavy transitive graph; mock its
// non-util dependencies so CoreRunner imports cleanly for these unit tests.
jest.unstable_mockModule(
  '@serverless/framework/lib/configuration/read.js',
  () => ({ default: jest.fn() }),
)
jest.unstable_mockModule('../../../../../src/lib/resolvers/index.js', () => ({
  variables: {},
}))
jest.unstable_mockModule('../../../../../src/lib/resolvers/manager.js', () => ({
  ResolverManager: class ResolverManager {},
}))
jest.unstable_mockModule(
  '../../../../../src/lib/runners/notification.js',
  () => ({
    sanitizeNotifications: jest.fn(() => []),
    handleAndMaybeThrowNotifications: jest.fn(),
  }),
)

// Mock the sibling command modules so importing CoreRunner does not pull in
// their heavy transitive deps.
const mockAgentSkillsInstall = jest.fn(async () => ({
  changes: [],
  skipped: [],
}))
jest.unstable_mockModule(
  '../../../../../src/lib/runners/core/agent-skills-install.js',
  () => ({ default: mockAgentSkillsInstall }),
)

// The framework runner — the delegation target. We capture the ctor args and
// stub run() so we can assert the handoff without loading the real framework.
const mockFrameworkRun = jest.fn(async () => ({ delegated: true }))
const frameworkCtorCalls = []
jest.unstable_mockModule('../../../../../src/lib/runners/framework.js', () => ({
  TraditionalRunner: class TraditionalRunner {
    constructor(args) {
      frameworkCtorCalls.push(args)
    }
    run(...args) {
      return mockFrameworkRun(...args)
    }
  },
}))

jest.unstable_mockModule(
  '../../../../../src/lib/runners/core/plugin-install.js',
  () => ({ default: jest.fn() }),
)
jest.unstable_mockModule(
  '../../../../../src/lib/runners/core/plugin-uninstall.js',
  () => ({ default: jest.fn() }),
)
jest.unstable_mockModule('../../../../../src/lib/auth/index.js', () => ({
  Authentication: class Authentication {
    async unAuthenticate() {}
    async authenticate() {
      return {}
    }
  },
}))
jest.unstable_mockModule(
  '../../../../../src/lib/runners/core/onboarding.js',
  () => ({ default: jest.fn() }),
)
jest.unstable_mockModule(
  '../../../../../src/lib/runners/core/support.js',
  () => ({
    default: jest.fn(),
  }),
)
jest.unstable_mockModule(
  '../../../../../src/lib/runners/core/usage.js',
  () => ({
    default: jest.fn(),
  }),
)
jest.unstable_mockModule(
  '../../../../../src/lib/runners/core/reconcile.js',
  () => ({ default: jest.fn() }),
)
jest.unstable_mockModule('../../../../../src/lib/runners/core/mcp.js', () => ({
  default: jest.fn(),
}))
jest.unstable_mockModule('../../../../../src/utils/index.js', () => ({
  getAwsCredentialProvider: jest.fn(),
  readFile: jest.fn(),
}))
jest.unstable_mockModule(
  '../../../../../src/lib/runners/core/login-aws.js',
  () => ({ default: jest.fn() }),
)
jest.unstable_mockModule(
  '../../../../../src/lib/runners/core/login-aws-sso.js',
  () => ({ default: jest.fn() }),
)

const { CoreRunner } =
  await import('../../../../../src/lib/runners/core/core.js')
const yargs = (await import('yargs')).default

const makeRunner = (command, options = {}, resolverManager = {}) =>
  new CoreRunner({
    command,
    options,
    config: { service: 'test' },
    configFilePath: '/svc/serverless.yml',
    versionFramework: '4.0.0',
    resolverManager,
  })

beforeEach(() => {
  mockAgentSkillsInstall.mockClear()
  mockFrameworkRun.mockClear()
  frameworkCtorCalls.length = 0
})

describe('CoreRunner agent routing', () => {
  it('routes `agent skills install` to agentSkillsInstall (unchanged)', async () => {
    const runner = makeRunner(['agent', 'skills', 'install'], {})
    await runner.run()
    expect(mockAgentSkillsInstall).toHaveBeenCalledTimes(1)
    expect(mockAgentSkillsInstall).toHaveBeenCalledWith({
      configFilePath: '/svc/serverless.yml',
      options: {},
    })
    expect(mockFrameworkRun).not.toHaveBeenCalled()
  })

  it('delegates `agent inspect` to the framework runner', async () => {
    const runner = makeRunner(
      ['agent', 'inspect'],
      { functions: true },
      {
        resolveStage: jest.fn(async () => 'dev'),
      },
    )
    const result = await runner.run()
    expect(mockFrameworkRun).toHaveBeenCalledTimes(1)
    expect(mockAgentSkillsInstall).not.toHaveBeenCalled()
    // Result is passed through unchanged from the framework runner.
    expect(result).toEqual({ delegated: true })
    // The delegation forwards the full runner context to TraditionalRunner.
    expect(frameworkCtorCalls).toHaveLength(1)
    expect(frameworkCtorCalls[0]).toMatchObject({
      command: ['agent', 'inspect'],
      options: { functions: true },
      config: { service: 'test' },
      configFilePath: '/svc/serverless.yml',
      versionFramework: '4.0.0',
    })
  })

  it('strips the yargs camelCase duplicate option key before delegating (aws-services, not awsServices)', async () => {
    // The router's yargs round-trip (utils/cli/cli.js) uses default
    // camel-case-expansion, minting a camelCase alias for every dashed option:
    // `--aws-services x` yields BOTH `aws-services` AND `awsServices`. The
    // framework's ensure-supported-command validates every forwarded key
    // against a schema that only knows the dashed `aws-services`, so the extra
    // `awsServices` would trip "Unrecognized option". delegateToFramework must
    // drop the camelCase duplicate and forward only the canonical dashed key.
    const runner = makeRunner(
      ['agent', 'inspect'],
      {
        'aws-services': 'lambda,iam',
        awsServices: 'lambda,iam',
        format: 'json',
      },
      { resolveStage: jest.fn(async () => 'dev') },
    )
    await runner.run()
    expect(frameworkCtorCalls).toHaveLength(1)
    const forwarded = frameworkCtorCalls[0].options
    expect(forwarded['aws-services']).toBe('lambda,iam')
    expect('awsServices' in forwarded).toBe(false)
    // Non-duplicated options are forwarded untouched.
    expect(forwarded.format).toBe('json')
  })

  it('leaves options without a dashed/camelCase duplicate pair untouched', async () => {
    const runner = makeRunner(
      ['agent', 'inspect'],
      { functions: true, name: ['a', 'b'] },
      { resolveStage: jest.fn(async () => 'dev') },
    )
    await runner.run()
    expect(frameworkCtorCalls[0].options).toEqual({
      functions: true,
      name: ['a', 'b'],
    })
  })

  it('forwards the resolved (non-default) stage to the framework runner', async () => {
    // Mirrors what the router does before constructing a runner: it resolves
    // the stage via `resolverManager.resolveStage()` (see getRunner() in
    // router.js), which reads `provider.stage` from the config when no
    // `--stage` flag is given. CoreRunner itself never sets `this.stage`, so
    // this asserts delegateToFramework() re-derives it off the SAME
    // resolverManager instance instead of forwarding `undefined`.
    const resolveStage = jest.fn(async () => 'staging')
    const resolverManager = { resolveStage }
    const runner = makeRunner(
      ['agent', 'inspect'],
      { functions: true },
      resolverManager,
    )
    await runner.run()
    expect(resolveStage).toHaveBeenCalledTimes(1)
    expect(frameworkCtorCalls).toHaveLength(1)
    // Explicit assertion on `stage` — a `toMatchObject` without this key
    // would pass even if `stage` were `undefined`, which is exactly the bug
    // being fixed here.
    expect(frameworkCtorCalls[0].stage).toBe('staging')
    expect(frameworkCtorCalls[0].resolverManager).toBe(resolverManager)
  })

  it('throws the skills hint for an unknown agent subcommand', async () => {
    const runner = makeRunner(['agent', 'bogus'], {})
    await expect(runner.run()).rejects.toThrow(
      /Did you mean "serverless agent skills install"/,
    )
    expect(mockFrameworkRun).not.toHaveBeenCalled()
    expect(mockAgentSkillsInstall).not.toHaveBeenCalled()
  })

  it('throws the skills hint for `agent skills <other>`', async () => {
    const runner = makeRunner(['agent', 'skills', 'uninstall'], {})
    await expect(runner.run()).rejects.toThrow(
      /Did you mean "serverless agent skills install"/,
    )
    expect(mockAgentSkillsInstall).not.toHaveBeenCalled()
  })
})

describe('CoreRunner CLI schema for `agent inspect`', () => {
  const findAgentInspect = () => {
    const schema = CoreRunner.getCliSchema()
    const agent = schema.find((c) => c.command === 'agent')
    return agent.builder.find((c) => c.command === 'inspect')
  }

  it('declares an `inspect` sibling of `skills`', () => {
    const inspect = findAgentInspect()
    expect(inspect).toBeDefined()
    expect(inspect.description).toMatch(/inspect a deployed service/i)
  })

  it('declares `name` with array: true so `--name` repeats into an array', () => {
    const inspect = findAgentInspect()
    const nameOption = inspect.builder[0].options.name
    expect(nameOption.array).toBe(true)
    expect(nameOption.type).toBe('string')
  })

  // Mirror the recursive yargs application in src/utils/cli/cli.js
  // (validateCliSchema -> applyConfigurations) so we exercise the SAME parsing
  // path the router uses, then feed raw argv with repeated `--name`.
  const applyConfigurations = (cliInstance, schemaConfig) => {
    schemaConfig.forEach((config) => {
      if (config.command) {
        cliInstance.command(config.command, config.description, (y) => {
          if (config.builder) return applyConfigurations(y, config.builder)
          return y
        })
      } else {
        Object.entries(config).forEach(([key, value]) => {
          if (typeof cliInstance[key] === 'function') {
            if (Array.isArray(value)) cliInstance[key](...value)
            else cliInstance[key](value)
          }
        })
      }
    })
  }

  it('parses repeated `--name a --name b` into an array via yargs', () => {
    const cli = yargs(['agent', 'inspect', '--name', 'a', '--name', 'b'])
      .scriptName('')
      .help('help')
      .version(false)
      .fail(false)
      .wrap(null)
    applyConfigurations(cli, CoreRunner.getCliSchema())
    const argv = cli.argv
    expect(argv._).toEqual(['agent', 'inspect'])
    expect(argv.name).toEqual(['a', 'b'])
  })

  it('parses a single `--name a` into a one-element array via yargs', () => {
    const cli = yargs(['agent', 'inspect', '--name', 'a'])
      .scriptName('')
      .help('help')
      .version(false)
      .fail(false)
      .wrap(null)
    applyConfigurations(cli, CoreRunner.getCliSchema())
    const argv = cli.argv
    expect(argv.name).toEqual(['a'])
  })

  it('declares the category flags, aws-services and format', () => {
    const { options } = findAgentInspect().builder[0]
    for (const flag of [
      'functions',
      'api',
      'events',
      'iam',
      'storage',
      'observability',
      'cdn',
      'identity',
      'iot',
      'sandboxes',
      'all',
    ]) {
      expect(options[flag]).toMatchObject({ type: 'boolean' })
    }
    expect(options['aws-services']).toMatchObject({ type: 'string' })
    expect(options.format).toMatchObject({ type: 'string', default: 'json' })
  })
})
