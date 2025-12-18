// default localstack AWS endpoint URL
const DEFAULT_AWS_ENDPOINT_URL = 'http://localhost:4566'
// default localstack AWS endpoint URL for S3
const DEFAULT_AWS_ENDPOINT_URL_S3 = 'http://s3.localhost.localstack.cloud:4566'
const DEFAULT_STAGE = 'dev'

export const configureLocalstackAWSEndpoint = ({ config, stage }) => {
  // set local endpoints for AWS SDK if serverless-localstack plugin is active
  // see https://docs.aws.amazon.com/sdkref/latest/guide/feature-ss-endpoints.html
  if (
    config?.plugins?.includes('serverless-localstack') &&
    isActive({
      effectiveStage: stage,
      pluginStages: config?.custom?.localstack?.stages,
    })
  ) {
    if (!process.env.AWS_ENDPOINT_URL) {
      process.env.AWS_ENDPOINT_URL = DEFAULT_AWS_ENDPOINT_URL
    }
    // S3 service stands out for localstack approach to endpoint configuration
    // see https://docs.localstack.cloud/user-guide/aws/s3/#path-style-and-virtual-hosted-style-requests
    if (!process.env.AWS_ENDPOINT_URL_S3) {
      process.env.AWS_ENDPOINT_URL_S3 = DEFAULT_AWS_ENDPOINT_URL_S3
    }
  }
}

// logic adapted from the serverless-localstack plugin
// https://github.com/localstack/serverless-localstack/blob/5901186f1aca732bca70e0a2a8e641a8adf04616/src/index.js#L408-L420
const isActive = ({ effectiveStage, pluginStages }) => {
  // Activate the plugin if either:
  //   (1) the serverless stage (explicitly defined or default stage "dev") is included in the `stages` config; or
  //   (2) serverless is invoked without a --stage flag (default stage "dev") and no `stages` config is provided
  const noStageUsed =
    pluginStages === undefined && effectiveStage === DEFAULT_STAGE
  const includedInStages = pluginStages && pluginStages.includes(effectiveStage)
  return noStageUsed || includedInStages
}
