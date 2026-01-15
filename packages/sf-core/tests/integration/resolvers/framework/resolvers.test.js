import path from 'path'
import url from 'url'
import { setGlobalRendererSettings } from '@serverless/util'
import { LambdaClient, GetFunctionCommand } from '@aws-sdk/client-lambda'
import {
  CloudFormationClient,
  DescribeStackResourceCommand,
} from '@aws-sdk/client-cloudformation'
import { IoTClient, GetPolicyCommand } from '@aws-sdk/client-iot'
import { jest } from '@jest/globals'
import { getTestStageName, runSfCore } from '../../../utils/runSfCore.js'
import {
  GetQueueAttributesCommand,
  GetQueueUrlCommand,
  SQSClient,
} from '@aws-sdk/client-sqs'

const __dirname = url.fileURLToPath(new URL('.', import.meta.url))

describe('Serverless Framework Service - Resolvers', () => {
  const configFileDirPath = path.join(__dirname, 'fixture')
  const region = 'us-east-1'
  const cfClient = new CloudFormationClient({ region })
  const lambdaClient = new LambdaClient({ region })
  const iotClient = new IoTClient({ region })
  const sqsClient = new SQSClient({ region })
  const originalEnv = process.env
  const stage = getTestStageName()
  let configFilePath

  beforeAll(async () => {
    setGlobalRendererSettings({
      isInteractive: false,
      // logLevel: 'error'
    })
    configFilePath = path.join(configFileDirPath, 'serverless.yml')
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
        options: { stage, region, c: configFilePath },
        command: ['deploy'],
      },
      jest,
    })
  })

  test('Validate', async () => {
    let getFunctionResponse = await lambdaClient.send(
      new GetFunctionCommand({
        FunctionName: `resolvers-us-east-1-${stage}-function1`,
      }),
    )

    expect(getFunctionResponse.Configuration).toBeDefined()
    expect(getFunctionResponse.Configuration.Description)
      .toEqual(`param:local-param: resolvers-us-east-1null
s3:resolvers-integration-test/test.txt: file content
ssm:test-param: ssm-value
aws:accountId: 762003938904
aws:region: us-east-1
pluginCountBob: ${`Bob${stage}`.length}
pluginCountFoobarStage: ${`foobar${stage}`.length}
`)

    getFunctionResponse = await lambdaClient.send(
      new GetFunctionCommand({
        FunctionName: `resolvers-us-east-1-${stage}-function2`,
      }),
    )

    expect(getFunctionResponse.Configuration).toBeDefined()
    expect(getFunctionResponse.Configuration.Description).toEqual(
      `fileContentToCount: foobar${stage}
fileContent: sfc-nodejs-resolvers-integration-test
cfResolverUsingFileContent: sfc-nodejs-resolvers-inte-serverlessdeploymentbuck-6vskiu5gzt1u
notExisting: defaultValue
`,
    )

    const describeResourceResponse = await cfClient.send(
      new DescribeStackResourceCommand({
        StackName: `resolvers-${region}-${stage}`,
        LogicalResourceId: 'IoTPolicy',
      }),
    )

    const getPolicyResponse = await iotClient.send(
      new GetPolicyCommand({
        policyName:
          describeResourceResponse.StackResourceDetail.PhysicalResourceId,
      }),
    )

    const expectedPolicy = {
      Version: '2012-10-17',
      Statement: [
        {
          Condition: {
            StringEquals: {
              'iot:ClientId': '${iot:ClientId}',
            },
          },
          Action: ['iot:Connect'],
          Resource: '*',
          Effect: 'Allow',
        },
        {
          Action: ['iot:Publish'],
          Resource: [
            'arn:aws:iot:us-east-1:762003938904:topic/${iot:ClientId}/data',
          ],
          Effect: 'Allow',
        },
      ],
    }

    expect(getPolicyResponse.policyDocument).toEqual(
      JSON.stringify(expectedPolicy),
    )

    async function validateQueue(queueName) {
      const getQueueUrlResponse = await sqsClient.send(
        new GetQueueUrlCommand({
          QueueName: queueName,
        }),
      )

      expect(getQueueUrlResponse.QueueUrl).toBeDefined()

      const getQueueAttributesResponse = await sqsClient.send(
        new GetQueueAttributesCommand({
          QueueUrl: getQueueUrlResponse.QueueUrl,
          AttributeNames: ['All'],
        }),
      )

      expect(getQueueAttributesResponse.Attributes.QueueArn).toContain(
        queueName,
      )
    }

    // Validate the SQS queues
    await validateQueue(`queueBob${stage}`)
    await validateQueue(`queueAlice${stage}`)
    await validateQueue(`queueJohn${stage}`)
    await validateQueue(`queueDoe${stage}`)
  })

  test('Remove', async () => {
    await runSfCore({
      coreParams: {
        options: { stage, region, c: configFilePath },
        command: ['remove'],
      },
      jest,
    })
  })
})
