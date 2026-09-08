import path from 'path'
import url from 'url'
import { jest } from '@jest/globals'
import { LambdaClient, GetFunctionCommand } from '@aws-sdk/client-lambda'
import { setGlobalRendererSettings } from '@serverless/util'
import { getTestStageName, runSfCore } from '../../../../utils/runSfCore'

const __dirname = url.fileURLToPath(new URL('.', import.meta.url))

/**
 * Live check that a Terraform state file is fetched once per process and the
 * outputs are shared: two Compose services reading two outputs each from the
 * same state must cost exactly one `GetObject`. The only observable call count
 * is the resolvers' `--debug` summary line.
 *
 * This scenario lives in its own file so that the request counters and the
 * resolver's state memo start empty: Jest gives every test file its own module
 * registry, so the numbers below are this Compose run's own spend.
 */
describe('Terraform Resolvers - S3 Output - one fetch per state across Compose services', () => {
  jest.setTimeout(900_000)
  const composeConfigPath = path.join(
    __dirname,
    'fixture',
    'compose',
    'serverless-compose.yml',
  )
  const lambdaClient = new LambdaClient({ region: 'us-east-1' })
  const originalEnv = process.env
  const stage = getTestStageName()
  let stderr = []

  // The resolvers' debug summary is the only observable request count; the CLI
  // logger writes it to stderr under the `core:resolver:aws` namespace.
  const summaryLines = () =>
    stderr
      .join('')
      .split('\n')
      .filter((line) => line.includes('core:resolver:aws:'))
      .map((line) => line.replace(/.*core:resolver:aws:\s*/, '').trim())

  beforeAll(() => {
    setGlobalRendererSettings({ isInteractive: false })
    process.env = {
      ...originalEnv,
      SERVERLESS_PLATFORM_STAGE: 'dev',
      SERVERLESS_LICENSE_KEY: process.env.SERVERLESS_LICENSE_KEY_DEV,
      SERVERLESS_ACCESS_KEY: undefined,
    }
  })

  afterAll(() => {
    process.env = originalEnv
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  test('Deploy: two services reading two outputs each cost one GetObject', async () => {
    stderr = []
    jest.spyOn(process.stderr, 'write').mockImplementation((chunk) => {
      stderr.push(String(chunk))
      return true
    })

    await runSfCore({
      coreParams: {
        options: { stage, c: composeConfigPath },
        command: ['deploy'],
        debug: true,
      },
      jest,
    })

    /**
     * The memo sits in front of the shared request layer, so `1 GetObject
     * calls` is the whole run's spend on this state: the second Compose
     * service adds no request. The `terraform:` line leaves the placeholder
     * figure out for that same reason — the layer only ever sees the one
     * reference that missed the memo, not the four in the fixtures.
     *
     * A summary line prints when it first exists and again only when its
     * numbers change, so a shared fetch is one `terraform:` line for the run,
     * however many services print a summary after it.
     *
     * On its own this assertion cannot tell a shared fetch apart from four
     * references that were never resolved at all - both spend one GetObject.
     * The `Validate` test below is what proves the four references resolved,
     * and to the same state, so it is not redundant with this one.
     */
    const terraformLines = summaryLines().filter((line) =>
      line.startsWith('terraform:'),
    )
    expect(terraformLines).toHaveLength(1)
    expect(terraformLines[0]).toMatch(
      /^terraform: 1 state files, 1 GetObject calls, \d+ throttled attempts$/,
    )
  })

  test('Validate: both services received both outputs', async () => {
    const suffixes = new Set()
    for (const service of ['res-ts-compose-1', 'res-ts-compose-2']) {
      const { Configuration } = await lambdaClient.send(
        new GetFunctionCommand({ FunctionName: `${service}-${stage}-api` }),
      )
      const env = Configuration.Environment.Variables
      expect(env.TEST).toMatch(/^key-1-value-[a-fA-F0-9]{16}$/)
      expect(env.TEST2).toMatch(/^key-2-value-[a-fA-F0-9]{16}$/)
      expect(env.TEST.slice('key-1-value-'.length)).toBe(
        env.TEST2.slice('key-2-value-'.length),
      )
      suffixes.add(env.TEST.slice('key-1-value-'.length))
    }
    // One suffix across both services: they read the same state, not two
    // separate downloads that happened to see the same Terraform run.
    expect(suffixes.size).toBe(1)
  })

  test('Remove', async () => {
    await runSfCore({
      coreParams: {
        options: { stage, c: composeConfigPath },
        command: ['remove'],
      },
      jest,
    })
  })
})
