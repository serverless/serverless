/* eslint-disable no-undef */
import path from 'path'
import readConfig from '@serverless/framework/lib/configuration/read.js'
import url from 'url'
import {
  LambdaClient,
  GetFunctionCommand,
  InvokeCommand,
} from '@aws-sdk/client-lambda'
import {
  CloudFormationClient,
  DescribeStacksCommand,
} from '@aws-sdk/client-cloudformation'
import { ListObjectsV2Command, S3Client } from '@aws-sdk/client-s3'
import { jest } from '@jest/globals'
import { setGlobalRendererSettings } from '@serverless/util'
import { getTestStageName, runSfCore } from '../../../utils/runSfCore.js'

const __dirname = url.fileURLToPath(new URL('.', import.meta.url))

const checkIfS3ObjectsExist = async (s3Client, bucketName, prefix) => {
  const listObjectsCommand = new ListObjectsV2Command({
    Bucket: bucketName,
    Prefix: prefix,
  })

  const objectList = await s3Client.send(listObjectsCommand)

  return objectList?.Contents?.length > 0
}

describe('Serverless Framework Service - Enable Legacy Deployment Bucket through the YML file with changesets deployment method', () => {
  const configFileDirPath = path.join(__dirname, 'fixture')
  const lambdaClient = new LambdaClient({ region: 'us-east-1' })
  const cfnClient = new CloudFormationClient({ region: 'us-east-1' })
  const s3Client = new S3Client({ region: 'us-east-1' })
  const originalEnv = process.env
  const stage = getTestStageName()
  let service, configFilePath

  beforeAll(async () => {
    setGlobalRendererSettings({
      isInteractive: false,
      logLevel: 'error',
    })
    configFilePath = path.join(configFileDirPath, 'serverless.yml')
    service = await readConfig(configFilePath)

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
    await runSfCore({
      coreParams: {
        options: { stage, c: configFilePath },
        command: ['deploy'],
      },
      jest,
    })
  })

  test('Validate Functions Deployed', async () => {
    const functionsToCheck = Object.keys(service.functions).map(
      (functionName) => `${service.service}-${stage}-${functionName}`,
    )

    for (const functionName of functionsToCheck) {
      const getFunctionResponse = await lambdaClient.send(
        new GetFunctionCommand({
          FunctionName: functionName,
        }),
      )

      expect(getFunctionResponse.Configuration).toBeDefined()
    }
  })

  test('Validate Functions Run', async () => {
    const functionsToCheck = Object.keys(service.functions).map(
      (functionName) => `${service.service}-${stage}-${functionName}`,
    )

    for (const functionName of functionsToCheck) {
      const invokeResponse = await lambdaClient.send(
        new InvokeCommand({
          FunctionName: functionName,
          InvocationType: 'RequestResponse',
        }),
      )

      const decoder = new TextDecoder('utf-8')
      const payloadString = JSON.parse(decoder.decode(invokeResponse.Payload))

      expect(payloadString.statusCode).toBe(200)
    }
  })

  test('Validate legacy stack deployment bucket was used', async () => {
    const stackName = `${service.service}-${stage}`
    const { Stacks } = await cfnClient.send(
      new DescribeStacksCommand({
        StackName: stackName,
      }),
    )

    const stack = Stacks[0]

    expect(stack.ChangeSetId).toBeDefined()

    const outputs = stack.Outputs

    expect(
      outputs.find(
        (output) => output.OutputKey === 'ServerlessDeploymentBucketName',
      ),
    ).toBeDefined()

    const deploymentBucketOutput = outputs.find(
      (output) => output.OutputKey === 'ServerlessDeploymentBucketName',
    )

    const deploymentBucketName = deploymentBucketOutput.OutputValue

    // Make sure the legacy deployment bucket exists and contain the expected artifacts
    expect(
      await checkIfS3ObjectsExist(
        s3Client,
        deploymentBucketName,
        `serverless/${service.service}/${stage}`,
      ),
    ).toBe(true)

    expect(outputs).toBeDefined()
    expect(Array.isArray(outputs)).toBe(true)
  })

  test('Remove', async () => {
    await runSfCore({
      coreParams: {
        options: { stage, c: configFilePath },
        command: ['remove'],
      },
      jest,
    })
  })
})
