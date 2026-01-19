import path from 'path'
import { promises as fs } from 'fs'
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
let endpoint

describe('SAM/CFN Projects - SAM Existing App', () => {
  const configFileDirPath = path.join(__dirname, 'fixture')
  const cloudformationClient = new CloudFormationClient({ region: 'us-east-1' })
  const stackName = `sam-existing-integration-test-${randomId}`
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

  test('Create', async () => {
    process.argv[2] = 'deploy'
    await runSfCore({
      coreParams: {
        options: { stack: stackName },
        command: ['deploy'],
      },
      jest,
    })
  })

  test('Ensure stack exists', async () => {
    const describeStacksResponse = await cloudformationClient.send(
      new DescribeStacksCommand({
        StackName: stackName,
      }),
    )

    expect(describeStacksResponse.Stacks?.length).toEqual(1)

    const outputs = describeStacksResponse.Stacks[0].Outputs

    endpoint = outputs.find((o) => o.OutputKey === 'WebEndpoint').OutputValue
  })

  test('Update env var value', async () => {
    const templateFilePath = path.resolve(configFileDirPath, 'template.json')

    const templateFile = JSON.parse(
      await fs.readFile(templateFilePath, 'utf-8'),
    )

    templateFile.Globals.Function.Environment.Variables.TEST_ENV = randomId

    await fs.writeFile(templateFilePath, JSON.stringify(templateFile, null, 2))
  })

  test('Update', async () => {
    process.argv[2] = 'deploy'
    await runSfCore({
      coreParams: {
        options: { stack: stackName },
        command: ['deploy'],
      },
      jest,
    })
  })

  test('Ensure service runs as expected', async () => {
    const getResponse = await await fetch(endpoint, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    })

    expect(await getResponse.json()).toEqual({ TEST_ENV: randomId })
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
})
