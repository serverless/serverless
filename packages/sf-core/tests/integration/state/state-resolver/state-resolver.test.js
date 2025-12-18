import {
  BucketVersioningStatus,
  GetBucketVersioningCommand,
  GetObjectCommand,
  HeadBucketCommand,
  ListObjectsV2Command,
  S3Client,
} from '@aws-sdk/client-s3'
import path from 'path'
import url from 'url'
import { jest } from '@jest/globals'
import { getTestStageName, runSfCore } from '../../../utils/runSfCore.js'
import { setGlobalRendererSettings } from '@serverless/util'
import _ from 'lodash'

const __dirname = url.fileURLToPath(new URL('.', import.meta.url))

describe('State Resolver', () => {
  const configFileDirPath = path.join(__dirname, 'fixture')
  const configFilePath = path.join(configFileDirPath, 'serverless-compose.yml')
  const originalEnv = process.env
  const stage = getTestStageName()
  const regExpSafeStage = _.escapeRegExp(stage)

  const bucketName = 'serverless-compose-state-bucket-integration-test'
  const s3Client = new S3Client({ region: 'us-east-1' })

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

  test('Try to deploy service with dependency - state bucket should exist despite the error', async () => {
    await expect(
      runSfCore({
        coreParams: {
          options: { stage, service: 'service-b', c: configFilePath },
          command: ['deploy'],
        },
        jest,
        expectError: true,
      }),
    ).rejects.toThrow()

    await validateBucket(s3Client, bucketName)
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

    const keys = await listBucketObjects(s3Client, bucketName)

    // Validate the content of objects
    await validateComposeAObject(s3Client, bucketName, keys, regExpSafeStage)
    await validateComposeBObject(s3Client, bucketName, keys, regExpSafeStage)
  })

  test('Run `info` on service-b', async () => {
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

    const objectList = await listBucketObjects(s3Client, bucketName)

    // Validate the content of objects
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
    `services/traditional/arn:aws:cloudformation:us-east-1:\\d{12}:stack_state-resolver-compose-a-${stage}_[\\w\\d-]+/state/state.json`,
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
          `^https://sqs\\.us-east-1\\.amazonaws\\.com/\\d{12}/state-resolver-compose-a-${stage}-MyQueue-[\\w\\d]{12}$`,
        ),
      ),
      HelloLambdaFunctionQualifiedArn: expect.stringMatching(
        new RegExp(
          `^arn:aws:lambda:us-east-1:\\d{12}:function:state-resolver-compose-a-${stage}-hello:\\d+$`,
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
    `services/traditional/arn:aws:cloudformation:us-east-1:\\d{12}:stack_state-resolver-compose-b-${stage}_[\\w\\d-]+/state/state.json`,
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
          `^arn:aws:lambda:us-east-1:\\d{12}:function:state-resolver-compose-b-${stage}-hello:\\d+$`,
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
    `services/traditional/arn:aws:cloudformation:us-east-1:\\d{12}:stack_state-resolver-${serviceName}-${stage}_[\\w\\d-]+/state/state.json`,
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
