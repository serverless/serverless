// Registry entries for the `lambda-microvms` AWS service (alias
// `microvms`/`sandboxes`) -- the Sandboxes feature (PR #13663).
//
// INDEX-ONLY IN v1: the MicroVMs control plane is still in preview --
// `@aws-sdk/client-lambda-microvms` is not published at this repo's pinned
// AWS SDK version (3.1057.0; earliest published is 3.1079.0), and connector
// describe support is not yet available -- so there is no engine client and
// no SERVICE_MAP entry in build-clients.js for this service. These two
// entries therefore carry `awsService: null` and `calls: []`:
//   - `category: 'sandboxes'` still makes discover-resources.js's
//     knownCategories() include 'sandboxes' (it's derived from
//     REGISTRY_ENTRIES' categories regardless of awsService), so the
//     `--sandboxes` index bucket exists and these resources are listed
//     (category/status only, no describe) in the cheap index.
//   - `awsService: null` is exactly what makes select.js's expansion gate
//     (`Boolean(resource.awsService)`) exclude them -- neither `--sandboxes`
//     nor `--aws-services lambda-microvms/microvms/sandboxes` can expand
//     these resources, by construction of that shared gate (see
//     select.js's axisSelected filter and discover-resources.js's toDescriptor,
//     which both key off the registry's per-cfnType awsService lookup).
//
// When @aws-sdk/client-lambda-microvms becomes available at the repo's SDK
// pin: add an AwsLambdaMicrovmsClient (packages/engine/src/lib/aws/
// lambda-microvms.js, honoring the AWS_ENDPOINT_URL_LAMBDA_MICROVMS endpoint
// override), a SERVICE_MAP entry in build-clients.js, then flip these two
// entries' `awsService` to `'lambda-microvms'` and add their `calls`
// (`GetMicrovmImage`+`GetMicrovmImageVersion` for MicrovmImage;
// `GetNetworkConnector` for NetworkConnector, confirming it exists in the
// SDK first -- else NetworkConnector alone stays index-only).

const microvmImageEntry = {
  cfnType: 'AWS::Lambda::MicrovmImage',
  awsService: null,
  category: 'sandboxes',
  engineClient: null,
  // PhysicalResourceId is the image identifier as-is (kept for the index's
  // physicalId column; unused for describe since there are no calls).
  identifier: (stackResource) => stackResource.PhysicalResourceId,
  calls: [],
}

const networkConnectorEntry = {
  cfnType: 'AWS::Lambda::NetworkConnector',
  awsService: null,
  category: 'sandboxes',
  engineClient: null,
  identifier: (stackResource) => stackResource.PhysicalResourceId,
  calls: [],
}

export const lambdaMicrovmsRegistryEntries = [
  microvmImageEntry,
  networkConnectorEntry,
]
