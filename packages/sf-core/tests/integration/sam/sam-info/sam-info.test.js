import path from 'path'
import url from 'url'
import { setGlobalRendererSettings } from '@serverless/util'
import {
  CloudFormationClient,
  DescribeStacksCommand,
} from '@aws-sdk/client-cloudformation'
import { jest } from '@jest/globals'
import { runSfCore } from '../../../utils/runSfCore'

const __dirname = url.fileURLToPath(new URL('.', import.meta.url))
const randomId = Math.floor(1000 + Math.random() * 9000).toString()

describe('SAM/CFN Projects - SAM Info Command', () => {
  const configFileDirPath = path.join(__dirname, 'fixture')
  const cloudformationClient = new CloudFormationClient({ region: 'us-east-1' })
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
    expect(
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
