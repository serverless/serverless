import { SNSClient as AwsSdkSNSClient } from '@aws-sdk/client-sns'
import { addProxyToAwsClient } from '@serverless/util'
import { ConfiguredRetryStrategy } from '@smithy/util-retry'

/**
 * AWS SNS Client to interact with SNS topics.
 *
 * Exposes the proxy/CA-wrapped SDK v3 client as `this.client` so callers
 * (e.g. the `agent inspect` client factory) can dispatch commands generically.
 */
export class AwsSnsClient {
  /**
   * Constructor for the AwsSnsClient.
   *
   * @param {Object} [awsConfig={}] - AWS SDK configuration options.
   */
  constructor(awsConfig = {}) {
    this.client = addProxyToAwsClient(
      new AwsSdkSNSClient({
        ...awsConfig,
        retryStrategy: new ConfiguredRetryStrategy(
          10,
          (attempt) => 100 + attempt * 5000,
        ),
      }),
    )
  }
}
