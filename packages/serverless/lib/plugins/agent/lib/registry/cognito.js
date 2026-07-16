// Registry entry for the `cognito-idp` AWS service (alias `cognito`).

const cognitoUserPoolEntry = {
  cfnType: 'AWS::Cognito::UserPool',
  awsService: 'cognito-idp',
  category: 'identity',
  engineClient: 'cognito-idp',
  // PhysicalResourceId is the user pool id as-is (e.g. us-east-1_abc123).
  identifier: (stackResource) => stackResource.PhysicalResourceId,
  calls: [
    { key: 'userPool', method: 'DescribeUserPool', input: 'UserPoolId' },
    {
      key: 'userPoolClients',
      method: 'ListUserPoolClients',
      input: 'UserPoolId',
      paginate: true,
      // Two-input fan-out: DescribeUserPoolClient needs BOTH the outer
      // UserPoolId (the resource identifier) AND the per-item ClientId --
      // something the plain itemField shape can't express on its own
      // (see run-calls.js's runFanOut: the implicit "carry the outer
      // `input`" reuse only fires when `itemField` is ABSENT, which isn't
      // the case here since ClientId itself comes from the item). This
      // extends the fan-out shape with `extraInput(identifier)`, an
      // explicit escape hatch added specifically for this case -- it
      // returns constant params merged into the first-hop input alongside
      // the item field. Mirrors iam.js's attached-policy chain in spirit
      // (reusing an outer value on a per-item call) but needed a new knob
      // because iam.js's chain reuses the outer value via `then.itemInput`
      // on the SECOND hop, whereas this is a single hop needing the outer
      // value on the FIRST (and only) call.
      fanOut: {
        method: 'DescribeUserPoolClient',
        listResultKey: 'UserPoolClients',
        itemInput: 'ClientId',
        itemField: 'ClientId',
        extraInput: (identifier) => ({ UserPoolId: identifier }),
      },
    },
  ],
}

export const cognitoRegistryEntries = [cognitoUserPoolEntry]
