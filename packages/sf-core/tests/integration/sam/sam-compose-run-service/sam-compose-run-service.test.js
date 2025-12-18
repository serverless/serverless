/* eslint-disable no-undef */
import path from 'path'
import url from 'url'
import { promises as fs } from 'fs'
import { setGlobalRendererSettings } from '@serverless/util'
import {
  CloudFormationClient,
  DescribeStacksCommand,
} from '@aws-sdk/client-cloudformation'
import { jest } from '@jest/globals'
import { getTestStageName, runSfCore } from '../../../utils/runSfCore'

const __dirname = url.fileURLToPath(new URL('.', import.meta.url))
const randomId = Math.floor(1000 + Math.random() * 9000).toString()
let samEndpoint, frameworkEndpoint

describe('SAM/CFN - Deploy only SAM service inside Compose', () => {
  const configFileDirPath = path.join(__dirname, 'fixture')
  const cloudformationClient = new CloudFormationClient({ region: 'us-east-1' })
  const samStackName = `sam-tests-run-service-sam-${randomId}`
  const frameworkStackName = `sam-tests-run-service-framework-${randomId}`
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

  test('Ensure both stacks exist', async () => {
    const samDescribeStacksResponse = await cloudformationClient.send(
      new DescribeStacksCommand({
        StackName: samStackName,
      }),
    )

    const frameworkDescribeStacksResponse = await cloudformationClient.send(
      new DescribeStacksCommand({
        StackName: frameworkStackName,
      }),
    )

    expect(samDescribeStacksResponse.Stacks?.length).toEqual(1)
    expect(frameworkDescribeStacksResponse.Stacks?.length).toEqual(1)

    const samOutputs = samDescribeStacksResponse.Stacks[0].Outputs
    const frameworkOutputs = frameworkDescribeStacksResponse.Stacks[0].Outputs

    samEndpoint = samOutputs.find((o) => o.OutputKey === 'Endpoint').OutputValue

    frameworkEndpoint = frameworkOutputs.find(
      (o) => o.OutputKey === 'HttpApiUrl',
    ).OutputValue
  })

  test('Update both services', async () => {
    const frameworkTemplateFilePath = path.resolve(
      configFileDirPath,
      'framework',
      'serverless.json',
    )

    const samTemplateFilePath = path.resolve(
      configFileDirPath,
      'sam',
      'template.json',
    )

    const frameworkTemplateFile = JSON.parse(
      await fs.readFile(frameworkTemplateFilePath, 'utf-8'),
    )

    const samTemplateFile = JSON.parse(
      await fs.readFile(samTemplateFilePath, 'utf-8'),
    )

    frameworkTemplateFile.provider.environment.TEST_ENV = randomId

    samTemplateFile.Globals.Function.Environment.Variables.TEST_ENV = randomId

    await fs.writeFile(
      frameworkTemplateFilePath,
      JSON.stringify(frameworkTemplateFile, null, 2),
    )

    await fs.writeFile(
      samTemplateFilePath,
      JSON.stringify(samTemplateFile, null, 2),
    )
  })

  test('Deploy only the SAM service', async () => {
    process.argv[2] = 'deploy'

    await runSfCore({
      coreParams: {
        options: { stack: samStackName, service: 'sam' },
        command: ['deploy'],
      },
      jest,
    })
  })

  test('Ensure only SAM service was updated', async () => {
    const samResponse = await await fetch(samEndpoint, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    })

    const frameworkResponse = await await fetch(frameworkEndpoint, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    })

    expect(await samResponse.json()).toEqual({ TEST_ENV: randomId })
    expect(await frameworkResponse.json()).not.toEqual({ TEST_ENV: randomId })
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

  test('Ensure both stacks do not exist', async () => {
    expect(
      cloudformationClient.send(
        new DescribeStacksCommand({
          StackName: samStackName,
        }),
      ),
    ).rejects.toThrow()

    expect(
      cloudformationClient.send(
        new DescribeStacksCommand({
          StackName: frameworkStackName,
        }),
      ),
    ).rejects.toThrow()
  })
})
