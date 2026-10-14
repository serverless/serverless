import path from 'path'
import url from 'url'
import { setGlobalRendererSettings } from '@serverless/util'
import {
  CloudFormationClient,
  DescribeStacksCommand,
} from '@aws-sdk/client-cloudformation'
import { jest } from '@jest/globals'
import { getTestRunId, runSfCore } from '../../../utils/runSfCore'
import { TEST_REGION } from '../../../utils/testRegion.js'

const __dirname = url.fileURLToPath(new URL('.', import.meta.url))
const randomId = getTestRunId()

describe('SAM/CFN Projects - SAM Info Command', () => {
  const configFileDirPath = path.join(__dirname, 'fixture')
  const cloudformationClient = new CloudFormationClient({ region: TEST_REGION })
  const stackName = `sam-info-integration-test-${randomId}`
  const originalEnv = process.env

  beforeAll(async () => {
    process.chdir(configFileDirPath)

    setGlobalRendererSettings({
      isInteractive: false,
      logLevel: 'error',
    })
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

  test('Deploy', async () => {
    process.argv[2] = 'deploy'
    await runSfCore({
      coreParams: {
        options: { stack: stackName },
        command: ['deploy'],
      },
      jest,
    })
  })

  test('Run info command', async () => {
    process.argv[2] = 'info'
    await runSfCore({
      coreParams: {
        options: { stack: stackName },
        command: ['info'],
      },
      jest,
    })
  })

  test('Remove', async () => {
    process.argv[2] = 'remove'
    await runSfCore({
      coreParams: {
        stack: stackName,
        options: { stack: stackName },
        command: ['remove'],
      },
      jest,
    })
  })

  test('Ensure stack does not exist', async () => {
    await expect(
      cloudformationClient.send(
        new DescribeStacksCommand({
          StackName: stackName,
        }),
      ),
    ).rejects.toThrow()
  })

  test('Run info command', async () => {
    process.argv[2] = 'info'
    await expect(
      runSfCore({
        coreParams: {
          stack: stackName,
          options: { stack: stackName },
          command: ['info'],
        },
        jest,
      }),
    ).rejects.toThrow()
  })
})
