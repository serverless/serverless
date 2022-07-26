<!--
title: Serverless Framework - AWS Lambda Events - Cognito User Pool
menuText: Cognito User Pool
menuOrder: 17
description:  Setting up AWS Cognito User Pool Triggers with AWS Lambda via the Serverless Framework
layout: Doc
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/aws/events/cognito-user-pool)

<!-- DOCS-SITE-LINK:END -->

# Cognito User Pool

## Valid Triggers

Serverless supports all Cognito User Pool Triggers as specified [here][aws-triggers-list]. Use [this guide][aws-triggers-guide] to understand
the event objects that will be passed to your function.

## Simple event definition

This will create a Cognito User Pool with the specified name. You can reference the same pool multiple times.

```yml
functions:
  preSignUp:
    handler: preSignUp.handler
    events:
      - cognitoUserPool:
          pool: MyUserPool
          trigger: PreSignUp
  customMessage:
    handler: customMessage.handler
    events:
      - cognitoUserPool:
          pool: MyUserPool
          trigger: CustomMessage
```

## Multiple pools event definitions

This will create multiple Cognito User Pools with their specified names:

```yml
functions:
  preSignUpForPool1:
    handler: preSignUp.handler
    events:
      - cognitoUserPool:
          pool: MyUserPool1
          trigger: PreSignUp
  preSignUpForPool2:
    handler: preSignUp.handler
    events:
      - cognitoUserPool:
          pool: MyUserPool2
          trigger: PreSignUp
```

You can also deploy the same function for different user pools:

```yml
functions:
  preSignUp:
    handler: preSignUp.handler
    events:
      - cognitoUserPool:
          pool: MyUserPool1
          trigger: PreSignUp
      - cognitoUserPool:
          pool: MyUserPool2
          trigger: PreSignUp
```

## Special Trigger Considerations

### Custom Sender Triggers

There are two types of Custom Sender Triggers, `CustomSMSSender` and `CustomEmailSender`, both [documented by AWS](https://docs.aws.amazon.com/cognito/latest/developerguide/user-pool-lambda-custom-sender-triggers.html).

In order to use these triggers, you must supply a `kmsKeyId` and (optionally) the `lambdaVersion` of the function. Only 1 `kmsKeyId` can be supplied per Cognito User Pool.

```yml
functions:
  customSMSSenderFunction:
    handler: customSMSSender.handler
    events:
      - cognitoUserPool:
          pool: MyUserPool1
          trigger: CustomSMSSender
          # Required with CustomSMSSender and CustomEmailSender Triggers
          # Can either be KMS Key ARN string or reference to KMS Key Resource ARN (see customEmailSenderFunction below)
          kmsKeyId: 'arn:aws:kms:eu-west-1:111111111111:key/12345678-9abc-def0-1234-56789abcdef1'
  customEmailSenderFunction:
    handler: customEmailSender.handler
    events:
      - cognitoUserPool:
          pool: MyUserPool2
          trigger: CustomEmailSender
          kmsKeyId:
            Fn::GetAtt: ['kmsKey', 'Arn']

resources:
  Resources:
    # Used to show use in supplying kmsKeyId in customEmailSenderFunction, not needed when kmsKeyId is a string as shown in customSMSSenderFunction
    kmsKey:
      Type: AWS::KMS::Key
      Properties:
        Description: MyKMSKey
        Enabled: true
        KeyPolicy:
          Version: '2012-10-17'
          Id: my-kms-key
          Statement:
            Sid: Enable IAM User Permissions
            Principal:
              AWS:
                - Fn::Sub: arn:aws:iam::${AWS::AccountId}:root
            Effect: Allow
            Action: kms:*
            Resource: '*'

    # Used to show how CustomSenderSources can be used with overriding the generated User Pool, as described below
    # This makes it such that when a user signs up, they are automatically sent a verification email, triggering our
    # CustomEmailSender
    CognitoUserPoolMyUserPool2:
      Type: AWS::Cognito::UserPool
      Properties:
        UsernameAttributes:
          - 'email'
        AutoVerifiedAttributes:
          - 'email'
        EmailVerificationMessage: 'email message: {####}'
        EmailVerificationSubject: 'email subject: {####}'
```

**NOTE:** The only supported value for lambdaVersion is `V1_0`, as documented [by AWS](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-properties-cognito-userpool-customsmssender.html).

### Custom Sender Triggers Handlers

For custom senders, the `event.triggerSource` type does not get populated by the type of custom sender, rather may be populated by another trigger source. Instead, `event.request.type` is populated with either `customEmailSenderRequestV1` or `customSMSSenderRequestV1`, respectively documented by AWS [here](https://docs.aws.amazon.com/cognito/latest/developerguide/user-pool-lambda-custom-email-sender.html) and [here](https://docs.aws.amazon.com/cognito/latest/developerguide/user-pool-lambda-custom-sms-sender.html)

```js
// customSender.js
function handler(event, context, callback) {
  if (event.request.type === 'customEmailSenderRequestV1') {
    // ...
  }
  if (event.request.type === 'customSMSSenderRequestV1') {
    // ...
  }
}
```

### Custom Message Trigger Handlers

For custom messages, you will need to check `event.triggerSource` type inside your handler function:

```js
// customMessage.js
function handler(event, context, callback) {
  if (event.triggerSource === 'CustomMessage_AdminCreateUser') {
    // ...
  }
  if (event.triggerSource === 'CustomMessage_ResendCode') {
    // ...
  }
}
```

## Using existing pools

Sometimes you might want to attach Lambda functions to existing Cognito User Pools. In that case you just need to set the `existing` event configuration property to `true`. All the other config parameters can also be used on existing user pools:

**IMPORTANT:** You can only attach 1 existing Cognito User Pool per function.

**NOTE:** Using the `existing` config will add an additional Lambda function and IAM Role to your stack. The Lambda function backs-up the Custom Cognito User Pool Resource which is used to support existing user pools.

```yaml
functions:
  users:
    handler: users.handler
    events:
      - cognitoUserPool:
          pool: legacy-user-pool
          trigger: CustomMessage
          existing: true
```

## Overriding a generated User Pool

A Cognito User Pool created by an event can be overridden by using the [logical resource name](../guide/resources.md#aws-cloudformation-resource-reference) in `Resources`:

```yml
functions:
  preSignUp:
    handler: preSignUpForPool1.handler
    events:
      - cognitoUserPool:
          pool: MyUserPool
          trigger: PreSignUp
  postConfirmation:
    handler: postConfirmation.handler
    events:
      - cognitoUserPool:
          pool: MyUserPool
          trigger: PostConfirmation

resources:
  Resources:
    CognitoUserPoolMyUserPool:
      Type: AWS::Cognito::UserPool
```

## Forcing deploying of triggers

A Cognito User Pool with triggers attached may not be correctly updated by AWS Cloudformation on subsequent deployments. To circumvent this issue you can use the `forceDeploy` flag which will try to force Cloudformation to update the triggers no matter what. This flag has to be used in conjuction with the `existing: true` flag.

```yml
functions:
  preSignUp:
    handler: preSignUp.handler
    events:
      - cognitoUserPool:
          pool: MyUserPool1
          trigger: PreSignUp
          existing: true
          forceDeploy: true
```

[aws-triggers-guide]: http://docs.aws.amazon.com/cognito/latest/developerguide/cognito-user-identity-pools-working-with-aws-lambda-triggers.html
[aws-triggers-list]: https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-properties-cognito-userpool-lambdaconfig.html
