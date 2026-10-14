import { jest } from '@jest/globals'
import fs from 'fs'
import os from 'os'
import path from 'path'

// The checks themselves are tested in attach/commands.test.js; here, what the plugin passes them.
const restoreStageBeforeCommand = jest.fn(async () => {})
const restoreFunctionBeforeDeployFunction = jest.fn(async () => {})
jest.unstable_mockModule(
  '../../../../../../lib/plugins/aws/dev/attach/commands.js',
  () => ({
    restoreStageBeforeCommand,
    restoreFunctionBeforeDeployFunction,
    runDevRestore: jest.fn(),
    runDevSetup: jest.fn(),
    devModeCommandHooks: ({ handlers }) => ({
      'before:deploy:deploy': handlers.restoreStage('deploy'),
      'before:remove:remove': handlers.restoreStage('removal'),
      'before:deploy:function:initialize': handlers.restoreFunction,
    }),
  }),
)
const { default: AwsDev } =
  await import('../../../../../../lib/plugins/aws/dev/index.js')

const dirs = []
afterAll(() => {
  for (const dir of dirs) fs.rmSync(dir, { recursive: true, force: true })
})
const serviceDir = ({ ranDevMode }) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sls-dev-wiring-'))
  dirs.push(dir)
  if (ranDevMode) {
    fs.mkdirSync(path.join(dir, '.serverless', 'dev'), { recursive: true })
  }
  return dir
}
const fakeServerless = (dir, commands) => ({
  serviceDir: dir,
  getProvider: () => ({ name: 'provider' }),
  processedInput: { commands, options: {} },
  service: { functions: { api: {} }, initialServerlessConfig: {} },
  configurationInput: {},
})

afterEach(() => {
  restoreStageBeforeCommand.mockClear()
  restoreFunctionBeforeDeployFunction.mockClear()
})

test.each([
  ['deploy', ['deploy'], 'before:deploy:deploy', restoreStageBeforeCommand],
  ['remove', ['remove'], 'before:remove:remove', restoreStageBeforeCommand],
  [
    'deploy function',
    ['deploy', 'function'],
    'before:deploy:function:initialize',
    restoreFunctionBeforeDeployFunction,
  ],
])(
  '%s reads whether Dev Mode ran here when it starts, before packaging empties .serverless/',
  async (_, commands, hook, check) => {
    const ran = serviceDir({ ranDevMode: true })
    const dev = new AwsDev(fakeServerless(ran, commands), {})
    // What packaging does before the check runs.
    fs.rmSync(path.join(ran, '.serverless'), { recursive: true, force: true })
    await dev.hooks[hook]()
    expect(check).toHaveBeenCalledWith(
      expect.objectContaining({ devModeRanHere: true }),
    )

    check.mockClear()
    const never = serviceDir({ ranDevMode: false })
    await new AwsDev(fakeServerless(never, commands), {}).hooks[hook]()
    expect(check).toHaveBeenCalledWith(
      expect.objectContaining({ devModeRanHere: false }),
    )
  },
)
