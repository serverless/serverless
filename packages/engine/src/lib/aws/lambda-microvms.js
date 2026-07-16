import { LambdaMicrovmsClient as AwsSdkLambdaMicrovmsClient } from '@aws-sdk/client-lambda-microvms'
import { addProxyToAwsClient } from '@serverless/util'
import { ConfiguredRetryStrategy } from '@smithy/util-retry'

/**
 * AWS Lambda MicroVMs (Sandboxes) client — the control plane behind the
 * `AWS::Lambda::MicrovmImage` / `AWS::Lambda::NetworkConnector` resources.
 *
 * Exposes the proxy/CA-wrapped SDK v3 client as `this.client` so callers
 * (e.g. the `agent inspect` client factory) can dispatch commands generically.
 *
 * Honors `AWS_ENDPOINT_URL_LAMBDA_MICROVMS` as an explicit endpoint override
 * so the local Sandboxes emulator / dev mode can point this client at a local
 * process. When unset, the SDK resolves the real regional endpoint as usual.
 */
export class AwsLambdaMicrovmsClient {
  /**
   * @param {Object} [awsConfig={}] - AWS SDK configuration options.
   */
  constructor(awsConfig = {}) {
    const endpointOverride = process.env.AWS_ENDPOINT_URL_LAMBDA_MICROVMS
    this.client = addProxyToAwsClient(
      new AwsSdkLambdaMicrovmsClient({
        ...awsConfig,
        ...(endpointOverride ? { endpoint: endpointOverride } : {}),
        retryStrategy: new ConfiguredRetryStrategy(
          10,
          (attempt) => 100 + attempt * 5000,
        ),
      }),
    )
  }
}
