import path from 'path'
import url from 'url'
import { jest } from '@jest/globals'
import { log } from '@serverless/util'
import { getRunner } from '../../../../src/lib/router.js'
import { variables } from '../../../../src/lib/resolvers/index.js'
import { ComposeRunner } from '../../../../src/lib/runners/compose/compose.js'

const __dirname = url.fileURLToPath(new URL('.', import.meta.url))

// Regression for the router→compose wiring: getRunner builds the up-front
// resolver manager for the SELECTED runner's config. When that runner is the
// ComposeRunner, the config is a serverless-compose.yml and its compose-only
// resolver providers (e.g. `type: service`) are valid — but only if the manager
// is told it is resolving a compose file. getRunner must forward
// `isComposeConfigFile: RunnerClass.isComposeConfigFile`; without it, the
// compose file is validated as a plain serverless.yml and its `service`
// resolver is rejected before the ComposeRunner ever runs.
describe('getRunner marks a ComposeRunner config as a compose config file', () => {
  const fixtureDir = path.join(
    __dirname,
    'fixtures',
    'compose-service-resolver',
  )
  const logger = log.get('test:router-compose-config-file')

  afterEach(() => {
    jest.restoreAllMocks()
  })

  test('a serverless-compose.yml with a `type: service` resolver is accepted (not rejected as serverless.yml)', async () => {
    // Passthrough spy: capture the arguments the router hands to
    // createResolverManager while letting the REAL manager (and its real
    // resolver validation) run, so this asserts genuine acceptance, not just
    // argument plumbing.
    let capturedArgs
    const original = variables.createResolverManager
    const spy = jest
      .spyOn(variables, 'createResolverManager')
      .mockImplementation(async (args) => {
        capturedArgs = args
        return original(args)
      })

    let error
    let result
    try {
      result = await getRunner({
        logger,
        command: ['deploy'],
        options: { stage: 'dev' },
        compose: { workingDir: fixtureDir },
        versions: {},
      })
    } catch (err) {
      error = err
    } finally {
      spy.mockRestore()
    }

    // The compose file was selected and handed to the manager as a compose file.
    expect(capturedArgs).toBeDefined()
    expect(capturedArgs.isComposeConfigFile).toBe(true)
    // Real validation accepted the compose-only `service` resolver: getRunner
    // must NOT surface the "only available in Serverless Compose" rejection.
    // (Without the router fix, this is exactly the error getRunner throws.)
    expect(error?.message ?? '').not.toMatch(
      /only available in Serverless Compose/,
    )
    // With the fix in place the run reaches a constructed runner.
    expect(error).toBeUndefined()
    expect(result?.runner).toBeDefined()
  })

  test('a plain serverless.yml gets no allowed paths (nothing is deferred there)', async () => {
    let capturedArgs
    const original = variables.createResolverManager
    const spy = jest
      .spyOn(variables, 'createResolverManager')
      .mockImplementation(async (args) => {
        capturedArgs = args
        return original(args)
      })

    try {
      await getRunner({
        logger,
        command: ['deploy'],
        options: { stage: 'dev' },
        compose: { workingDir: path.join(fixtureDir, 'orders-db') },
        versions: {},
      })
    } finally {
      spy.mockRestore()
    }

    expect(capturedArgs).toBeDefined()
    expect(capturedArgs.isComposeConfigFile).toBe(false)
  })
})
