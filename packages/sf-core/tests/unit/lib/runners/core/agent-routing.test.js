import { jest } from '@jest/globals'

// Router-delegation tests for the `agent` command in CoreRunner (Task 7):
//   * `agent setup`           -> CoreRunner's agentSetup, WITHOUT a config guard
//   * `agent skills install` -> CoreRunner's agentSkillsInstall (unchanged)
//   * `agent inspect`         -> delegated to the framework runner
//   * unknown `agent <x>`     -> helpful setup/skills hint
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
  isInteractive: jest.fn(() => false),
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
    general: {
      CONFIG_FILE_NOT_FOUND: 'CONFIG_FILE_NOT_FOUND',
      UNRECOGNIZED_CLI_COMMAND: 'UNRECOGNIZED_CLI_COMMAND',
    },
  },
  setGlobalRendererSettings: jest.fn(),
  getGlobalRendererSettings: jest.fn(() => ({ isInteractive: true })),
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
  '../../../../../src/lib/resolvers/providers/aws/clients.js',
  () => ({ logAwsResolverSummary: jest.fn() }),
)
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

const mockAgentSetup = jest.fn(async () => ({
  skills: { added: 0, upgraded: 0, skipped: 0 },
  auth: { state: 'none' },
  aws: { state: 'none' },
  service: { present: false },
}))
jest.unstable_mockModule(
  '../../../../../src/lib/runners/core/agent-setup.js',
  () => ({ default: mockAgentSetup }),
)

const mockAgentDocs = jest.fn(async () => ({ pages: 0, index: true }))
jest.unstable_mockModule(
  '../../../../../src/lib/runners/core/agent-docs.js',
  () => ({ default: mockAgentDocs }),
)

const mockAgentSkillsList = jest.fn(async () => ({ skills: 3 }))
const mockAgentSkillsRead = jest.fn(async () => ({
  skill: 'x',
  file: 'SKILL.md',
}))
jest.unstable_mockModule(
  '../../../../../src/lib/runners/core/agent-skills-read.js',
  () => ({
    agentSkillsList: mockAgentSkillsList,
    agentSkillsRead: mockAgentSkillsRead,
  }),
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
// Signed out by default, so the quiet analysis-event sign-in after an agent
// command never reads the developer's real rc file here.
jest.unstable_mockModule(
  '../../../../../src/lib/runners/core/agent-env-report.js',
  () => ({ detectServerlessAuth: jest.fn(async () => ({ state: 'none' })) }),
)
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
jest.unstable_mockModule(
  '../../../../../src/lib/runners/core/login-noninteractive.js',
  () => ({ default: jest.fn() }),
)

const { CoreRunner } =
  await import('../../../../../src/lib/runners/core/core.js')
const { default: mockLoginNonInteractive } =
  await import('../../../../../src/lib/runners/core/login-noninteractive.js')
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

// Same shape as makeRunner but with NO resolved service config — the state a
// run from an empty directory is in. Commands that must work anywhere are
// asserted through this one, so a re-introduced config guard fails the test.
const makeBareRunner = (command, options = {}) =>
  new CoreRunner({
    command,
    options,
    config: null,
    configFilePath: null,
    versionFramework: '4.0.0',
    resolverManager: {},
  })

beforeEach(() => {
  mockAgentSkillsInstall.mockClear()
  mockAgentSetup.mockClear()
  mockAgentDocs.mockClear()
  mockAgentSkillsList.mockClear()
  mockAgentSkillsRead.mockClear()
  mockFrameworkRun.mockClear()
  frameworkCtorCalls.length = 0
})

describe('CoreRunner agent routing', () => {
  it('routes `agent setup` to agentSetup', async () => {
    const runner = makeRunner(['agent', 'setup'], {})
    await runner.run()
    expect(mockAgentSetup).toHaveBeenCalledTimes(1)
    expect(mockAgentSetup).toHaveBeenCalledWith({
      configFilePath: '/svc/serverless.yml',
      // The AWS check reads the profile a deploy would use from the config,
      // and the credential resolver a deploy would use from the manager.
      config: { service: 'test' },
      resolverManager: {},
      options: {},
    })
    expect(mockAgentSkillsInstall).not.toHaveBeenCalled()
    expect(mockFrameworkRun).not.toHaveBeenCalled()
  })

  it('runs `agent setup` OUTSIDE a service dir — no CONFIG_FILE_NOT_FOUND guard', async () => {
    // `agent setup` is the design's bootstrap mode: it must work from an empty
    // directory so a fresh machine can install the gateway skill and read the
    // environment report before any serverless.yml exists.
    const runner = new CoreRunner({
      command: ['agent', 'setup'],
      options: {},
      config: undefined,
      configFilePath: undefined,
      versionFramework: '4.0.0',
      resolverManager: {},
    })
    await expect(runner.run()).resolves.toBeDefined()
    expect(mockAgentSetup).toHaveBeenCalledTimes(1)
    expect(mockAgentSetup).toHaveBeenCalledWith(
      expect.objectContaining({ configFilePath: undefined, options: {} }),
    )
  })

  it('runs `agent skills install` OUTSIDE a service dir (user-level skills only)', async () => {
    const runner = new CoreRunner({
      command: ['agent', 'skills', 'install'],
      options: {},
      config: undefined,
      configFilePath: undefined,
      versionFramework: '4.0.0',
      resolverManager: {},
    })
    await runner.run()
    expect(mockAgentSkillsInstall).toHaveBeenCalledWith(
      expect.objectContaining({ configFilePath: undefined, options: {} }),
    )
    expect(mockAgentSetup).not.toHaveBeenCalled()
  })

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

  it('rejects `agent inspect` at a Compose root with a clear error (no delegation)', async () => {
    // At a Compose root the router resolves serverless-compose.yml as the
    // config but still selects CoreRunner (the `agent` command lives in its
    // CLI schema). Delegating would hand the compose file to the framework
    // runner as a service config, which dies with a confusing '"service"
    // property is missing' error — so the guard must fail fast instead.
    const runner = new CoreRunner({
      command: ['agent', 'inspect'],
      options: {},
      config: { services: { api: { path: 'api' }, worker: { path: 'w' } } },
      configFilePath: '/repo/serverless-compose.yml',
      versionFramework: '4.0.0',
      resolverManager: { resolveStage: jest.fn(async () => 'dev') },
    })
    // Names Compose's per-service form, which does reach inspect from here.
    await expect(runner.run()).rejects.toMatchObject({
      code: 'AGENT_INSPECT_COMPOSE_NOT_SUPPORTED',
      message:
        '"serverless agent inspect" runs on one service at a time. From here, run it for one service: "serverless api agent inspect" (services: api, worker), or run it in that service\'s directory.',
    })
    expect(mockFrameworkRun).not.toHaveBeenCalled()
    expect(frameworkCtorCalls).toHaveLength(0)
  })

  it('blocks every compose config extension, not just .yml', async () => {
    for (const file of [
      '/repo/serverless-compose.yaml',
      '/repo/serverless-compose.ts',
      '/repo/serverless-compose.js',
    ]) {
      const runner = new CoreRunner({
        command: ['agent', 'inspect'],
        options: {},
        config: { services: {} },
        configFilePath: file,
        versionFramework: '4.0.0',
        resolverManager: { resolveStage: jest.fn(async () => 'dev') },
      })
      await expect(runner.run()).rejects.toMatchObject({
        code: 'AGENT_INSPECT_COMPOSE_NOT_SUPPORTED',
      })
    }
    expect(mockFrameworkRun).not.toHaveBeenCalled()
  })

  const UNKNOWN_AGENT_HINT = (command) =>
    `Serverless command "${command}" not found. Did you mean "serverless agent setup", "serverless agent docs" or "serverless agent skills"?`
  const UNKNOWN_AGENT_SKILLS_HINT = (command) =>
    `Serverless command "${command}" not found. Did you mean "serverless agent skills install", "serverless agent skills list" or "serverless agent skills read <name>"?`

  it('throws the setup/docs/skills hint for an unknown agent subcommand', async () => {
    const runner = makeRunner(['agent', 'bogus'], {})
    await expect(runner.run()).rejects.toMatchObject({
      message: UNKNOWN_AGENT_HINT('agent bogus'),
      code: 'UNRECOGNIZED_CLI_COMMAND',
    })
    expect(mockFrameworkRun).not.toHaveBeenCalled()
    expect(mockAgentSkillsInstall).not.toHaveBeenCalled()
    expect(mockAgentSetup).not.toHaveBeenCalled()
  })

  it('throws the skills hint for `agent skills <other>`', async () => {
    const runner = makeRunner(['agent', 'skills', 'uninstall'], {})
    await expect(runner.run()).rejects.toMatchObject({
      message: UNKNOWN_AGENT_SKILLS_HINT('agent skills uninstall'),
      code: 'UNRECOGNIZED_CLI_COMMAND',
    })
    expect(mockAgentSkillsInstall).not.toHaveBeenCalled()
  })

  it('routes `agent docs` to agentDocs with the parsed paths, no config guard', async () => {
    const runner = makeBareRunner(['agent', 'docs'], { paths: ['a', 'b'] })
    await runner.run()
    expect(mockAgentDocs).toHaveBeenCalledWith({ paths: ['a', 'b'] })
  })

  it('routes `agent docs` without paths to agentDocs with undefined paths', async () => {
    const runner = makeBareRunner(['agent', 'docs'], {})
    await runner.run()
    expect(mockAgentDocs).toHaveBeenCalledWith({ paths: undefined })
  })

  it('routes `agent skills` (bare) and `agent skills list` to agentSkillsList', async () => {
    await makeBareRunner(['agent', 'skills'], {}).run()
    await makeBareRunner(['agent', 'skills', 'list'], {}).run()
    expect(mockAgentSkillsList).toHaveBeenCalledTimes(2)
  })

  it('routes `agent skills read` to agentSkillsRead with name and file', async () => {
    const runner = makeBareRunner(['agent', 'skills', 'read'], {
      name: 'serverless-sandboxes',
      file: 'references/config.md',
    })
    await runner.run()
    expect(mockAgentSkillsRead).toHaveBeenCalledWith({
      name: 'serverless-sandboxes',
      file: 'references/config.md',
    })
  })

  it('throws the skills hint for an unknown `agent skills` subcommand outside a service dir', async () => {
    await expect(
      makeBareRunner(['agent', 'skills', 'frobnicate'], {}).run(),
    ).rejects.toThrow(UNKNOWN_AGENT_SKILLS_HINT('agent skills frobnicate'))
  })

  it('throws the agent hint for an unknown `agent` subcommand outside a service dir', async () => {
    await expect(
      makeBareRunner(['agent', 'frobnicate'], {}).run(),
    ).rejects.toThrow(UNKNOWN_AGENT_HINT('agent frobnicate'))
  })
})

// The agent commands need no sign-in, so they skip the one every other command
// makes, and with it the analysis event (sent with the user's access key).
// When a session or an access key is already there, they sign in quietly
// after the command so the run is counted like any other.
describe('CoreRunner agent commands and the analysis event', () => {
  const signIn = (result) => {
    const authenticate = jest.fn(result)
    return {
      authenticate,
      createAuthentication: jest.fn(() => ({ authenticate })),
    }
  }

  it('signs in without prompting when a session or an access key exists', async () => {
    for (const state of ['rc-user', 'env-access']) {
      const runner = makeBareRunner(['agent', 'docs'])
      const { authenticate, createAuthentication } = signIn(async () => ({
        accessKeyV1: 'k',
        orgId: 'o1',
      }))
      await runner.authenticateForAnalytics({
        detectAuth: async () => ({ state }),
        createAuthentication,
      })
      expect(authenticate).toHaveBeenCalledTimes(1)
      expect(runner.authenticatedData).toEqual({
        accessKeyV1: 'k',
        orgId: 'o1',
      })
    }
  })

  it('signs in with prompts off, then restores the setting', async () => {
    const util = await import('@serverless/util')
    util.setGlobalRendererSettings.mockClear()
    const runner = makeBareRunner(['agent', 'docs'])
    const { createAuthentication } = signIn(async () => {
      expect(util.setGlobalRendererSettings).toHaveBeenLastCalledWith({
        isInteractive: false,
      })
      return { orgId: 'o1' }
    })
    await runner.authenticateForAnalytics({
      detectAuth: async () => ({ state: 'rc-user' }),
      createAuthentication,
    })
    expect(util.setGlobalRendererSettings).toHaveBeenLastCalledWith({
      isInteractive: true,
    })
  })

  it('attempts nothing without a session or access key, or with only a license key', async () => {
    for (const state of [
      'none',
      'env-license',
      'config-license',
      'rc-license',
    ]) {
      const runner = makeBareRunner(['agent', 'docs'])
      const { createAuthentication } = signIn(async () => ({}))
      await runner.authenticateForAnalytics({
        detectAuth: async () => ({ state }),
        createAuthentication,
      })
      expect(createAuthentication).not.toHaveBeenCalled()
      expect(runner.authenticatedData).toBeUndefined()
    }
  })

  it('a failed sign-in is ignored', async () => {
    const runner = makeBareRunner(['agent', 'docs'])
    const { createAuthentication } = signIn(async () => {
      throw new Error('network down')
    })
    await expect(
      runner.authenticateForAnalytics({
        detectAuth: async () => ({ state: 'rc-user' }),
        createAuthentication,
      }),
    ).resolves.toBeUndefined()
    expect(runner.authenticatedData).toBeUndefined()
  })

  it('a slow sign-in is waited for, and its result is used', async () => {
    const runner = makeBareRunner(['agent', 'docs'])
    const data = { orgId: 'org-1', userId: 'user-1', accessKeyV1: 'key' }
    const { createAuthentication } = signIn(
      () => new Promise((resolve) => setTimeout(() => resolve(data), 50)),
    )
    await runner.authenticateForAnalytics({
      detectAuth: async () => ({ state: 'rc-user' }),
      createAuthentication,
    })
    expect(runner.authenticatedData).toBe(data)
  })

  it('runs after setup, docs and skills, also when the command fails, but not for inspect', async () => {
    for (const command of [
      ['agent', 'setup'],
      ['agent', 'docs'],
      ['agent', 'skills', 'list'],
      ['agent', 'skills', 'read'],
    ]) {
      const runner = makeRunner(command, { name: 'serverless-mcp' })
      const quiet = jest
        .spyOn(runner, 'authenticateForAnalytics')
        .mockResolvedValue()
      await runner.run()
      expect(quiet).toHaveBeenCalledTimes(1)
    }
    mockAgentDocs.mockRejectedValueOnce(new Error('no such page'))
    const failing = makeBareRunner(['agent', 'docs'])
    const quiet = jest
      .spyOn(failing, 'authenticateForAnalytics')
      .mockResolvedValue()
    await expect(failing.run()).rejects.toThrow('no such page')
    expect(quiet).toHaveBeenCalledTimes(1)

    const inspect = makeRunner(
      ['agent', 'inspect'],
      {},
      { resolveStage: jest.fn(async () => 'dev') },
    )
    const notCalled = jest
      .spyOn(inspect, 'authenticateForAnalytics')
      .mockResolvedValue()
    await inspect.run()
    expect(notCalled).not.toHaveBeenCalled()
  })
})

describe('CoreRunner CLI schema for `agent inspect`', () => {
  const findAgentInspect = () => {
    const schema = CoreRunner.getCliSchema()
    const agent = schema.find((c) => c.command === 'agent')
    return agent.builder.find((c) => c.command === 'inspect')
  }

  it('declares `setup` before `skills` in the agent builder', () => {
    const agent = CoreRunner.getCliSchema().find((c) => c.command === 'agent')
    const commands = agent.builder.map((c) => c.command)
    expect(commands.indexOf('setup')).toBeGreaterThanOrEqual(0)
    expect(commands.indexOf('setup')).toBeLessThan(commands.indexOf('skills'))
    expect(agent.builder.find((c) => c.command === 'setup').description).toBe(
      'Set up AI agent integrations: install Agent Skills and report environment status',
    )
  })

  it('declares --dir on `setup` identically to `skills install`', () => {
    // agentSetup honors --dir, so --help must say so — and with the same
    // definition, since both commands feed the same resolver.
    const agent = CoreRunner.getCliSchema().find((c) => c.command === 'agent')
    const setupDir = agent.builder.find((c) => c.command === 'setup').builder[0]
      .options.dir
    const installDir = agent.builder
      .find((c) => c.command === 'skills')
      .builder.find((c) => c.command === 'install').builder[0].options.dir
    expect(setupDir).toEqual(installDir)
    expect(setupDir.array).toBe(true)
    expect(setupDir.type).toBe('string')
  })

  it('declares `docs [paths..]` and the `skills` list/read subcommands', () => {
    const agent = CoreRunner.getCliSchema().find((c) => c.command === 'agent')
    const docs = agent.builder.find((c) => c.command === 'docs [paths..]')
    expect(docs).toBeDefined()
    expect(docs.description).toBe(
      'Print Serverless Framework documentation: the page index, or the given pages (paths from the index)',
    )
    const skills = agent.builder.find((c) => c.command === 'skills')
    expect(skills.builder.find((c) => c.command === 'list').description).toBe(
      'List the Agent Skills bundled with this CLI version',
    )
    expect(
      skills.builder.find((c) => c.command === 'read [name] [file]')
        .description,
    ).toBe(
      'Print a bundled Agent Skill by name (its SKILL.md, or one of its files) without installing it; "serverless agent skills list" names them',
    )
  })

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

describe('CoreRunner login routing', () => {
  beforeEach(() => {
    mockLoginNonInteractive.mockClear()
    mockLog.isInteractive.mockReturnValue(false)
  })
  afterAll(() => mockLog.isInteractive.mockReturnValue(false))

  it('without a terminal, `login` runs the non-interactive login', async () => {
    await makeRunner(['login'], {}).run()
    expect(mockLoginNonInteractive).toHaveBeenCalledWith(
      expect.objectContaining({ org: undefined }),
    )
  })

  it('`login --org` passes the org through', async () => {
    await makeRunner(['login'], { org: 'beta' }).run()
    expect(mockLoginNonInteractive).toHaveBeenCalledWith(
      expect.objectContaining({ org: 'beta' }),
    )
  })

  it('`login --org` in a terminal also takes the prompt-free path', async () => {
    mockLog.isInteractive.mockReturnValue(true)
    await makeRunner(['login'], { org: 'beta' }).run()
    expect(mockLoginNonInteractive).toHaveBeenCalledWith(
      expect.objectContaining({ org: 'beta' }),
    )
  })

  // In the builder, where the help renderer reads options; `global: false`
  // keeps it off `login aws` and `login aws sso`.
  it('declares --org on `login` as a string option', () => {
    const login = CoreRunner.getCliSchema().find((c) => c.command === 'login')
    const org = login.builder.find((b) => b.options?.org)?.options.org
    expect(org).toMatchObject({ type: 'string', global: false })
  })
})
