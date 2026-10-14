// The module mocks every CoreRunner routing test needs so core.js imports cleanly, shared by
// agent-routing.test.js and dev-setup-routing.test.js. Call mockCoreRunnerImports() at the top of
// a test file, before it imports core.js; it returns the mocks a test asserts on. The module
// paths are relative to this directory, as they are for the test files beside it.
import { jest } from '@jest/globals'

export const mockCoreRunnerImports = () => {
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
  jest.unstable_mockModule(
    '../../../../../src/lib/resolvers/manager.js',
    () => ({
      ResolverManager: class ResolverManager {},
    }),
  )
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
  jest.unstable_mockModule(
    '../../../../../src/lib/runners/framework.js',
    () => ({
      TraditionalRunner: class TraditionalRunner {
        constructor(args) {
          frameworkCtorCalls.push(args)
        }
        run(...args) {
          return mockFrameworkRun(...args)
        }
      },
    }),
  )

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
  jest.unstable_mockModule(
    '../../../../../src/lib/runners/core/mcp.js',
    () => ({
      default: jest.fn(),
    }),
  )
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

  return {
    mockLog,
    mockAgentSkillsInstall,
    mockAgentSetup,
    mockAgentDocs,
    mockAgentSkillsList,
    mockAgentSkillsRead,
    mockFrameworkRun,
    frameworkCtorCalls,
  }
}
