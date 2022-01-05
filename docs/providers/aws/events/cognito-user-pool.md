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

## Custom message trigger handlers

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
