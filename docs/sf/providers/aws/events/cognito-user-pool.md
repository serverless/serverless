<!--
title: Cognito User Pool Triggers
description: Run Lambda functions on Amazon Cognito user pool triggers with the cognitoUserPool event, on a new or an existing user pool.
short_title: Cognito User Pool
keywords:
  [
    'Serverless Framework',
    'Cognito user pool Lambda trigger',
    'PreSignUp',
    'PreTokenGeneration',
    'CustomEmailSender',
    'InboundFederation',
  ]
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/aws/events/cognito-user-pool)

<!-- DOCS-SITE-LINK:END -->

# Cognito User Pool Triggers

The `cognitoUserPool` event runs a Lambda function when an Amazon Cognito user pool reaches a trigger, such as a user signing up or Cognito issuing tokens. By default, the Framework creates the user pool, named after the event's `pool` key, and attaches the function as the trigger. To attach a function to a user pool that already exists, set `existing: true` (see [Use an existing user pool](#use-an-existing-user-pool)).

This `serverless.yml` creates a user pool named `MyUserPool` and runs `preSignUp` before each sign-up:

```yaml
# serverless.yml
service: my-service

provider:
  name: aws
  runtime: nodejs24.x

functions:
  preSignUp:
    handler: handler.preSignUp
    events:
      - cognitoUserPool:
          pool: MyUserPool
          trigger: PreSignUp
```

The handler receives the trigger event and returns it, with any changes in `event.response`:

```javascript
// handler.mjs
export const preSignUp = async (event) => {
  if (event.request.userAttributes.email?.endsWith('@example.com')) {
    event.response.autoConfirmUser = true
  }
  return event
}
```

## cognitoUserPool event options

The `cognitoUserPool` event accepts these keys:

| Key             | Type                                         | Default                             | Description                                                                                                              |
| --------------- | -------------------------------------------- | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `pool`          | string, up to 128 characters                 | Required                            | The user pool name: letters, digits, spaces and `_ + = , . @ -`                                                          |
| `trigger`       | one of the [valid triggers](#valid-triggers) | Required                            | The trigger that runs the function                                                                                       |
| `existing`      | boolean                                      | `false`                             | Attach the function to an existing user pool instead of creating one                                                     |
| `forceDeploy`   | boolean                                      | `false`                             | With `existing: true`, reapply the trigger on every deployment                                                           |
| `kmsKeyId`      | KMS key ARN or intrinsic function            | Required for custom sender triggers | The key Cognito encrypts codes with                                                                                      |
| `lambdaVersion` | `V1_0`, `V2_0` or `V3_0`                     | `V1_0`                              | The trigger event version, for `PreTokenGeneration`, `InboundFederation`, `CustomSMSSender` and `CustomEmailSender` only |

## Valid triggers

The `cognitoUserPool` event's `trigger` accepts these values:

| Trigger                                                                     | When Cognito invokes the function                                                                                                   |
| --------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `PreSignUp`                                                                 | Before it registers a new user                                                                                                      |
| `PostConfirmation`                                                          | After a user confirms their registration                                                                                            |
| `PreAuthentication`                                                         | Before it signs a user in                                                                                                           |
| `PostAuthentication`                                                        | After it signs a user in                                                                                                            |
| `PreTokenGeneration`                                                        | Before it issues tokens, to customize claims                                                                                        |
| `CustomMessage`                                                             | Before it sends a verification, invitation or other message, to customize it                                                        |
| `DefineAuthChallenge`, `CreateAuthChallenge`, `VerifyAuthChallengeResponse` | During a custom authentication flow                                                                                                 |
| `UserMigration`                                                             | When a user who isn't in the pool signs in or resets their password, to migrate them                                                |
| `InboundFederation`                                                         | After a user signs in through an external SAML or OIDC identity provider, before it stores the user's attributes, to transform them |
| `CustomSMSSender`, `CustomEmailSender`                                      | Instead of sending an SMS or email itself, so that you send it through another provider                                             |

For the event each trigger receives, see [Customizing user pool workflows with Lambda triggers](https://docs.aws.amazon.com/cognito/latest/developerguide/cognito-user-pools-working-with-lambda-triggers.html).

## Several triggers and pools

To attach several triggers to one user pool, use the same `pool` in each `cognitoUserPool` event. The Framework creates the pool once:

```yaml
functions:
  preSignUp:
    handler: handler.preSignUp
    events:
      - cognitoUserPool:
          pool: MyUserPool
          trigger: PreSignUp
  customMessage:
    handler: handler.customMessage
    events:
      - cognitoUserPool:
          pool: MyUserPool
          trigger: CustomMessage
```

A different `pool` value creates another user pool. To run one function for several pools, add an event for each:

```yaml
functions:
  preSignUp:
    handler: handler.preSignUp
    events:
      - cognitoUserPool:
          pool: CustomersPool
          trigger: PreSignUp
      - cognitoUserPool:
          pool: PartnersPool
          trigger: PreSignUp
```

## Configure the generated user pool

The Framework creates each user pool as an `AWS::Cognito::UserPool` resource with the logical ID `CognitoUserPool` followed by the pool name's letters and digits: `MyUserPool` becomes `CognitoUserPoolMyUserPool`. To set other user pool properties, declare a resource with that logical ID under `resources`; the Framework merges it with the generated pool and keeps the triggers:

```yaml
functions:
  preSignUp:
    handler: handler.preSignUp
    events:
      - cognitoUserPool:
          pool: MyUserPool
          trigger: PreSignUp

resources:
  Resources:
    CognitoUserPoolMyUserPool:
      Type: AWS::Cognito::UserPool
      Properties:
        UsernameAttributes:
          - email
        AutoVerifiedAttributes:
          - email
```

For the available properties, see [AWS::Cognito::UserPool](https://docs.aws.amazon.com/AWSCloudFormation/latest/TemplateReference/aws-resource-cognito-userpool.html). For logical IDs of other generated resources, see the [AWS CloudFormation resource reference](../guide/resources.md#aws-cloudformation-resource-reference).

## Use an existing user pool

To attach a function to a user pool that another stack or the console created, set the `cognitoUserPool` event's `existing: true`. All other keys work the same way:

```yaml
functions:
  customMessage:
    handler: handler.customMessage
    events:
      - cognitoUserPool:
          pool: legacy-user-pool
          trigger: CustomMessage
          existing: true
```

- `pool` is the user pool's name, not its ID or ARN. The Framework updates the first user pool in the Region with that name.
- Each function can attach to one existing user pool; several triggers on that pool are fine.
- The Framework adds a custom resource, backed by a Lambda function and an IAM role, that adds the function to the pool's triggers and grants Cognito permission to invoke it. On `serverless remove`, it removes the service's functions from the pool's triggers.
- The custom resource's role gets `cognito-idp:ListUserPools`, `cognito-idp:DescribeUserPool` and `cognito-idp:UpdateUserPool`, `lambda:AddPermission` and `lambda:RemovePermission` on the trigger functions, `iam:PassRole`, and `kms:CreateGrant` on the key of a custom sender trigger.

## Reapply triggers on an existing user pool

The custom resource for an existing user pool runs only when its configuration changes. When something outside the service can change the pool's triggers, set `forceDeploy: true` to reapply them on every deployment:

```yaml
functions:
  preSignUp:
    handler: handler.preSignUp
    events:
      - cognitoUserPool:
          pool: legacy-user-pool
          trigger: PreSignUp
          existing: true
          forceDeploy: true
```

`forceDeploy` has an effect only together with `existing: true`.

## Pre token generation versions

The `PreTokenGeneration` trigger has three event versions, which the `cognitoUserPool` event's `lambdaVersion` selects:

- `V1_0` (the default when `lambdaVersion` is omitted): customizes the ID token.
- `V2_0`: customizes the ID and access tokens.
- `V3_0`: customizes the ID and access tokens, including for machine-to-machine (client credentials) grants.

```yaml
functions:
  preTokenGeneration:
    handler: handler.preTokenGeneration
    events:
      - cognitoUserPool:
          pool: MyUserPool
          trigger: PreTokenGeneration
          lambdaVersion: V2_0
```

`V2_0` and `V3_0` require a user pool on the Essentials or Plus feature plan. See [Pre token generation Lambda trigger](https://docs.aws.amazon.com/cognito/latest/developerguide/user-pool-lambda-pre-token-generation.html).

## Inbound federation trigger

The `InboundFederation` trigger runs when a user signs in through an external identity provider (SAML, OIDC or a social provider) configured on the user pool. The function receives the attributes the provider returned and decides which attributes the user pool stores, for new and returning federated users alike. Use it to shorten attribute values that exceed the user pool's 2,048-character limit, to drop attributes you don't want stored, or to rename the provider's group names:

```yaml
functions:
  inboundFederation:
    handler: handler.inboundFederation
    events:
      - cognitoUserPool:
          pool: MyUserPool
          trigger: InboundFederation
```

The handler finds the provider's attributes in `event.request.attributes.samlResponse` for SAML providers, and in `event.request.attributes.idToken` and `event.request.attributes.userInfo` for OIDC and social providers. It returns the attributes to store in `event.response.userAttributesToMap`:

```javascript
// handler.mjs
const MAX_ATTRIBUTE_LENGTH = 2048

export const inboundFederation = async (event) => {
  const { providerType, attributes } = event.request
  const providerAttributes =
    providerType === 'SAML'
      ? attributes.samlResponse
      : { ...attributes.userInfo, ...attributes.idToken }

  event.response.userAttributesToMap = Object.fromEntries(
    Object.entries(providerAttributes ?? {}).map(([name, value]) => [
      name,
      typeof value === 'string' ? value.slice(0, MAX_ATTRIBUTE_LENGTH) : value,
    ]),
  )
  return event
}
```

- `userAttributesToMap` replaces the provider's attributes: the user pool drops every attribute the function leaves out, so return the unchanged ones too. An empty object keeps all of the provider's attributes as they are.
- `lambdaVersion` accepts only `V1_0` for `InboundFederation`, which is also the default.
- The trigger works for a user pool the Framework creates and for an existing user pool (`existing: true`). Cognito invokes it only for sign-ins through an identity provider configured on the user pool.

For the full event and more examples, see [Inbound federation Lambda trigger](https://docs.aws.amazon.com/cognito/latest/developerguide/user-pool-lambda-inbound-federation.html).

## Custom sender triggers

The `CustomSMSSender` and `CustomEmailSender` triggers let a function send Cognito's messages through another provider. Cognito encrypts the code or temporary password in each message with a symmetric AWS KMS key, so these triggers need the `cognitoUserPool` event's `kmsKeyId`:

```yaml
provider:
  name: aws
  runtime: nodejs24.x
  iam:
    role:
      statements:
        - Effect: Allow
          Action: kms:Decrypt
          Resource: !GetAtt SenderKey.Arn

functions:
  customEmailSender:
    handler: handler.customEmailSender
    events:
      - cognitoUserPool:
          pool: MyUserPool
          trigger: CustomEmailSender
          kmsKeyId: !GetAtt SenderKey.Arn

resources:
  Resources:
    SenderKey:
      Type: AWS::KMS::Key
      Properties:
        Description: Encrypts Cognito codes for the custom email sender
```

- `kmsKeyId` takes a KMS key ARN, such as `arn:aws:kms:us-east-1:123456789012:key/12345678-9abc-def0-1234-56789abcdef1`, or an intrinsic function that returns one.
- A user pool uses one key for all its custom sender triggers.
- `lambdaVersion` accepts only `V1_0` for custom sender triggers, which is also the default.
- The function decrypts the code with the key, so its role needs `kms:Decrypt` on the key, as in the preceding example.

The handler finds the reason for the message in `event.triggerSource` (such as `CustomEmailSender_SignUp` or `CustomSMSSender_ForgotPassword`), the request type in `event.request.type` (`customEmailSenderRequestV1` or `customSMSSenderRequestV1`) and the encrypted code in `event.request.code`:

```javascript
// handler.mjs
export const customEmailSender = async (event) => {
  if (event.triggerSource === 'CustomEmailSender_SignUp') {
    // decrypt event.request.code with the AWS Encryption SDK, then send the email
  }
}
```

For decrypting the code, see [Custom sender Lambda triggers](https://docs.aws.amazon.com/cognito/latest/developerguide/user-pool-lambda-custom-sender-triggers.html), [Custom email sender](https://docs.aws.amazon.com/cognito/latest/developerguide/user-pool-lambda-custom-email-sender.html) and [Custom SMS sender](https://docs.aws.amazon.com/cognito/latest/developerguide/user-pool-lambda-custom-sms-sender.html).

## Custom message trigger handlers

One `CustomMessage` function handles every message type; `event.triggerSource` says which message Cognito is about to send:

```javascript
// handler.mjs
export const customMessage = async (event) => {
  if (event.triggerSource === 'CustomMessage_SignUp') {
    event.response.emailSubject = 'Welcome'
    event.response.emailMessage = `Your code is ${event.request.codeParameter}`
  }
  return event
}
```

Cognito sends the `emailSubject` and `emailMessage` a custom message function returns only when the user pool sends email through Amazon SES, with `EmailSendingAccount: DEVELOPER`. For a user pool the Framework creates, set the email configuration as in [Configure the generated user pool](#configure-the-generated-user-pool):

```yaml
resources:
  Resources:
    CognitoUserPoolMyUserPool:
      Type: AWS::Cognito::UserPool
      Properties:
        EmailConfiguration:
          EmailSendingAccount: DEVELOPER
          SourceArn: arn:aws:ses:us-east-1:123456789012:identity/no-reply@example.com
```

`SourceArn` is the ARN of an SES verified identity. See [Amazon SES email configuration](https://docs.aws.amazon.com/cognito/latest/developerguide/user-pool-email.html#user-pool-email-developer).

For all trigger sources and the response fields, see [Custom message Lambda trigger](https://docs.aws.amazon.com/cognito/latest/developerguide/user-pool-lambda-custom-message.html).

## Permissions for Cognito triggers

For a user pool the Framework creates, it adds a `lambda:InvokeFunction` permission for `cognito-idp.amazonaws.com`, limited to that user pool, for each trigger function. For an existing user pool, the custom resource adds the permission. The trigger functions' own role needs no extra permissions, except `kms:Decrypt` for custom sender triggers.

## Troubleshooting Cognito user pool triggers

### `Only one Cognito User Pool can be configured per function. ...`

This happens when one function has `existing: true` events for two different user pools. Use one function per existing user pool; the functions can share a handler.

### `KMS Key must be set when using a Custom Sender Source Trigger (CustomSMSSender and/or CustomEmailSender). ...`

This happens when a `CustomSMSSender` or `CustomEmailSender` event has no `kmsKeyId`. Add the key's ARN as shown in [Custom sender triggers](#custom-sender-triggers).

### `Only one KMS Key for can be configured per Cognito User Pool. ...`

This happens when custom sender events for the same user pool set different `kmsKeyId` values. Use one key for all custom sender triggers of the pool.

### `lambdaVersion is only supported for CustomSMSSender, CustomEmailSender, PreTokenGeneration, and InboundFederation triggers. ...`

This happens when an event with another trigger sets `lambdaVersion`. Remove `lambdaVersion` from that event. A `lambdaVersion` that the trigger doesn't accept, such as `V2_0` on `CustomEmailSender`, stops packaging with `Invalid lambdaVersion "V2_0" for "CustomEmailSender". Allowed: V1_0.`

## Related

- [Amazon Cognito user pool Lambda triggers](https://docs.aws.amazon.com/cognito/latest/developerguide/cognito-user-pools-working-with-lambda-triggers.html)
- [Cognito settings in the serverless.yml reference](../guide/serverless.yml.md#cognito)
- [IAM permissions for functions](../guide/iam.md)
