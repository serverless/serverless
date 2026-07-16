import { IoTClient as AwsSdkIoTClient } from '@aws-sdk/client-iot'
import { addProxyToAwsClient } from '@serverless/util'
import { ConfiguredRetryStrategy } from '@smithy/util-retry'

/**
 * AWS IoT Client to interact with IoT topic rules and provisioning templates.
 *
 * Exposes the proxy/CA-wrapped SDK v3 client as `this.client` so callers
 * (e.g. the `agent inspect` client factory) can dispatch commands generically.
 */
export class AwsIotClient {
  /**
   * Constructor for the AwsIotClient.
   *
   * @param {Object} [awsConfig={}] - AWS SDK configuration options.
   */
  constructor(awsConfig = {}) {
    this.client = addProxyToAwsClient(
      new AwsSdkIoTClient({
        ...awsConfig,
        retryStrategy: new ConfiguredRetryStrategy(
          10,
          (attempt) => 100 + attempt * 5000,
        ),
      }),
    )
  }
}
