// Registry entries for the `lambda-web` AWS service -- the Lambda Web
// Functions behind `webApps`, described with `@aws-sdk/client-lambda-web`.
// The service has no alias: `--web-apps` is the category flag, and
// `lambda-web` is the only `--aws-services` token.
//
// Each type's PhysicalResourceId is assumed to be its ARN (the WebFunction's
// `Ref` is documented as its ARN):
//   function  arn:<partition>:lambda:<region>:<account>:web-function/<fn>
//   revision  <function ARN>/revision/<revision id>
//   endpoint  <function ARN>/endpoint/<endpoint name>
// GetWebFunction takes the function ARN as `functionName`. The revision and
// endpoint calls need the function too, so their ARNs are split into the
// function ARN (`functionName`) and the trailing id/name.

const CHILD_ARN =
  /^(arn:[^:]+:lambda:[^:]*:[^:]*:web-function\/[^/]+)\/(?:revision|endpoint)\/(.+)$/

function childIdentifier(inputKey) {
  return (stackResource) => {
    const physicalId = stackResource.PhysicalResourceId
    const match = CHILD_ARN.exec(physicalId)
    if (!match) return { [inputKey]: physicalId }
    return { functionName: match[1], [inputKey]: match[2] }
  }
}

const webFunctionEntry = {
  cfnType: 'AWS::Lambda::WebFunction',
  awsService: 'lambda-web',
  category: 'web-apps',
  engineClient: 'lambda-web',
  identifier: (stackResource) => stackResource.PhysicalResourceId,
  calls: [
    { key: 'webFunction', method: 'GetWebFunction', input: 'functionName' },
  ],
}

const webFunctionRevisionEntry = {
  cfnType: 'AWS::Lambda::WebFunctionRevision',
  awsService: 'lambda-web',
  category: 'web-apps',
  engineClient: 'lambda-web',
  // { functionName, revisionId } already matches the SDK input shape.
  identifier: childIdentifier('revisionId'),
  calls: [{ key: 'revision', method: 'GetWebFunctionRevision' }],
}

const webFunctionEndpointEntry = {
  cfnType: 'AWS::Lambda::WebFunctionEndpoint',
  awsService: 'lambda-web',
  category: 'web-apps',
  engineClient: 'lambda-web',
  // { functionName, endpointName } already matches the SDK input shape.
  identifier: childIdentifier('endpointName'),
  calls: [{ key: 'endpoint', method: 'GetWebFunctionEndpoint' }],
}

export const lambdaWebRegistryEntries = [
  webFunctionEntry,
  webFunctionRevisionEntry,
  webFunctionEndpointEntry,
]
