import { GetParameterCommand, SSMClient } from '@aws-sdk/client-ssm'
import {
  ListObjectsV2Command,
  NoSuchBucket,
  S3Client,
} from '@aws-sdk/client-s3'
import path from 'path'
import url from 'url'
import { jest } from '@jest/globals'
import {
  getTestStageName,
  runSfCore,
  runSfCoreBinary,
} from '../../../utils/runSfCore.js'
import { setGlobalRendererSettings } from '@serverless/util'
import { GetFunctionCommand, LambdaClient } from '@aws-sdk/client-lambda'
import readConfig from '@serverless/framework/lib/configuration/read.js'
import {
  CloudFormationClient,
  DescribeStackResourceCommand,
} from '@aws-sdk/client-cloudformation'

const __dirname = url.fileURLToPath(new URL('.', import.meta.url))

describe('Global Deployment Bucket', () => {
  const lambdaClient = new LambdaClient({ region: 'us-east-1' })
  const cfClient = new CloudFormationClient({ region: 'us-east-1' })
  const configFileDirPath = path.join(__dirname, 'fixture')
  const configFilePath = path.join(
    configFileDirPath,
    'compose',
    'serverless-compose.yml',
  )
  const serviceAConfigFilePath = path.join(
    configFileDirPath,
    'service-a',
    'serverless.yml',
  )
  const originalEnv = process.env
  const stage = getTestStageName()
  let stackDeploymentBucketName
  let globalDeploymentBucketName
  let serviceName

  const s3Client = new S3Client({ region: 'us-east-1' })
  const ssmClient = new SSMClient({ region: 'us-east-1' })

  process.env.TEST_STAGE = stage

  beforeAll(async () => {
    setGlobalRendererSettings({
      isInteractive: false,
      logLevel: 'debug',
    })

    process.env = {
      ...originalEnv,
      SERVERLESS_PLATFORM_STAGE: 'dev',
      SERVERLESS_LICENSE_KEY: process.env.SERVERLESS_LICENSE_KEY_DEV,
      SERVERLESS_ACCESS_KEY: undefined,
    }
  })

  afterAll(async () => {
    process.env = originalEnv
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  test('Deploy service-a without Compose using Serverless v3 - deployment bucket should be created in the CF stack', async () => {
    await expect(
      runSfCoreBinary({
        coreParams: {
          command: ['deploy'],
          options: { stage },
          customConfigFilePath: serviceAConfigFilePath,
        },
        jest,
        expectError: false,
        binaryPath: 'serverless',
        // Use the serverless v3 binary to deploy service-a
        // with traditional deployment bucket
      }),
    ).resolves.not.toThrow()

    // Check if ServerlessDeploymentBucket exists in the CF stack
    const service = await readConfig(serviceAConfigFilePath)
    serviceName = service.service
    const stackName = `${service.service}-${stage}`
    const describeStackResourceCommand = new DescribeStackResourceCommand({
      StackName: stackName,
      LogicalResourceId: 'ServerlessDeploymentBucket',
    })
    const describeStackResourceResponse = await cfClient.send(
      describeStackResourceCommand,
    )
    expect(describeStackResourceResponse.StackResourceDetail).toBeDefined()
    const stackBucket =
      describeStackResourceResponse.StackResourceDetail.PhysicalResourceId
    expect(stackBucket).toBeDefined()
    stackDeploymentBucketName = stackBucket
    // 1. Check if deployment artifacts exist in the bucket
    expect(
      await checkIfS3ObjectsExist(
        s3Client,
        stackBucket,
        `serverless/${serviceName}/${stage}`,
      ),
    ).toBe(true)
  })

  test('Deploy service-a without Compose - existing deployment bucket from the stack should be used', async () => {
    await expect(
      runSfCore({
        coreParams: {
          options: { stage, c: serviceAConfigFilePath },
          command: ['deploy'],
        },
        jest,
        expectError: false,
      }),
    ).resolves.not.toThrow()

    // 1. Fetch the bucket name from SSM
    const parameterResult = await ssmClient.send(
      new GetParameterCommand({
        Name: '/serverless-framework/deployment/s3-bucket',
      }),
    )

    expect(parameterResult.Parameter).toBeDefined()
    expect(parameterResult.Parameter.Value).toBeDefined()

    const parameterValue = JSON.parse(parameterResult.Parameter.Value)
    const bucketName = parameterValue.bucketName
    expect(bucketName).toBeDefined()
    globalDeploymentBucketName = bucketName

    // 2. Check if deployment artifacts exist in the global bucket
    expect(
      await checkIfS3ObjectsExist(
        s3Client,
        globalDeploymentBucketName,
        `serverless/${serviceName}/${stage}`,
      ),
    ).toBe(false)
  })

  test('Run `deploy` command on serverless-compose.yml with service-a - global deployment bucket should be used', async () => {
    await expect(
      runSfCore({
        coreParams: {
          options: { stage, c: configFilePath },
          command: ['deploy'],
        },
        jest,
        expectError: false,
      }),
    ).resolves.not.toThrow()

    // Check if deployment artifacts exist in the global bucket
    expect(
      await checkIfS3ObjectsExist(
        s3Client,
        globalDeploymentBucketName,
        `serverless/${serviceName}/${stage}`,
      ),
    ).toBe(true)
  })

  test('Validate if Compose params are used', async () => {
    const service = await readConfig(configFilePath)
    const servicePaths = Object.entries(service.services).map(
      ([, serviceConfig]) => {
        return path.join(
          path.dirname(configFilePath),
          serviceConfig.path,
          'serverless.yml',
        )
      },
    )
    const parsedServices = await Promise.all(
      servicePaths.map((servicePath) => readConfig(servicePath)),
    )
    const functionsToCheck = parsedServices
      .map((service) =>
        Object.keys(service.functions).map(
          (functionName) => `${service.service}-${stage}-${functionName}`,
        ),
      )
      .flat()

    for (const functionName of functionsToCheck) {
      const getFunctionResponse = await lambdaClient.send(
        new GetFunctionCommand({
          FunctionName: functionName,
        }),
      )

      expect(getFunctionResponse.Configuration).toBeDefined()
      expect(getFunctionResponse.Configuration.Description).toBe(
        'ssm-value compose-param',
      )
    }
  })

  test('Remove', async () => {
    await expect(
      runSfCore({
        coreParams: {
          options: { stage, c: configFilePath },
          command: ['remove'],
        },
        jest,
        expectError: false,
      }),
    ).resolves.not.toThrow()

    // Check if the stack deployment bucket is deleted
    await expect(
      checkIfS3ObjectsExist(s3Client, stackDeploymentBucketName, ''),
    ).rejects.toThrow(NoSuchBucket)
    // Check if the global deployment bucket deployment artifacts are deleted
    expect(
      await checkIfS3ObjectsExist(
        s3Client,
        globalDeploymentBucketName,
        `serverless/${serviceName}/${stage}`,
      ),
    ).toBe(false)
  })
})

const checkIfS3ObjectsExist = async (s3Client, bucketName, prefix) => {
  const listObjectsCommand = new ListObjectsV2Command({
    Bucket: bucketName,
    Prefix: prefix,
  })

  const objectList = await s3Client.send(listObjectsCommand)
  return objectList?.Contents?.length > 0
}
