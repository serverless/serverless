import path from 'path'
import url from 'url'
import { stripVTControlCharacters } from 'util'
import { setGlobalRendererSettings } from '@serverless/util'
import {
  CloudFormationClient,
  DescribeStacksCommand,
} from '@aws-sdk/client-cloudformation'
import { DeleteRepositoryCommand, ECRClient } from '@aws-sdk/client-ecr'
import { jest } from '@jest/globals'
import { getTestStageName, runSfCore } from '../../utils/runSfCore.js'
import { TEST_REGION } from '../../utils/testRegion.js'

const __dirname = url.fileURLToPath(new URL('.', import.meta.url))

const SERVICE = 'sfc-lmi-gpu'

// Kept out of `npm test`: it needs the EC2 quota "Running On-Demand G and VT
// instances" (default 0 vCPUs) in the account, and a deploy and remove take
// about 11 minutes. Run it with `npm run test:managed-instances-gpu`.
describe('Serverless Framework Service - GPU functions on Managed Instances', () => {
  const fixtureDir = path.join(__dirname, 'fixture')
  const configFilePath = path.join(fixtureDir, 'serverless.yml')
  const stage = getTestStageName()
  const stackName = `${SERVICE}-${stage}`
  const originalEnv = process.env

  const cfnClient = new CloudFormationClient({ region: TEST_REGION })
  const ecrClient = new ECRClient({ region: TEST_REGION })

  const run = (command, options = {}, params = {}) =>
    runSfCore({
      coreParams: {
        options: { stage, c: configFilePath, ...options },
        command,
      },
      jest,
      ...params,
    })

  const stackExists = async () => {
    try {
      const { Stacks } = await cfnClient.send(
        new DescribeStacksCommand({ StackName: stackName }),
      )
      return Stacks?.[0]?.StackStatus !== 'DELETE_COMPLETE'
    } catch (error) {
      if (/does not exist/.test(error?.message ?? '')) return false
      throw error
    }
  }

  // A deploy that stops after creating the image repository and before the
  // stack exists leaves the repository behind, and `remove` needs the stack.
  const deleteImageRepository = async () => {
    try {
      await ecrClient.send(
        new DeleteRepositoryCommand({
          // The name getEcrRepositoryName() gives the repository
          repositoryName: `serverless-${SERVICE}-${stage}`
            .toLowerCase()
            .replace(/-+/g, '-')
            .replace(/-$/, ''),
          force: true,
        }),
      )
    } catch (error) {
      if (error?.name !== 'RepositoryNotFoundException') throw error
    }
  }

  /** Runs fn and returns what it wrote to stdout, without colour codes. */
  const captureStdout = async (fn) => {
    const chunks = []
    const write = process.stdout.write.bind(process.stdout)
    const spy = jest
      .spyOn(process.stdout, 'write')
      .mockImplementation((chunk, ...rest) => {
        chunks.push(
          typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString(),
        )
        return write(chunk, ...rest)
      })
    try {
      await fn()
    } finally {
      spy.mockRestore()
    }
    return stripVTControlCharacters(chunks.join(''))
  }

  beforeAll(async () => {
    setGlobalRendererSettings({ isInteractive: false, logLevel: 'error' })
    process.env = {
      ...originalEnv,
      SERVERLESS_PLATFORM_STAGE: 'dev',
      SERVERLESS_LICENSE_KEY: process.env.SERVERLESS_LICENSE_KEY_DEV,
      SERVERLESS_ACCESS_KEY: undefined,
    }

    await run(['deploy'])
  }, 1800000)

  afterEach(() => {
    jest.restoreAllMocks()
  })

  afterAll(async () => {
    // Remove the stack whatever the tests did, and fail the run when it
    // cannot be removed: a GPU instance left running bills by the hour.
    jest.restoreAllMocks()
    let failure
    try {
      if (await stackExists()) {
        await run(['remove'], {}, { expectError: true })
        if (await stackExists()) throw new Error('the stack still exists')
      }
      await deleteImageRepository()
    } catch (error) {
      failure = new Error(`Teardown of ${stackName} failed: ${error.message}`)
    }
    process.env = originalEnv
    if (failure) throw failure
  }, 1800000)

  test('runs the container image on a GPU, with the configured /tmp', async () => {
    // Every invoke passes a payload: without --data or --path the command
    // reads stdin, which a Jest worker never closes.
    const stdout = await captureStdout(() =>
      run(['invoke'], { function: 'probe', data: '{}' }),
    )
    const result = JSON.parse(stdout.slice(stdout.indexOf('{')))

    // accelerator.memory: 3 on g6f types gives a 3 GB slice of an NVIDIA L4
    expect(result.gpu).toMatch(/^NVIDIA /)
    expect(result.devices).toContain('/dev/nvidia0')
    // ephemeralStorageSize: 20480, above the 10240 MB limit of other functions
    expect(result.tmpMiB).toBeGreaterThan(19000)
  })
})
