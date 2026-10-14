import { jest } from '@jest/globals'
import { mockCoreRunnerImports } from './core-runner-mocks.js'

// `dev setup` outside a service directory, in the core runner: it runs the Framework's setup
// with the command's options and no sign-in first, then counts the run with a quiet sign-in.
// The mocks of core-runner-mocks.js let core.js import cleanly.

mockCoreRunnerImports()

const mockRunDevSetupOutsideService = jest.fn(async () => {})
jest.unstable_mockModule(
  '@serverless/framework/lib/plugins/aws/dev/attach/setup-outside.js',
  () => ({ runDevSetupOutsideService: mockRunDevSetupOutsideService }),
)

const { CoreRunner } =
  await import('../../../../../src/lib/runners/core/core.js')
const { default: frameworkCommandsSchema } =
  await import('@serverless/framework/lib/cli/commands-schema.js')

// The state a run from an empty directory is in: no configuration file.
const bare = (command, options = {}) =>
  new CoreRunner({
    command,
    options,
    config: null,
    configFilePath: null,
    versionFramework: '4.0.0',
    resolverManager: {},
  })

beforeEach(() => mockRunDevSetupOutsideService.mockReset())

describe('CoreRunner and dev setup outside a service', () => {
  it('runs the setup with the options, then counts the run with a quiet sign-in', async () => {
    const order = []
    mockRunDevSetupOutsideService.mockImplementation(async () =>
      order.push('setup'),
    )
    const options = { region: 'eu-west-1', 'aws-profile': 'admin' }
    const runner = bare(['dev', 'setup'], options)
    runner.authenticateForAnalytics = jest.fn(async () =>
      order.push('analytics'),
    )
    await runner.run()
    expect(mockRunDevSetupOutsideService).toHaveBeenCalledWith({ options })
    expect(order).toEqual(['setup', 'analytics'])
  })

  it('never asks to sign in before the setup', async () => {
    const runner = bare(['dev', 'setup'])
    runner.authenticate = jest.fn()
    runner.resolveVariablesAndAuthenticate = jest.fn()
    runner.authenticateForAnalytics = jest.fn(async () => {})
    await runner.run()
    expect(runner.authenticate).not.toHaveBeenCalled()
    expect(runner.resolveVariablesAndAuthenticate).not.toHaveBeenCalled()
  })

  it('a failed setup still counts the run, and fails', async () => {
    const failure = Object.assign(new Error('denied'), {
      code: 'DEV_SETUP_ACCESS_DENIED',
    })
    mockRunDevSetupOutsideService.mockRejectedValue(failure)
    const runner = bare(['dev', 'setup'])
    runner.authenticateForAnalytics = jest.fn(async () => {})
    await expect(runner.run()).rejects.toBe(failure)
    expect(runner.authenticateForAnalytics).toHaveBeenCalledTimes(1)
  })

  it('another dev command here is not found', async () => {
    await expect(bare(['dev', 'restore']).run()).rejects.toMatchObject({
      code: 'UNRECOGNIZED_CLI_COMMAND',
    })
    expect(mockRunDevSetupOutsideService).not.toHaveBeenCalled()
  })

  it('the schema declares dev setup only for that command, so it never routes anything else here', () => {
    const names = (schema) => schema.map((entry) => entry.command)
    expect(names(bare(['dev', 'setup']).getCliSchema())).toContain('dev')
    expect(names(bare(['login']).getCliSchema())).not.toContain('dev')
    expect(names(CoreRunner.getCliSchema())).not.toContain('dev')
  })

  it("the dev setup schema is the Framework's own entry plus --region and --aws-profile", () => {
    const entry = frameworkCommandsSchema.get('dev setup')
    const dev = bare(['dev', 'setup'])
      .getCliSchema()
      .find((schema) => schema.command === 'dev')
    const setup = dev.builder.find((schema) => schema.command === 'setup')
    const { options } = setup.builder[0]
    expect(setup.description).toBe(entry.usage)
    expect(Object.keys(options).sort()).toEqual(
      ['aws-profile', 'region', ...Object.keys(entry.options)].sort(),
    )
    for (const [name, option] of Object.entries(entry.options)) {
      expect(options[name]).toMatchObject({
        description: option.usage,
        type: option.type,
      })
    }
    expect(options.region).toMatchObject({ alias: 'r', type: 'string' })
  })
})
