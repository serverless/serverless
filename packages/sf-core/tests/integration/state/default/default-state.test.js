import {
  DeleteParameterCommand,
  GetParameterCommand,
  SSMClient,
} from '@aws-sdk/client-ssm'
import {
  BucketVersioningStatus,
  DeleteBucketCommand,
  DeleteObjectsCommand,
  GetBucketVersioningCommand,
  GetObjectCommand,
  HeadBucketCommand,
  ListObjectsV2Command,
  ListObjectVersionsCommand,
  S3Client,
} from '@aws-sdk/client-s3'
import path from 'path'
import url from 'url'
import { jest } from '@jest/globals'
import { getTestStageName, runSfCore } from '../../../utils/runSfCore.js'
import { setGlobalRendererSettings } from '@serverless/util'
import { GetFunctionCommand, LambdaClient } from '@aws-sdk/client-lambda'
import readConfig from '@serverless/framework/lib/configuration/read.js'
import _ from 'lodash'

const __dirname = url.fileURLToPath(new URL('.', import.meta.url))

describe('Default State', () => {
  const lambdaClient = new LambdaClient({ region: 'us-east-1' })
  const configFileDirPath = path.join(__dirname, 'fixture')
  const configFilePath = path.join(configFileDirPath, 'serverless-compose.yml')
  const originalEnv = process.env
  const stage = getTestStageName()
  const regExpSafeStage = _.escapeRegExp(stage)

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

  test('Try to deploy a single service - state bucket should be created', async () => {
    await expect(
      runSfCore({
        coreParams: {
          options: { stage, service: 'service-a', c: configFilePath },
          command: ['deploy'],
        },
        jest,
        expectError: false,
      }),
    ).resolves.not.toThrow()

    const { bucketName, bucketRegion } =
      await getBucketDetailsFromSSM(ssmClient)

    // Check if the bucket exists and is versioned
    await validateBucket(s3Client, bucketName)

    const objectList = await listBucketObjects(s3Client, bucketName)

    // Validate the content of objects
    await validateComposeAObject(
      s3Client,
      bucketName,
      objectList,
      regExpSafeStage,
    )
  })

  test('Run `deploy` command - outputs should be saved in state bucket', async () => {
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

    const { bucketName } = await getBucketDetailsFromSSM(ssmClient)

    const objectList = await listBucketObjects(s3Client, bucketName)

    // Validate both objects
    await validateComposeAObject(
      s3Client,
      bucketName,
      objectList,
      regExpSafeStage,
    )
    await validateComposeBObject(
      s3Client,
      bucketName,
      objectList,
      regExpSafeStage,
    )
  })

  test('Validate', async () => {
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

  test('Run `info` o service-b', async () => {
    await expect(
      runSfCore({
        coreParams: {
          options: { stage, service: 'service-b', c: configFilePath },
          command: ['info'],
        },
        jest,
        expectError: false,
      }),
    ).resolves.not.toThrow()
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

    const { bucketName } = await getBucketDetailsFromSSM(ssmClient)

    const objectList = await listBucketObjects(s3Client, bucketName)

    // After removal, validate that both objects (Compose A and Compose B) are empty
    await validateEmptyObject(
      s3Client,
      bucketName,
      objectList,
      stage,
      'compose-a',
    )
    await validateEmptyObject(
      s3Client,
      bucketName,
      objectList,
      stage,
      'compose-b',
    )
  })
})

const getBucketDetailsFromSSM = async (ssmClient) => {
  const parameterResult = await ssmClient.send(
    new GetParameterCommand({
      Name: '/serverless-framework/state/s3-bucket',
    }),
  )
  if (!parameterResult.Parameter || !parameterResult.Parameter.Value) {
    throw new Error('SSM parameter not found or empty.')
  }

  const parameterValue = JSON.parse(parameterResult.Parameter.Value)
  const bucketName = parameterValue.bucketName
  const bucketRegion = parameterValue.bucketRegion

  if (!bucketName || !bucketRegion) {
    throw new Error('Bucket name or region not found in SSM parameter.')
  }

  return { bucketName, bucketRegion }
}

const validateBucket = async (s3Client, bucketName) => {
  // Check if the bucket exists
  await s3Client.send(new HeadBucketCommand({ Bucket: bucketName }))

  // Check if the bucket is versioned
  const versioningStatus = await s3Client.send(
    new GetBucketVersioningCommand({ Bucket: bucketName }),
  )
  expect([
    BucketVersioningStatus.Enabled,
    BucketVersioningStatus.Suspended,
  ]).toContain(versioningStatus.Status)
}

const listBucketObjects = async (s3Client, bucketName) => {
  const listObjectsCommand = new ListObjectsV2Command({
    Bucket: bucketName,
  })
  const objectList = await s3Client.send(listObjectsCommand)
  return objectList.Contents.map((item) => item.Key)
}

const validateComposeAObject = async (s3Client, bucketName, keys, stage) => {
  const composeAKeyPattern = new RegExp(
    `services/traditional/arn:aws:cloudformation:us-east-1:\\d{12}:stack_default-state-compose-a-${stage}_[\\w\\d-]+/state/state.json`,
  )

  const composeAKey = keys.find((key) => composeAKeyPattern.test(key))
  if (!composeAKey) {
    throw new Error(
      `Compose A Key not found! Keys found: ${JSON.stringify(keys)}`,
    )
  }

  const objectA = await s3Client.send(
    new GetObjectCommand({
      Bucket: bucketName,
      Key: composeAKey,
    }),
  )
  const objectContentA = await streamToString(objectA.Body)

  const expectedContentAPattern = {
    outputs: {
      apiUrl: expect.stringMatching(
        new RegExp(
          `^https://sqs\\.us-east-1\\.amazonaws\\.com/\\d{12}/default-state-compose-a-${stage}-MyQueue-[\\w\\d]{12}$`,
        ),
      ),
      HelloLambdaFunctionQualifiedArn: expect.stringMatching(
        new RegExp(
          `^arn:aws:lambda:us-east-1:\\d{12}:function:default-state-compose-a-${stage}-hello:\\d+$`,
        ),
      ),
      ServerlessDeploymentBucketName: expect.stringMatching(
        new RegExp(
          `^serverless-framework-deployments-us-east-1-[\\w\\d-]{13}$`,
        ),
      ),
    },
  }

  expect(JSON.parse(objectContentA)).toMatchObject(expectedContentAPattern)
}

const validateComposeBObject = async (s3Client, bucketName, keys, stage) => {
  const composeBKeyPattern = new RegExp(
    `services/traditional/arn:aws:cloudformation:us-east-1:\\d{12}:stack_default-state-compose-b-${stage}_[\\w\\d-]+/state/state.json`,
  )

  const composeBKey = keys.find((key) => composeBKeyPattern.test(key))
  if (!composeBKey) {
    throw new Error(
      `Compose B Key not found! Keys found: ${JSON.stringify(keys)}`,
    )
  }

  const objectB = await s3Client.send(
    new GetObjectCommand({
      Bucket: bucketName,
      Key: composeBKey,
    }),
  )
  const objectContentB = await streamToString(objectB.Body)

  const expectedContentBPattern = {
    outputs: {
      HelloLambdaFunctionQualifiedArn: expect.stringMatching(
        new RegExp(
          `^arn:aws:lambda:us-east-1:\\d{12}:function:default-state-compose-b-${stage}-hello:\\d+$`,
        ),
      ),
      ServerlessDeploymentBucketName: expect.stringMatching(
        new RegExp(
          `^serverless-framework-deployments-us-east-1-[\\w\\d-]{13}$`,
        ),
      ),
    },
  }

  expect(JSON.parse(objectContentB)).toMatchObject(expectedContentBPattern)
}

const validateEmptyObject = async (
  s3Client,
  bucketName,
  keys,
  stage,
  serviceName,
) => {
  const keyPattern = new RegExp(
    `services/traditional/arn:aws:cloudformation:us-east-1:\\d{12}:stack_default-state-${serviceName}-${stage}_[\\w\\d-]+/state/state.json`,
  )

  const composeKey = keys.find((key) => keyPattern.test(key))
  if (!composeKey) {
    throw new Error(
      `${serviceName} Key not found! Keys found: ${JSON.stringify(keys)}`,
    )
  }

  const object = await s3Client.send(
    new GetObjectCommand({
      Bucket: bucketName,
      Key: composeKey,
    }),
  )
  const objectContent = await streamToString(object.Body)

  // Check if the content is an empty object
  expect(objectContent).toBe('{}')
}

const streamToString = (stream) => {
  return new Promise((resolve, reject) => {
    const chunks = []
    stream.on('data', (chunk) => chunks.push(chunk))
    stream.on('error', reject)
    stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
  })
}

const cleanup = async () => {
  const ssmClient = new SSMClient({ region: 'us-east-1' })
  const s3Client = new S3Client({ region: 'us-east-1' })
  try {
    // 1. Read /serverless-framework/state/s3-bucket SSM parameter
    const getParameterCommand = new GetParameterCommand({
      Name: '/serverless-framework/state/s3-bucket',
    })
    const parameterResult = await ssmClient.send(getParameterCommand)

    if (!parameterResult.Parameter || !parameterResult.Parameter.Value) {
      console.log('SSM parameter not found or empty.')
      return
    }

    // 2. Parse the JSON value to extract bucketName
    const parameterValue = JSON.parse(parameterResult.Parameter.Value)
    const bucketName = parameterValue.bucketName

    if (!bucketName) {
      console.log('Bucket name not found in the SSM parameter.')
      return
    }

    // 3. Clear the bucket's contents, including versions (for versioned buckets)
    await deleteBucketVersions(s3Client, bucketName)

    // Delete the bucket
    const deleteBucketCommand = new DeleteBucketCommand({ Bucket: bucketName })
    await s3Client.send(deleteBucketCommand)

    // 4. Remove the /serverless-framework/state/s3-bucket SSM parameter
    const deleteParameterCommand = new DeleteParameterCommand({
      Name: '/serverless-framework/state/s3-bucket',
    })
    await ssmClient.send(deleteParameterCommand)
  } catch (error) {
    console.error('Cleanup error:', error)
  }
}

async function deleteBucketVersions(s3Client, bucketName) {
  try {
    // List and delete all object versions and delete markers
    let isTruncated = true
    let keyMarker = undefined
    let versionIdMarker = undefined

    while (isTruncated) {
      const listVersionsCommand = new ListObjectVersionsCommand({
        Bucket: bucketName,
        KeyMarker: keyMarker,
        VersionIdMarker: versionIdMarker,
      })

      const versionList = await s3Client.send(listVersionsCommand)

      const objectsToDelete = []

      if (versionList.Versions && versionList.Versions.length > 0) {
        objectsToDelete.push(
          ...versionList.Versions.map((version) => ({
            Key: version.Key,
            VersionId: version.VersionId,
          })),
        )
      }

      if (versionList.DeleteMarkers && versionList.DeleteMarkers.length > 0) {
        objectsToDelete.push(
          ...versionList.DeleteMarkers.map((marker) => ({
            Key: marker.Key,
            VersionId: marker.VersionId,
          })),
        )
      }

      if (objectsToDelete.length > 0) {
        const deleteObjectsCommand = new DeleteObjectsCommand({
          Bucket: bucketName,
          Delete: { Objects: objectsToDelete },
        })

        await s3Client.send(deleteObjectsCommand)
        console.log(
          `Deleted ${objectsToDelete.length} object versions and delete markers from bucket "${bucketName}".`,
        )
      }

      isTruncated = versionList.IsTruncated
      keyMarker = versionList.NextKeyMarker
      versionIdMarker = versionList.NextVersionIdMarker
    }
  } catch (error) {
    console.error('Error:', error)
  }
}
