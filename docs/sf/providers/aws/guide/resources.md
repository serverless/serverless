<!--
title: AWS Infrastructure Resources
description: Add DynamoDB tables, S3 buckets and other CloudFormation resources to a service, and change the resources the Framework generates.
short_title: AWS Infrastructure Resources
keywords:
  [
    'Serverless Framework',
    'AWS CloudFormation resources',
    'serverless.yml resources',
    'DynamoDB table',
    'resources extensions',
    'logical ID',
  ]
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/aws/guide/resources)

<!-- DOCS-SITE-LINK:END -->

# AWS Infrastructure Resources

The `resources` block of `serverless.yml` adds AWS infrastructure that your functions use, such as Amazon DynamoDB tables, S3 buckets and SNS topics, to your service. Its content is AWS CloudFormation template syntax, which the Framework merges into the CloudFormation stack it generates for each stage, so `serverless deploy` creates and updates these resources with your functions and `serverless remove` deletes them. Use `resources.extensions` to change a resource the Framework generates.

To add a DynamoDB table and give a function its name and permission to write to it, add:

```yaml
# serverless.yml
service: users

provider:
  name: aws
  runtime: nodejs24.x
  iam:
    role:
      statements:
        - Effect: Allow
          Action:
            - dynamodb:PutItem
          Resource:
            Fn::GetAtt: [UsersTable, Arn]

functions:
  createUser:
    handler: handler.createUser
    environment:
      USERS_TABLE:
        Ref: UsersTable

resources:
  Resources:
    UsersTable:
      Type: AWS::DynamoDB::Table
      Properties:
        AttributeDefinitions:
          - AttributeName: email
            AttributeType: S
        KeySchema:
          - AttributeName: email
            KeyType: HASH
        BillingMode: PAY_PER_REQUEST
```

`UsersTable` is the resource's logical ID. `Ref` returns the table name and `Fn::GetAtt` its ARN; each resource type's page in the [CloudFormation resource and property reference](https://docs.aws.amazon.com/AWSCloudFormation/latest/TemplateReference/aws-template-resource-type-ref.html) lists what `Ref` and `Fn::GetAtt` return. Without a `TableName`, CloudFormation generates a unique name, so the table can exist in several stages of the same account.

**Warning:** Removing a resource from `resources`, or running `serverless remove`, deletes it with its data, unless the resource sets `DeletionPolicy: Retain`.

## Template sections in resources

The `resources` block accepts the sections of a [CloudFormation template](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/template-anatomy.html), plus `extensions`:

- `Resources`: resources to add. Each needs `Type`, and can set `Properties`, `DependsOn` (a list of logical IDs), `Condition`, `CreationPolicy`, `DeletionPolicy`, `Metadata`, `UpdatePolicy` and `UpdateReplacePolicy`. `Fn::Transform` and `Fn::ForEach` entries are accepted too.
- `Outputs`: stack outputs.
- `Conditions`, `Mappings` and `Parameters`.
- `AWSTemplateFormatVersion`, `Description`, `Metadata` and `Transform` (a list of macro names).
- `extensions`: changes to generated resources; see [Override AWS CloudFormation resource](#override-aws-cloudformation-resource).

Values can use [Serverless Framework variables](../../../guides/variables/README.md), for example `${sls:stage}` in a name or `${ssm:/path/to/value}` for configuration kept outside the file. CloudFormation intrinsic functions (`Ref`, `Fn::GetAtt`, `Fn::Sub`, `Fn::ImportValue` and others) pass through to CloudFormation unchanged, in their long or short (`!Ref`) form.

## Stack outputs

To expose a value from the stack, add it to `resources.Outputs`:

```yaml
resources:
  Outputs:
    UsersTableArn:
      Value:
        Fn::GetAtt: [UsersTable, Arn]
      Export:
        Name: ${self:service}-${sls:stage}-UsersTableArn
```

Another service can read the output with the [`${cf:...}` variable](../../../guides/variables/aws/cf-stack.md), with or without `Export`. Other CloudFormation stacks read it with `Fn::ImportValue` and the export name; the Framework exports the outputs it generates itself as `sls-<service>-<stage>-<output name>`, but not the outputs in `resources.Outputs`, so set `Export` on those.

## Resources with the same logical ID as generated ones

A resource in `resources.Resources` with the same logical ID as a resource the Framework generates is deep-merged into the generated one: your keys are added and win over the generated values at any depth, and lists are merged by position. To change a generated resource on purpose, use `resources.extensions`, which also reports an error when the logical ID doesn't exist.

## Remove a property with null

CloudFormation has no way to unset a property, so the Framework removes every property set to `null`, at any depth under a resource's `Properties`, from the final template. Use it to drop a property that the Framework or a merge adds:

```yaml
resources:
  extensions:
    HelloLambdaFunction:
      Properties:
        ReservedConcurrentExecutions: null
```

## AWS CloudFormation resource reference

To reference or extend a resource the Framework generates, you need its logical ID. Logical IDs follow this pattern:

`{Function Name}{CloudFormation Resource Type}{Resource Name}{Sequential ID, instance ID or random string}`

- `Function Name`: for resources tied to one function, the normalized function name. These resources are replaced when the function is renamed.
- `CloudFormation Resource Type`: for example `S3Bucket`.
- `Resource Name`: an identifier of the resource, for example the bucket name.
- `Sequential ID, instance ID or random string`: added where several resources would otherwise share an ID. The instance ID is `${sls:instanceId}`.

Normalizing removes characters that logical IDs don't allow and capitalizes the first letter. In function names, `-` becomes `Dash` and `_` becomes `Underscore`, so `write-post` is `WriteDashPost`. In API Gateway paths, each path part is capitalized and a path parameter gets `Var`: `POST /users/{user_id}` gives the resource `ApiGatewayResourceUsersUseridVar` and the method `ApiGatewayMethodUsersUseridVarPost`.

To see every logical ID in your service, run `serverless package` and open `.serverless/cloudformation-template-update-stack.json`.

The following table lists the logical IDs of common generated resources, for a function named `hello`:

| AWS resource                                                                       | Logical ID                                                                                 | Example                                                       |
| ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------- |
| `AWS::Lambda::Function`                                                            | `{normalizedFunctionName}LambdaFunction`                                                   | `HelloLambdaFunction`                                         |
| `AWS::Lambda::Version`                                                             | `{normalizedFunctionName}LambdaVersion{sha256}`                                            | `HelloLambdaVersionr3pgoTvv1xT4E4NiCL6JG02fl6vIyi7OS1aW0FwAI` |
| `AWS::Lambda::Url`                                                                 | `{normalizedFunctionName}LambdaFunctionUrl`                                                | `HelloLambdaFunctionUrl`                                      |
| `AWS::Logs::LogGroup`                                                              | `{normalizedFunctionName}LogGroup`, with `IA` appended for the Infrequent Access log class | `HelloLogGroup`                                               |
| `AWS::IAM::Role`                                                                   | `IamRoleLambdaExecution`                                                                   | `IamRoleLambdaExecution`                                      |
| `AWS::S3::Bucket` (`s3` event)                                                     | `S3Bucket{normalizedBucketName}`                                                           | `S3BucketMybucket`                                            |
| `AWS::SNS::Topic` (`sns` event)                                                    | `SNSTopic{normalizedTopicName}`                                                            | `SNSTopicSometopic`                                           |
| `AWS::SNS::Subscription` (existing topic `arn`, `filterPolicy` or `redrivePolicy`) | `{normalizedFunctionName}SnsSubscription{normalizedTopicName}`                             | `HelloSnsSubscriptionSometopic`                               |
| `AWS::Lambda::EventSourceMapping` (SQS)                                            | `{normalizedFunctionName}EventSourceMappingSQS{normalizedQueueName}`                       | `HelloEventSourceMappingSQSMyqueue`                           |
| `AWS::Lambda::EventSourceMapping` (DynamoDB)                                       | `{normalizedFunctionName}EventSourceMappingDynamodb{normalizedStreamName}`                 | `HelloEventSourceMappingDynamodbUsers`                        |
| `AWS::Lambda::EventSourceMapping` (Kinesis)                                        | `{normalizedFunctionName}EventSourceMappingKinesis{normalizedStreamName}`                  | `HelloEventSourceMappingKinesisMystream`                      |
| `AWS::Events::Rule` (`schedule`)                                                   | `{normalizedFunctionName}EventsRuleSchedule{SequentialID}`                                 | `HelloEventsRuleSchedule1`                                    |
| `AWS::Events::Rule` (`cloudwatchEvent`)                                            | `{normalizedFunctionName}EventsRuleCloudWatchEvent{SequentialID}`                          | `HelloEventsRuleCloudWatchEvent1`                             |
| `AWS::Logs::SubscriptionFilter`                                                    | `{normalizedFunctionName}LogsSubscriptionFilterCloudWatchLog{SequentialID}`                | `HelloLogsSubscriptionFilterCloudWatchLog1`                   |
| `AWS::IoT::TopicRule`                                                              | `{normalizedFunctionName}IotTopicRule{SequentialID}`                                       | `HelloIotTopicRule1`                                          |
| `AWS::Cognito::UserPool`                                                           | `CognitoUserPool{normalizedPoolId}`                                                        | `CognitoUserPoolMyPool`                                       |
| `AWS::ApiGatewayV2::Api` (HTTP API)                                                | `HttpApi`                                                                                  | `HttpApi`                                                     |
| `AWS::ApiGatewayV2::Stage`                                                         | `HttpApiStage`                                                                             | `HttpApiStage`                                                |
| `AWS::ApiGatewayV2::Integration`                                                   | `HttpApiIntegration{normalizedFunctionName}`                                               | `HttpApiIntegrationHello`                                     |
| `AWS::ApiGatewayV2::Route`                                                         | `HttpApiRoute{normalizedRouteKey}`; `HttpApiRouteDefault` for `*`                          | `HttpApiRouteGetUsers`                                        |
| `AWS::ApiGateway::RestApi`                                                         | `ApiGatewayRestApi`                                                                        | `ApiGatewayRestApi`                                           |
| `AWS::ApiGateway::Resource`                                                        | `ApiGatewayResource{normalizedPath}`                                                       | `ApiGatewayResourceUsers`                                     |
| `AWS::ApiGateway::Method`                                                          | `ApiGatewayMethod{normalizedPath}{normalizedMethod}`                                       | `ApiGatewayMethodUsersGet`                                    |
| `AWS::ApiGateway::Authorizer`                                                      | `{normalizedFunctionName}ApiGatewayAuthorizer`                                             | `HelloApiGatewayAuthorizer`                                   |
| `AWS::ApiGateway::Deployment`                                                      | `ApiGatewayDeployment{instanceId}`                                                         | `ApiGatewayDeployment12356789`                                |
| `AWS::ApiGateway::ApiKey`                                                          | `ApiGatewayApiKey{OptionalNormalizedName}{SequentialID}`                                   | `ApiGatewayApiKeyFree1`                                       |
| `AWS::ApiGateway::UsagePlan`                                                       | `ApiGatewayUsagePlan{OptionalNormalizedName}`                                              | `ApiGatewayUsagePlanFree`                                     |
| `AWS::ApiGateway::UsagePlanKey`                                                    | `ApiGatewayUsagePlanKey{OptionalNormalizedName}{SequentialID}`                             | `ApiGatewayUsagePlanKeyFree1`                                 |

For an `sns` event on a topic the service creates, without `filterPolicy` or `redrivePolicy`, the subscription is part of the `SNSTopic{normalizedTopicName}` resource (its `Subscription` property), not a separate resource. A REST API stage has no resource of its own: the Framework sets the stage name on the `ApiGatewayDeployment{instanceId}` resource and applies stage settings with the API Gateway API during the deployment.

The deployment bucket (`ServerlessDeploymentBucket`) is the one resource that doesn't follow the pattern.

The `AWS::Lambda::Permission` resources that let an event source invoke a function are named per event:

| Event             | Logical ID                                                                                              | Example                                                                |
| ----------------- | ------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `httpApi`         | `{normalizedFunctionName}LambdaPermissionHttpApi`                                                       | `HelloLambdaPermissionHttpApi`                                         |
| `http` (REST API) | `{normalizedFunctionName}LambdaPermissionApiGateway`                                                    | `HelloLambdaPermissionApiGateway`                                      |
| `s3`              | `{normalizedFunctionName}LambdaPermission{normalizedBucketName}S3`                                      | `HelloLambdaPermissionBucketS3`                                        |
| `sns`             | `{normalizedFunctionName}LambdaPermission{normalizedTopicName}SNS`                                      | `HelloLambdaPermissionTopicSNS`                                        |
| `schedule`        | `{normalizedFunctionName}LambdaPermissionEventsRuleSchedule{index}`                                     | `HelloLambdaPermissionEventsRuleSchedule1`                             |
| `cloudwatchEvent` | `{normalizedFunctionName}LambdaPermissionEventsRuleCloudWatchEvent{index}`                              | `HelloLambdaPermissionEventsRuleCloudWatchEvent1`                      |
| `cloudwatchLog`   | `{normalizedFunctionName}LambdaPermissionLogsSubscriptionFilterCloudWatchLog`                           | `HelloLambdaPermissionLogsSubscriptionFilterCloudWatchLog`             |
| `iot`             | `{normalizedFunctionName}LambdaPermissionIotTopicRule{index}`                                           | `HelloLambdaPermissionIotTopicRule1`                                   |
| `alexaSkill`      | `{normalizedFunctionName}LambdaPermissionAlexaSkill{index}`                                             | `HelloLambdaPermissionAlexaSkill1`                                     |
| `alexaSmartHome`  | `{normalizedFunctionName}LambdaPermissionAlexaSmartHome{index}`                                         | `HelloLambdaPermissionAlexaSmartHome1`                                 |
| `cognitoUserPool` | `{normalizedFunctionName}LambdaPermissionCognitoUserPool{normalizedPoolId}TriggerSource{triggerSource}` | `HelloLambdaPermissionCognitoUserPoolMyPoolTriggerSourceCustomMessage` |

## Override AWS CloudFormation resource

To change a resource the Framework generates, add its logical ID under `resources.extensions` with the attributes to change. For example, to keep the `write-post` function's logs for 30 days:

```yaml
functions:
  write-post:
    handler: handler.writePost
    events:
      - httpApi: 'POST /api/posts/new'

resources:
  extensions:
    WriteDashPostLogGroup:
      Properties:
        RetentionInDays: 30
```

Each attribute is applied as follows:

| Attribute             | Operation                                                                                         |
| --------------------- | ------------------------------------------------------------------------------------------------- |
| `Condition`           | Replaced by the extension value.                                                                  |
| `CreationPolicy`      | Replaced by the extension value.                                                                  |
| `DeletionPolicy`      | Replaced by the extension value.                                                                  |
| `DependsOn`           | Merged: the extension's list is added to the resource's `DependsOn`.                              |
| `Metadata`            | Merged one level deep: a key in the extension replaces the resource's key of the same name.       |
| `Properties`          | Merged one level deep: a property in the extension replaces the resource's property of that name. |
| `UpdatePolicy`        | Replaced by the extension value.                                                                  |
| `UpdateReplacePolicy` | Replaced by the extension value.                                                                  |
| Any other attribute   | Not supported: packaging stops with an error.                                                     |

Because `Properties` merges one level deep, an extension that sets `Environment` replaces the function's whole `Environment` property. Extensions apply only to the `Resources` section. An extension whose logical ID isn't in the generated template stops packaging with:

```text
Cannot extend "WriteDashPostLogGroup" resource, as it's not found in generated stack
```

## Related

- [CloudFormation resource and property reference](https://docs.aws.amazon.com/AWSCloudFormation/latest/TemplateReference/aws-template-resource-type-ref.html)
- [IAM permissions for functions](./iam.md) for granting functions access to these resources
- [`serverless.yml` reference](./serverless.yml.md) for every `resources` key
