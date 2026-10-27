import { EventBridgeV2Client as AwsSdkEventBridgeV2Client } from '@aws-sdk/client-eventbridgev2'
import { addProxyToAwsClient } from '@serverless/util'
import { ConfiguredRetryStrategy } from '@smithy/util-retry'

/**
 * AWS EventBridge Custom Event Bus Client to interact with buses and
 * subscribers (the EventBridge V2 API).
 *
 * Exposes the proxy/CA-wrapped SDK v3 client as `this.client` so callers
 * (e.g. the `agent inspect` client factory) can dispatch commands generically.
 */
export class AwsEventBridgeV2Client {
  /**
   * Constructor for the AwsEventBridgeV2Client.
   *
   * @param {Object} [awsConfig={}] - AWS SDK configuration options.
   */
  constructor(awsConfig = {}) {
    this.client = addProxyToAwsClient(
      new AwsSdkEventBridgeV2Client({
        ...awsConfig,
        retryStrategy: new ConfiguredRetryStrategy(
          10,
          (attempt) => 100 + attempt * 5000,
        ),
      }),
    )
  }
}
