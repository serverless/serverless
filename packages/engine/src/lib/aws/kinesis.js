import { KinesisClient as AwsSdkKinesisClient } from '@aws-sdk/client-kinesis'
import { addProxyToAwsClient } from '@serverless/util'
import { ConfiguredRetryStrategy } from '@smithy/util-retry'

/**
 * AWS Kinesis Client to interact with Kinesis streams and stream consumers.
 *
 * Exposes the proxy/CA-wrapped SDK v3 client as `this.client` so callers
 * (e.g. the `agent inspect` client factory) can dispatch commands generically.
 */
export class AwsKinesisClient {
  /**
   * Constructor for the AwsKinesisClient.
   *
   * @param {Object} [awsConfig={}] - AWS SDK configuration options.
   */
  constructor(awsConfig = {}) {
    this.client = addProxyToAwsClient(
      new AwsSdkKinesisClient({
        ...awsConfig,
        retryStrategy: new ConfiguredRetryStrategy(
          10,
          (attempt) => 100 + attempt * 5000,
        ),
      }),
    )
  }
}
