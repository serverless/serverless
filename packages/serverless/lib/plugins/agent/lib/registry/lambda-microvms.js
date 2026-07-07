// Registry entries for the `lambda-microvms` AWS service (alias
// `microvms`/`sandboxes`) -- the Sandboxes feature (PR #13663).
//
// MicrovmImage is DESCRIBABLE: `@aws-sdk/client-lambda-microvms` provides
// `GetMicrovmImage` (input `imageIdentifier`, an ARN or ID). The CFN
// PhysicalResourceId of an `AWS::Lambda::MicrovmImage` is that identifier,
// used verbatim as `imageIdentifier`.
//
// NetworkConnector stays INDEX-ONLY: the microvms client exposes no
// connector describe/get/list operation at all, so there is nothing to call
// for `AWS::Lambda::NetworkConnector`. It carries `awsService: null` /
// `calls: []`, so it still appears in the cheap index (its `sandboxes`
// category keeps discover-resources.js's knownCategories() including
// 'sandboxes') but the expansion gate in select.js (`Boolean(awsService)`)
// excludes it -- neither `--sandboxes` nor `--aws-services microvms` can
// expand it, by construction of that shared gate (see select.js's
// axisSelected filter and discover-resources.js's toDescriptor).

const microvmImageEntry = {
  cfnType: 'AWS::Lambda::MicrovmImage',
  awsService: 'lambda-microvms',
  category: 'sandboxes',
  engineClient: 'lambda-microvms',
  // PhysicalResourceId is the image identifier (ARN or ID) -- passed as-is to
  // GetMicrovmImage's `imageIdentifier`.
  identifier: (stackResource) => stackResource.PhysicalResourceId,
  calls: [
    { key: 'image', method: 'GetMicrovmImage', input: 'imageIdentifier' },
  ],
}

const networkConnectorEntry = {
  cfnType: 'AWS::Lambda::NetworkConnector',
  // Index-only: no describe operation exists in the SDK (see file header).
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
