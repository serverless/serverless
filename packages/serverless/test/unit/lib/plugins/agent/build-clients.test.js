import { describe, test, expect, jest, beforeEach } from '@jest/globals'

// build-clients.js dispatches SDK commands via `EngineClient.client.send(new
// SdkModule[commandName + 'Command'](input))`. We mock both the engine client
// classes (packages/engine/src/lib/aws/*.js) and the raw @aws-sdk/client-*
// modules so we can assert: which engine class got constructed with which
// config, which command constructor got invoked with which input, and that
// `.client.send` is the dispatch path (see test/unit/lib/plugins/aws/provider.test.js
// for the jest.unstable_mockModule idiom used here).

const mockSend = jest.fn()

// One shared fake "engine client" constructor per service so we can assert
// construction args (region/credentials) and reuse-vs-recreate behavior.
// `clientProp` mirrors the real engine class's property name for the raw SDK
// client -- most expose `.client`, but AwsRestApiGatewayClient /
// AwsHttpApiGatewayClient expose `.apiGatewayClient` / `.apiGatewayV2Client`
// instead (confirmed by reading packages/engine/src/lib/aws/*.js).
function makeFakeEngineClientClass(name, clientProp = 'client') {
  const ctor = jest.fn(function FakeEngineClient(awsConfig) {
    this.awsConfig = awsConfig
    this[clientProp] = { send: mockSend, __name: name }
  })
  return ctor
}

const FakeAwsLambdaClient = makeFakeEngineClientClass('lambda')
const FakeAwsIamClient = makeFakeEngineClientClass('iam')
const FakeAwsRestApiGatewayClient = makeFakeEngineClientClass(
  'apigateway',
  'apiGatewayClient',
)
const FakeAwsHttpApiGatewayClient = makeFakeEngineClientClass(
  'apigatewayv2',
  'apiGatewayV2Client',
)
const FakeAwsAlbClient = makeFakeEngineClientClass('elbv2')
const FakeAwsEventBridgeClient = makeFakeEngineClientClass('eventbridge')
const FakeAwsS3Client = makeFakeEngineClientClass('s3')
const FakeAwsDynamoDBClient = makeFakeEngineClientClass('dynamodb')
const FakeAwsSqsClient = makeFakeEngineClientClass('sqs')
const FakeAwsSnsClient = makeFakeEngineClientClass('sns')
const FakeAwsSchedulerClient = makeFakeEngineClientClass('scheduler')
const FakeAwsCognitoClient = makeFakeEngineClientClass('cognito-idp')
const FakeAwsIotClient = makeFakeEngineClientClass('iot')
const FakeAwsKinesisClient = makeFakeEngineClientClass('kinesis')
const FakeAwsCloudFrontClient = makeFakeEngineClientClass('cloudfront')
const FakeAwsLambdaMicrovmsClient = makeFakeEngineClientClass('lambda-microvms')

// AwsCloudWatchClient is unique: it wraps TWO proxy-wrapped SDK clients
// (`this.logsClient` for @aws-sdk/client-cloudwatch-logs, `this.metricsClient`
// for @aws-sdk/client-cloudwatch) that the `logs` and `cloudwatch` service
// tokens reuse via different `clientProp`s. Each sub-client gets its own send
// spy so we can assert dispatch lands on the RIGHT sub-client per token.
const mockLogsSend = jest.fn()
const mockMetricsSend = jest.fn()
const FakeAwsCloudWatchClient = jest.fn(
  function FakeAwsCloudWatchClient(awsConfig) {
    this.awsConfig = awsConfig
    this.logsClient = { send: mockLogsSend, __name: 'logs' }
    this.metricsClient = { send: mockMetricsSend, __name: 'cloudwatch' }
  },
)

jest.unstable_mockModule(
  '../../../../../../engine/src/lib/aws/lambda.js',
  () => ({
    AwsLambdaClient: FakeAwsLambdaClient,
  }),
)
jest.unstable_mockModule('../../../../../../engine/src/lib/aws/iam.js', () => ({
  AwsIamClient: FakeAwsIamClient,
}))
jest.unstable_mockModule(
  '../../../../../../engine/src/lib/aws/restApiGateway.js',
  () => ({
    AwsRestApiGatewayClient: FakeAwsRestApiGatewayClient,
  }),
)
jest.unstable_mockModule(
  '../../../../../../engine/src/lib/aws/httpApiGateway.js',
  () => ({
    AwsHttpApiGatewayClient: FakeAwsHttpApiGatewayClient,
  }),
)
jest.unstable_mockModule('../../../../../../engine/src/lib/aws/alb.js', () => ({
  AwsAlbClient: FakeAwsAlbClient,
}))
jest.unstable_mockModule(
  '../../../../../../engine/src/lib/aws/eventbridge.js',
  () => ({
    AwsEventBridgeClient: FakeAwsEventBridgeClient,
  }),
)
jest.unstable_mockModule('../../../../../../engine/src/lib/aws/s3.js', () => ({
  AwsS3Client: FakeAwsS3Client,
}))
jest.unstable_mockModule(
  '../../../../../../engine/src/lib/aws/dynamodb.js',
  () => ({
    AwsDynamoDBClient: FakeAwsDynamoDBClient,
  }),
)
jest.unstable_mockModule('../../../../../../engine/src/lib/aws/sqs.js', () => ({
  AwsSqsClient: FakeAwsSqsClient,
}))
jest.unstable_mockModule('../../../../../../engine/src/lib/aws/sns.js', () => ({
  AwsSnsClient: FakeAwsSnsClient,
}))
jest.unstable_mockModule(
  '../../../../../../engine/src/lib/aws/scheduler.js',
  () => ({
    AwsSchedulerClient: FakeAwsSchedulerClient,
  }),
)
jest.unstable_mockModule(
  '../../../../../../engine/src/lib/aws/cognito.js',
  () => ({
    AwsCognitoClient: FakeAwsCognitoClient,
  }),
)
jest.unstable_mockModule('../../../../../../engine/src/lib/aws/iot.js', () => ({
  AwsIotClient: FakeAwsIotClient,
}))
jest.unstable_mockModule(
  '../../../../../../engine/src/lib/aws/kinesis.js',
  () => ({
    AwsKinesisClient: FakeAwsKinesisClient,
  }),
)
jest.unstable_mockModule(
  '../../../../../../engine/src/lib/aws/cloudwatch.js',
  () => ({
    AwsCloudWatchClient: FakeAwsCloudWatchClient,
  }),
)
jest.unstable_mockModule(
  '../../../../../../engine/src/lib/aws/cloudfront.js',
  () => ({
    AwsCloudFrontClient: FakeAwsCloudFrontClient,
  }),
)
jest.unstable_mockModule(
  '../../../../../../engine/src/lib/aws/lambda-microvms.js',
  () => ({
    AwsLambdaMicrovmsClient: FakeAwsLambdaMicrovmsClient,
  }),
)

// Fake SDK command modules -- each exported "Command" is just a marker class
// so we can assert `new SdkModule.FooCommand(input)` was constructed with the
// right input and dispatched via `.client.send`.
function makeCommandClass(name) {
  const Ctor = function (input) {
    this.__command = name
    this.input = input
  }
  Ctor.__isCommand = name
  return Ctor
}

jest.unstable_mockModule('@aws-sdk/client-lambda', () => ({
  GetFunctionCommand: makeCommandClass('GetFunctionCommand'),
  ListVersionsByFunctionCommand: makeCommandClass(
    'ListVersionsByFunctionCommand',
  ),
}))
jest.unstable_mockModule('@aws-sdk/client-iam', () => ({
  GetRoleCommand: makeCommandClass('GetRoleCommand'),
  ListAttachedRolePoliciesCommand: makeCommandClass(
    'ListAttachedRolePoliciesCommand',
  ),
}))
jest.unstable_mockModule('@aws-sdk/client-api-gateway', () => ({
  GetResourcesCommand: makeCommandClass('GetResourcesCommand'),
}))
jest.unstable_mockModule('@aws-sdk/client-apigatewayv2', () => ({
  GetApiCommand: makeCommandClass('GetApiCommand'),
}))
jest.unstable_mockModule('@aws-sdk/client-elastic-load-balancing-v2', () => ({
  DescribeTargetGroupsCommand: makeCommandClass('DescribeTargetGroupsCommand'),
}))
jest.unstable_mockModule('@aws-sdk/client-eventbridge', () => ({
  DescribeRuleCommand: makeCommandClass('DescribeRuleCommand'),
}))
jest.unstable_mockModule('@aws-sdk/client-s3', () => ({
  GetBucketLocationCommand: makeCommandClass('GetBucketLocationCommand'),
  GetBucketPolicyCommand: makeCommandClass('GetBucketPolicyCommand'),
  GetBucketAclCommand: makeCommandClass('GetBucketAclCommand'),
}))
jest.unstable_mockModule('@aws-sdk/client-dynamodb', () => ({
  DescribeTableCommand: makeCommandClass('DescribeTableCommand'),
}))
jest.unstable_mockModule('@aws-sdk/client-sqs', () => ({
  GetQueueAttributesCommand: makeCommandClass('GetQueueAttributesCommand'),
}))
jest.unstable_mockModule('@aws-sdk/client-sns', () => ({
  GetTopicAttributesCommand: makeCommandClass('GetTopicAttributesCommand'),
}))
jest.unstable_mockModule('@aws-sdk/client-scheduler', () => ({
  GetScheduleCommand: makeCommandClass('GetScheduleCommand'),
}))
jest.unstable_mockModule('@aws-sdk/client-cognito-identity-provider', () => ({
  DescribeUserPoolCommand: makeCommandClass('DescribeUserPoolCommand'),
}))
jest.unstable_mockModule('@aws-sdk/client-iot', () => ({
  GetTopicRuleCommand: makeCommandClass('GetTopicRuleCommand'),
}))
jest.unstable_mockModule('@aws-sdk/client-kinesis', () => ({
  DescribeStreamConsumerCommand: makeCommandClass(
    'DescribeStreamConsumerCommand',
  ),
}))
jest.unstable_mockModule('@aws-sdk/client-cloudwatch-logs', () => ({
  DescribeLogGroupsCommand: makeCommandClass('DescribeLogGroupsCommand'),
}))
jest.unstable_mockModule('@aws-sdk/client-cloudwatch', () => ({
  DescribeAlarmsCommand: makeCommandClass('DescribeAlarmsCommand'),
  GetDashboardCommand: makeCommandClass('GetDashboardCommand'),
}))
jest.unstable_mockModule('@aws-sdk/client-cloudfront', () => ({
  GetDistributionCommand: makeCommandClass('GetDistributionCommand'),
  GetCachePolicyCommand: makeCommandClass('GetCachePolicyCommand'),
}))
jest.unstable_mockModule('@aws-sdk/client-lambda-microvms', () => ({
  GetMicrovmImageCommand: makeCommandClass('GetMicrovmImageCommand'),
}))

const { createInvoker } =
  await import('../../../../../lib/plugins/agent/lib/build-clients.js')

describe('build-clients', () => {
  const region = 'us-east-1'
  const credentials = {
    accessKeyId: 'AKIA-TEST',
    secretAccessKey: 'secret',
    sessionToken: 'token',
  }

  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('awsService -> engine client mapping', () => {
    test.each([
      ['lambda', FakeAwsLambdaClient, 'GetFunction', 'GetFunctionCommand'],
      ['iam', FakeAwsIamClient, 'GetRole', 'GetRoleCommand'],
      [
        'apigateway',
        FakeAwsRestApiGatewayClient,
        'GetResources',
        'GetResourcesCommand',
      ],
      ['apigatewayv2', FakeAwsHttpApiGatewayClient, 'GetApi', 'GetApiCommand'],
      [
        'elbv2',
        FakeAwsAlbClient,
        'DescribeTargetGroups',
        'DescribeTargetGroupsCommand',
      ],
      [
        'eventbridge',
        FakeAwsEventBridgeClient,
        'DescribeRule',
        'DescribeRuleCommand',
      ],
      [
        'dynamodb',
        FakeAwsDynamoDBClient,
        'DescribeTable',
        'DescribeTableCommand',
      ],
      [
        'sqs',
        FakeAwsSqsClient,
        'GetQueueAttributes',
        'GetQueueAttributesCommand',
      ],
      [
        'sns',
        FakeAwsSnsClient,
        'GetTopicAttributes',
        'GetTopicAttributesCommand',
      ],
      [
        'scheduler',
        FakeAwsSchedulerClient,
        'GetSchedule',
        'GetScheduleCommand',
      ],
      [
        'cognito-idp',
        FakeAwsCognitoClient,
        'DescribeUserPool',
        'DescribeUserPoolCommand',
      ],
      ['iot', FakeAwsIotClient, 'GetTopicRule', 'GetTopicRuleCommand'],
      [
        'kinesis',
        FakeAwsKinesisClient,
        'DescribeStreamConsumer',
        'DescribeStreamConsumerCommand',
      ],
      [
        'cloudfront',
        FakeAwsCloudFrontClient,
        'GetDistribution',
        'GetDistributionCommand',
      ],
      [
        'lambda-microvms',
        FakeAwsLambdaMicrovmsClient,
        'GetMicrovmImage',
        'GetMicrovmImageCommand',
      ],
    ])(
      'routes %s through its engine client and dispatches %s',
      async (awsService, EngineClass, commandName, expectedCommand) => {
        mockSend.mockResolvedValueOnce({ ok: true, $metadata: {} })
        const { invoke } = createInvoker({ region, credentials })

        const result = await invoke(awsService, commandName, { Foo: 'bar' })

        expect(EngineClass).toHaveBeenCalledTimes(1)
        expect(mockSend).toHaveBeenCalledTimes(1)
        const sentCommand = mockSend.mock.calls[0][0]
        expect(sentCommand.__command).toBe(expectedCommand)
        expect(sentCommand.input).toEqual({ Foo: 'bar' })
        expect(result).toEqual({ ok: true, $metadata: {} })
      },
    )
  })

  describe('CloudWatch reuse (logs + cloudwatch share AwsCloudWatchClient)', () => {
    test('logs dispatches DescribeLogGroups through AwsCloudWatchClient.logsClient (not metricsClient)', async () => {
      mockLogsSend.mockResolvedValueOnce({ logGroups: [], $metadata: {} })
      const { invoke } = createInvoker({ region, credentials })

      const result = await invoke('logs', 'DescribeLogGroups', {
        logGroupNamePrefix: '/aws/lambda/x',
      })

      expect(FakeAwsCloudWatchClient).toHaveBeenCalledTimes(1)
      expect(mockLogsSend).toHaveBeenCalledTimes(1)
      expect(mockMetricsSend).not.toHaveBeenCalled()
      expect(mockLogsSend.mock.calls[0][0].__command).toBe(
        'DescribeLogGroupsCommand',
      )
      expect(result).toEqual({ logGroups: [], $metadata: {} })
    })

    test('cloudwatch dispatches DescribeAlarms through AwsCloudWatchClient.metricsClient (not logsClient)', async () => {
      mockMetricsSend.mockResolvedValueOnce({ MetricAlarms: [], $metadata: {} })
      const { invoke } = createInvoker({ region, credentials })

      await invoke('cloudwatch', 'DescribeAlarms', {})

      expect(mockMetricsSend).toHaveBeenCalledTimes(1)
      expect(mockLogsSend).not.toHaveBeenCalled()
      expect(mockMetricsSend.mock.calls[0][0].__command).toBe(
        'DescribeAlarmsCommand',
      )
    })

    test('cloudwatch can dispatch GetDashboard even though the engine class has no wrapper method (generic ctor from @aws-sdk/client-cloudwatch)', async () => {
      mockMetricsSend.mockResolvedValueOnce({
        DashboardBody: '{}',
        $metadata: {},
      })
      const { invoke } = createInvoker({ region, credentials })

      await invoke('cloudwatch', 'GetDashboard', { DashboardName: 'd' })

      expect(mockMetricsSend).toHaveBeenCalledTimes(1)
      expect(mockMetricsSend.mock.calls[0][0].__command).toBe(
        'GetDashboardCommand',
      )
    })
  })

  describe('CloudFront is a GLOBAL service (always pinned to us-east-1)', () => {
    test('invoke("cloudfront", ...) constructs the engine client with region us-east-1, even when the factory base region is different', async () => {
      mockSend.mockResolvedValueOnce({ Distribution: {}, $metadata: {} })
      const { invoke } = createInvoker({
        region: 'eu-west-1',
        credentials,
      })

      await invoke('cloudfront', 'GetDistribution', { Id: 'E123' })

      expect(FakeAwsCloudFrontClient).toHaveBeenCalledTimes(1)
      const [awsConfig] = FakeAwsCloudFrontClient.mock.calls[0]
      expect(awsConfig.region).toBe('us-east-1')
    })

    test('GetCachePolicy also dispatches through the us-east-1-pinned client', async () => {
      mockSend.mockResolvedValueOnce({ CachePolicy: {}, $metadata: {} })
      const { invoke } = createInvoker({
        region: 'ap-southeast-2',
        credentials,
      })

      await invoke('cloudfront', 'GetCachePolicy', { Id: 'policy-1' })

      expect(FakeAwsCloudFrontClient).toHaveBeenCalledTimes(1)
      expect(FakeAwsCloudFrontClient.mock.calls[0][0].region).toBe('us-east-1')
      expect(mockSend.mock.calls[0][0].__command).toBe('GetCachePolicyCommand')
    })

    test('getClient("cloudfront") escape hatch also defaults to us-east-1 when no clientRegion is passed', () => {
      const { getClient } = createInvoker({
        region: 'ap-southeast-2',
        credentials,
      })

      const client = getClient('cloudfront')

      expect(client.awsConfig.region).toBe('us-east-1')
    })

    test('an explicit clientRegion argument still overrides the us-east-1 default (S3-hop-style escape hatch)', () => {
      const { getClient } = createInvoker({ region: 'eu-west-1', credentials })

      const client = getClient('cloudfront', 'ap-northeast-1')

      expect(client.awsConfig.region).toBe('ap-northeast-1')
    })

    test('reuses one us-east-1 client across multiple cloudfront calls regardless of base region', async () => {
      mockSend.mockResolvedValue({ $metadata: {} })
      const { invoke } = createInvoker({ region: 'eu-west-1', credentials })

      await invoke('cloudfront', 'GetDistribution', { Id: 'E1' })
      await invoke('cloudfront', 'GetCachePolicy', { Id: 'P1' })

      expect(FakeAwsCloudFrontClient).toHaveBeenCalledTimes(1)
      expect(mockSend).toHaveBeenCalledTimes(2)
    })
  })

  describe('lambda-microvms dispatch (MicrovmImage describe)', () => {
    test('invoke routes GetMicrovmImage through AwsLambdaMicrovmsClient', async () => {
      mockSend.mockResolvedValueOnce({ imageArn: 'arn:...', $metadata: {} })
      const { invoke } = createInvoker({ region, credentials })

      const result = await invoke('lambda-microvms', 'GetMicrovmImage', {
        imageIdentifier: 'img-abc123',
      })

      expect(FakeAwsLambdaMicrovmsClient).toHaveBeenCalledTimes(1)
      const sentCommand = mockSend.mock.calls[0][0]
      expect(sentCommand.__command).toBe('GetMicrovmImageCommand')
      expect(sentCommand.input).toEqual({ imageIdentifier: 'img-abc123' })
      expect(result).toEqual({ imageArn: 'arn:...', $metadata: {} })
    })
  })

  describe('credentials nesting', () => {
    test('constructs the engine client with { region, credentials } and drops accountId/callerArn', async () => {
      mockSend.mockResolvedValueOnce({})
      const { invoke } = createInvoker({
        region,
        credentials: {
          ...credentials,
          accountId: '123456789012',
          callerArn: 'arn:aws:iam::123456789012:user/me',
        },
      })

      await invoke('lambda', 'GetFunction', { FunctionName: 'f' })

      expect(FakeAwsLambdaClient).toHaveBeenCalledTimes(1)
      const [awsConfig] = FakeAwsLambdaClient.mock.calls[0]
      expect(awsConfig).toEqual({
        region,
        credentials: {
          accessKeyId: 'AKIA-TEST',
          secretAccessKey: 'secret',
          sessionToken: 'token',
        },
      })
      expect(awsConfig.credentials.accountId).toBeUndefined()
      expect(awsConfig.credentials.callerArn).toBeUndefined()
    })
  })

  describe('client caching', () => {
    test('reuses one client per awsService across multiple invoke calls', async () => {
      mockSend.mockResolvedValue({})
      const { invoke } = createInvoker({ region, credentials })

      await invoke('lambda', 'GetFunction', { FunctionName: 'a' })
      await invoke('lambda', 'GetFunction', { FunctionName: 'b' })
      await invoke('lambda', 'ListVersionsByFunction', { FunctionName: 'a' })

      expect(FakeAwsLambdaClient).toHaveBeenCalledTimes(1)
      expect(mockSend).toHaveBeenCalledTimes(3)
    })

    test('constructs separate clients per distinct awsService', async () => {
      mockSend.mockResolvedValue({})
      const { invoke } = createInvoker({ region, credentials })

      await invoke('lambda', 'GetFunction', { FunctionName: 'a' })
      await invoke('iam', 'GetRole', { RoleName: 'r' })

      expect(FakeAwsLambdaClient).toHaveBeenCalledTimes(1)
      expect(FakeAwsIamClient).toHaveBeenCalledTimes(1)
    })
  })

  describe('getClient escape hatch', () => {
    test('returns a cached instance on repeated calls for the same awsService and region', () => {
      const { getClient } = createInvoker({ region, credentials })

      const first = getClient('lambda', region)
      const second = getClient('lambda', region)

      expect(first).toBe(second)
      expect(FakeAwsLambdaClient).toHaveBeenCalledTimes(1)
    })

    test('defaults clientRegion to the factory-configured base region when omitted', () => {
      const { getClient } = createInvoker({ region, credentials })

      const withDefault = getClient('lambda')
      const withExplicitRegion = getClient('lambda', region)

      expect(withDefault).toBe(withExplicitRegion)
      expect(FakeAwsLambdaClient).toHaveBeenCalledTimes(1)
    })

    test('returns distinct instances for different regions of the same awsService', () => {
      const { getClient } = createInvoker({ region, credentials })

      const baseRegionClient = getClient('s3', region)
      const otherRegionClient = getClient('s3', 'eu-west-1')

      expect(baseRegionClient).not.toBe(otherRegionClient)
      expect(FakeAwsS3Client).toHaveBeenCalledTimes(2)
      const regions = FakeAwsS3Client.mock.calls.map((call) => call[0].region)
      expect(regions).toEqual(expect.arrayContaining([region, 'eu-west-1']))
    })

    test('throws the clear named error for an unknown awsService', () => {
      const { getClient } = createInvoker({ region, credentials })

      expect(() => getClient('not-a-service')).toThrow(/not-a-service/)
    })
  })

  describe('unknown command handling', () => {
    test('throws a clear error naming the awsService and command when the Command ctor is missing', async () => {
      const { invoke } = createInvoker({ region, credentials })

      await expect(invoke('lambda', 'TotallyBogusCommand', {})).rejects.toThrow(
        /lambda/,
      )
      await expect(invoke('lambda', 'TotallyBogusCommand', {})).rejects.toThrow(
        /TotallyBogusCommand/,
      )
    })

    test('throws a clear error for an unregistered awsService token', async () => {
      const { invoke } = createInvoker({ region, credentials })

      await expect(invoke('not-a-service', 'GetFoo', {})).rejects.toThrow(
        /not-a-service/,
      )
    })
  })

  describe('S3 regional resolution', () => {
    test('resolves the bucket region via GetBucketLocation on first use, then routes subsequent calls through a client cached for that region', async () => {
      // First call: GetBucketLocation on the base-region client.
      mockSend.mockResolvedValueOnce({
        LocationConstraint: 'eu-west-1',
        $metadata: {},
      })
      // Second call: GetBucketPolicy, expected on the eu-west-1-scoped client.
      mockSend.mockResolvedValueOnce({ Policy: '{}', $metadata: {} })

      const { invoke } = createInvoker({ region, credentials })

      const locationResult = await invoke('s3', 'GetBucketLocation', {
        Bucket: 'my-bucket',
      })
      expect(locationResult.LocationConstraint).toBe('eu-west-1')

      await invoke('s3', 'GetBucketPolicy', { Bucket: 'my-bucket' })

      // One client for the base region (used for GetBucketLocation) and one
      // for the resolved bucket region (eu-west-1) -- both S3.
      expect(FakeAwsS3Client).toHaveBeenCalledTimes(2)
      const regions = FakeAwsS3Client.mock.calls.map((call) => call[0].region)
      expect(regions).toEqual(
        expect.arrayContaining(['us-east-1', 'eu-west-1']),
      )
    })

    test('reuses the resolved regional client for a bucket on subsequent calls (does not re-resolve region)', async () => {
      mockSend.mockResolvedValueOnce({
        LocationConstraint: 'eu-west-1',
        $metadata: {},
      })
      mockSend.mockResolvedValue({ Policy: '{}', $metadata: {} })

      const { invoke } = createInvoker({ region, credentials })

      await invoke('s3', 'GetBucketLocation', { Bucket: 'my-bucket' })
      await invoke('s3', 'GetBucketPolicy', { Bucket: 'my-bucket' })
      await invoke('s3', 'GetBucketPolicy', { Bucket: 'my-bucket' })

      // Still just 2 constructed S3 clients (base + eu-west-1), despite 3 calls.
      expect(FakeAwsS3Client).toHaveBeenCalledTimes(2)
      expect(mockSend).toHaveBeenCalledTimes(3)
    })

    test("concurrent calls for the same never-before-seen bucket only trigger one GetBucketLocation request (runResource fires a bucket's ~10 S3 calls via Promise.all)", async () => {
      mockSend.mockImplementation(async (command) => {
        if (command.__command === 'GetBucketLocationCommand') {
          return { LocationConstraint: 'eu-west-1', $metadata: {} }
        }
        return { $metadata: {} }
      })

      const { invoke } = createInvoker({ region, credentials })

      // Simulate runResource()'s Promise.all: several S3 calls for the same
      // bucket, including GetBucketLocation itself, all fired in the same tick.
      await Promise.all([
        invoke('s3', 'GetBucketLocation', { Bucket: 'race-bucket' }),
        invoke('s3', 'GetBucketPolicy', { Bucket: 'race-bucket' }),
        invoke('s3', 'GetBucketAcl', { Bucket: 'race-bucket' }),
      ])

      const locationCalls = mockSend.mock.calls.filter(
        ([command]) => command.__command === 'GetBucketLocationCommand',
      )
      expect(locationCalls).toHaveLength(1)
      // One base-region client (GetBucketLocation) + one eu-west-1 client
      // (the two follow-up Get* calls) -- not one client per racing call.
      expect(FakeAwsS3Client).toHaveBeenCalledTimes(2)
    })

    test('a null LocationConstraint (us-east-1 bucket) keeps using the base-region client', async () => {
      mockSend.mockResolvedValueOnce({
        LocationConstraint: null,
        $metadata: {},
      })
      mockSend.mockResolvedValueOnce({ Policy: '{}', $metadata: {} })

      const { invoke } = createInvoker({ region, credentials })

      await invoke('s3', 'GetBucketLocation', { Bucket: 'us-bucket' })
      await invoke('s3', 'GetBucketPolicy', { Bucket: 'us-bucket' })

      // Only the one base-region S3 client was ever needed.
      expect(FakeAwsS3Client).toHaveBeenCalledTimes(1)
    })

    test('a rejected GetBucketLocation falls back to the base-region client for sibling calls instead of poisoning them all with the same error', async () => {
      const locationError = new Error('AccessDenied: GetBucketLocation')
      mockSend.mockImplementation(async (command) => {
        if (command.__command === 'GetBucketLocationCommand') {
          throw locationError
        }
        return { $metadata: {}, ok: true }
      })

      const { invoke } = createInvoker({ region, credentials })

      // Fire the location call alongside several sibling calls concurrently,
      // mirroring runResource()'s Promise.all fan-out for a bucket's ~10 S3
      // calls.
      const results = await Promise.allSettled([
        invoke('s3', 'GetBucketLocation', { Bucket: 'denied-bucket' }),
        invoke('s3', 'GetBucketPolicy', { Bucket: 'denied-bucket' }),
        invoke('s3', 'GetBucketAcl', { Bucket: 'denied-bucket' }),
      ])

      const [locationResult, policyResult, aclResult] = results

      // The location call itself still surfaces its real error.
      expect(locationResult.status).toBe('rejected')
      expect(locationResult.reason).toBe(locationError)

      // The sibling calls are NOT rejected with the location error -- they
      // succeeded against the base-region client fallback.
      expect(policyResult.status).toBe('fulfilled')
      expect(aclResult.status).toBe('fulfilled')

      // Only one GetBucketLocation was attempted despite the concurrent
      // fan-out (the cached in-flight promise was reused, not re-fired, for
      // the sibling calls).
      const locationCalls = mockSend.mock.calls.filter(
        ([command]) => command.__command === 'GetBucketLocationCommand',
      )
      expect(locationCalls).toHaveLength(1)

      // All sibling calls ran on the (single) base-region S3 client -- no
      // extra regional client was constructed off the back of a failed
      // location lookup.
      expect(FakeAwsS3Client).toHaveBeenCalledTimes(1)
      expect(FakeAwsS3Client.mock.calls[0][0].region).toBe(region)
    })

    test('a rejected GetBucketLocation caches the base-region fallback decision, not a rejected promise: later sibling calls succeed and a repeat GetBucketLocation call re-surfaces the real error without a second AWS call', async () => {
      let locationCallCount = 0
      const locationError = new Error('AccessDenied: GetBucketLocation')
      mockSend.mockImplementation(async (command) => {
        if (command.__command === 'GetBucketLocationCommand') {
          locationCallCount += 1
          throw locationError
        }
        return { $metadata: {}, ok: true }
      })

      const { invoke } = createInvoker({ region, credentials })

      await expect(
        invoke('s3', 'GetBucketLocation', { Bucket: 'denied-bucket' }),
      ).rejects.toThrow(/AccessDenied/)

      // A subsequent, unrelated call for the same bucket must not replay the
      // cached rejection -- it should succeed via the base-region fallback.
      await expect(
        invoke('s3', 'GetBucketPolicy', { Bucket: 'denied-bucket' }),
      ).resolves.toEqual({ $metadata: {}, ok: true })

      // A repeat GetBucketLocation call for the same bucket re-surfaces the
      // real error from the cached fallback marker -- without triggering a
      // second live GetBucketLocation request.
      await expect(
        invoke('s3', 'GetBucketLocation', { Bucket: 'denied-bucket' }),
      ).rejects.toBe(locationError)

      expect(locationCallCount).toBe(1)
    })
  })
})
