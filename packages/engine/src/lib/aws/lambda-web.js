import { LambdaWebClient as AwsSdkLambdaWebClient } from '@aws-sdk/client-lambda-web'
import { addProxyToAwsClient } from '@serverless/util'
import { ConfiguredRetryStrategy } from '@smithy/util-retry'

/**
 * AWS Lambda Web Functions client — the control plane behind the
 * `AWS::Lambda::WebFunction` / `WebFunctionRevision` / `WebFunctionEndpoint`
 * resources that `webApps` deploys.
 *
 * Exposes the proxy/CA-wrapped SDK v3 client as `this.client` so callers
 * (e.g. the `agent inspect` client factory) can dispatch commands generically.
 */
export class AwsLambdaWebClient {
  /**
   * @param {Object} [awsConfig={}] - AWS SDK configuration options.
   */
  constructor(awsConfig = {}) {
    this.client = addProxyToAwsClient(
      new AwsSdkLambdaWebClient({
        ...awsConfig,
        retryStrategy: new ConfiguredRetryStrategy(
          10,
          (attempt) => 100 + attempt * 5000,
        ),
      }),
    )
  }
}
