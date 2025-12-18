/* eslint-disable no-undef */
import path from 'path'
import url from 'url'
import { setGlobalRendererSettings } from '@serverless/util'
import {
  CloudFormationClient,
  DescribeStacksCommand,
} from '@aws-sdk/client-cloudformation'
import { jest } from '@jest/globals'
import { getTestStageName, runSfCore } from '../../../utils/runSfCore'

const __dirname = url.fileURLToPath(new URL('.', import.meta.url))
const randomId = Math.floor(1000 + Math.random() * 9000).toString()
let endpoint

describe('SAM/CFN - SAM state within a Compose app', () => {
  const configFileDirPath = path.join(__dirname, 'fixture')
  const cloudformationClient = new CloudFormationClient({ region: 'us-east-1' })
  const samStackName = `sam-integration-tests-sam-compose-state-sam-${randomId}`
  const frameworkStackname = `sam-integration-tests-sam-compose-state-framework-${randomId}`
  const originalEnv = process.env
  const stage = getTestStageName()

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
      STACK_RANDOM_ID: randomId,
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
        options: { stage },
        command: ['deploy'],
      },
      jest,
    })
  })

  test('Ensure framework stack exists', async () => {
    const describeStacksResponse = await cloudformationClient.send(
      new DescribeStacksCommand({
        StackName: frameworkStackname,
      }),
    )

    expect(describeStacksResponse.Stacks?.length).toEqual(1)

    const outputs = describeStacksResponse.Stacks[0].Outputs

    endpoint = outputs.find((o) => o.OutputKey === 'HttpApiUrl').OutputValue
  })

  test('Ensure variables resolved correctly', async () => {
    const getResponse = await fetch(endpoint, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    })

    expect(await getResponse.json()).toEqual({
      SAM_OUTPUT_PARAM: 'This is a test SAM output',
    })
  })

  // Run deploy again to make sure it can handle "no updates to be performed"
  test('Deploy', async () => {
    process.argv[2] = 'deploy'
    await runSfCore({
      coreParams: {
        options: { stage },
        command: ['deploy'],
      },
      jest,
    })
  })

  test('Remove', async () => {
    process.argv[2] = 'remove'
    await runSfCore({
      coreParams: {
        options: { stage },
        command: ['remove'],
      },
      jest,
    })
  })

  test('Ensure SAM stack does not exist', async () => {
    expect(
      cloudformationClient.send(
        new DescribeStacksCommand({
          StackName: samStackName,
        }),
      ),
    ).rejects.toThrow()
  })

  // Run remove again to make sure it can handle when it was already removed
  test('Remove again', async () => {
    process.argv[2] = 'remove'
    await runSfCore({
      coreParams: {
        options: { stage },
        command: ['remove'],
      },
      jest,
    })
  })
})
