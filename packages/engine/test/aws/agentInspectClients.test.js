import { describe, test, expect, beforeEach, jest } from '@jest/globals'

// Sentinel objects so we can assert the wrapped SDK client is what gets
// exposed on `.client`, and that the retry strategy is threaded through.
const RETRY_STRATEGY = { __retryStrategy: true }
const wrappedMarker = (raw) => ({ __wrapped: true, raw })

jest.unstable_mockModule('@serverless/util', () => ({
  addProxyToAwsClient: jest.fn((c) => wrappedMarker(c)),
  log: { get: () => ({ error: jest.fn(), info: jest.fn(), debug: jest.fn() }) },
  ServerlessError: class ServerlessError extends Error {},
}))

jest.unstable_mockModule('@smithy/util-retry', () => ({
  ConfiguredRetryStrategy: jest.fn(() => RETRY_STRATEGY),
}))

// Capture the config passed to each SDK client constructor.
const sdkCtorCalls = {}
function mockSdkClient(name) {
  return jest.fn(function (config) {
    sdkCtorCalls[name] = config
    this.__sdk = name
    this.send = jest.fn()
  })
}

jest.unstable_mockModule('@aws-sdk/client-sns', () => ({
  SNSClient: mockSdkClient('sns'),
}))
jest.unstable_mockModule('@aws-sdk/client-scheduler', () => ({
  SchedulerClient: mockSdkClient('scheduler'),
}))
jest.unstable_mockModule('@aws-sdk/client-cognito-identity-provider', () => ({
  CognitoIdentityProviderClient: mockSdkClient('cognito'),
}))
jest.unstable_mockModule('@aws-sdk/client-iot', () => ({
  IoTClient: mockSdkClient('iot'),
}))
jest.unstable_mockModule('@aws-sdk/client-kinesis', () => ({
  KinesisClient: mockSdkClient('kinesis'),
}))

const { addProxyToAwsClient } = await import('@serverless/util')
const { ConfiguredRetryStrategy } = await import('@smithy/util-retry')
const { AwsSnsClient } = await import('../../src/lib/aws/sns.js')
const { AwsSchedulerClient } = await import('../../src/lib/aws/scheduler.js')
const { AwsCognitoClient } = await import('../../src/lib/aws/cognito.js')
const { AwsIotClient } = await import('../../src/lib/aws/iot.js')
const { AwsKinesisClient } = await import('../../src/lib/aws/kinesis.js')

const cases = [
  { name: 'AwsSnsClient', Ctor: AwsSnsClient, sdk: 'sns' },
  { name: 'AwsSchedulerClient', Ctor: AwsSchedulerClient, sdk: 'scheduler' },
  { name: 'AwsCognitoClient', Ctor: AwsCognitoClient, sdk: 'cognito' },
  { name: 'AwsIotClient', Ctor: AwsIotClient, sdk: 'iot' },
  { name: 'AwsKinesisClient', Ctor: AwsKinesisClient, sdk: 'kinesis' },
]

describe('agent-inspect engine clients', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  test.each(cases)(
    '$name exposes a proxy-wrapped .client with the configured retry strategy',
    ({ Ctor, sdk }) => {
      const client = new Ctor({ region: 'us-east-1' })

      // .client is the proxy-wrapped SDK client (not the bare SDK instance).
      expect(client.client).toEqual(
        expect.objectContaining({ __wrapped: true }),
      )
      expect(addProxyToAwsClient).toHaveBeenCalledTimes(1)

      // The retry strategy is constructed and passed to the SDK client ctor.
      expect(ConfiguredRetryStrategy).toHaveBeenCalledTimes(1)
      expect(ConfiguredRetryStrategy).toHaveBeenCalledWith(
        10,
        expect.any(Function),
      )
      expect(sdkCtorCalls[sdk].retryStrategy).toBe(RETRY_STRATEGY)

      // awsConfig is forwarded to the SDK client ctor.
      expect(sdkCtorCalls[sdk].region).toBe('us-east-1')
    },
  )

  test.each(cases)(
    '$name defaults awsConfig to {} when omitted',
    ({ Ctor }) => {
      expect(() => new Ctor()).not.toThrow()
      expect(addProxyToAwsClient).toHaveBeenCalledTimes(1)
    },
  )

  test('the retry backoff function matches the sqs template (100 + attempt*5000)', () => {
    new AwsSnsClient()
    const backoff = ConfiguredRetryStrategy.mock.calls[0][1]
    expect(backoff(0)).toBe(100)
    expect(backoff(2)).toBe(100 + 2 * 5000)
  })
})
