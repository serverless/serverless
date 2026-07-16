// Registry entries for the `lambda` AWS service.
//
// `engineClient` is recorded as a STRING NAME ('lambda'), not the imported
// AwsLambdaClient class. The registry has no dependency on
// @serverless/engine; build-clients.js owns the name -> class mapping when
// it builds the client factory. Keep this decision in mind when adding new
// entries.

/**
 * Lambda::LayerVersion's PhysicalResourceId is the full version ARN, e.g.
 * `arn:aws:lambda:us-east-1:123456789012:layer:my-layer:3`. GetLayerVersion
 * wants `{ LayerName, VersionNumber }` instead, so split the ARN.
 * Partition-agnostic: works for aws / aws-cn / aws-us-gov (and anything else
 * matching the `arn:<partition>:...` shape) since we only split on `:`.
 */
function layerVersionIdentifier(stackResource) {
  const arn = stackResource.PhysicalResourceId
  const parts = arn.split(':')
  const versionNumber = Number(parts[parts.length - 1])
  const layerName = parts[parts.length - 2]
  return { LayerName: layerName, VersionNumber: versionNumber }
}

const lambdaFunctionEntry = {
  cfnType: 'AWS::Lambda::Function',
  awsService: 'lambda',
  category: 'functions',
  engineClient: 'lambda',
  // PhysicalResourceId is the function name (or ARN) as-is.
  identifier: (stackResource) => stackResource.PhysicalResourceId,
  calls: [
    { key: 'configuration', method: 'GetFunction', input: 'FunctionName' },
    {
      key: 'functionUrlConfig',
      method: 'GetFunctionUrlConfig',
      input: 'FunctionName',
      optional: true,
    },
    {
      key: 'resourcePolicy',
      method: 'GetPolicy',
      input: 'FunctionName',
      optional: true,
    },
    {
      key: 'eventInvokeConfig',
      method: 'GetFunctionEventInvokeConfig',
      input: 'FunctionName',
      optional: true,
    },
    {
      key: 'versions',
      method: 'ListVersionsByFunction',
      input: 'FunctionName',
      paginate: true,
    },
    {
      key: 'aliases',
      method: 'ListAliases',
      input: 'FunctionName',
      paginate: true,
    },
    {
      key: 'eventSourceMappings',
      method: 'ListEventSourceMappings',
      input: 'FunctionName',
      paginate: true,
    },
  ],
}

const lambdaLayerVersionEntry = {
  cfnType: 'AWS::Lambda::LayerVersion',
  awsService: 'lambda',
  category: 'functions',
  engineClient: 'lambda',
  identifier: layerVersionIdentifier,
  calls: [
    // LayerName/VersionNumber both come from the identifier; no explicit
    // `input` needed since both keys already match the SDK's input shape.
    { key: 'layerVersion', method: 'GetLayerVersion' },
    {
      key: 'resourcePolicy',
      method: 'GetLayerVersionPolicy',
      optional: true,
    },
  ],
}

export const lambdaRegistryEntries = [
  lambdaFunctionEntry,
  lambdaLayerVersionEntry,
]
