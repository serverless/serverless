import { SchedulerClient as AwsSdkSchedulerClient } from '@aws-sdk/client-scheduler'
import { addProxyToAwsClient } from '@serverless/util'
import { ConfiguredRetryStrategy } from '@smithy/util-retry'

/**
 * AWS EventBridge Scheduler Client to interact with schedules.
 *
 * Exposes the proxy/CA-wrapped SDK v3 client as `this.client` so callers
 * (e.g. the `agent inspect` client factory) can dispatch commands generically.
 */
export class AwsSchedulerClient {
  /**
   * Constructor for the AwsSchedulerClient.
   *
   * @param {Object} [awsConfig={}] - AWS SDK configuration options.
   */
  constructor(awsConfig = {}) {
    this.client = addProxyToAwsClient(
      new AwsSdkSchedulerClient({
        ...awsConfig,
        retryStrategy: new ConfiguredRetryStrategy(
          10,
          (attempt) => 100 + attempt * 5000,
        ),
      }),
    )
  }
}
