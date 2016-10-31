<!--
title: Serverless Framework - AWS Lambda Guide - AWS Infrastructure Resources
menuText: Resources
menuOrder: 7
description: How to deploy and manage AWS infrastructure to use with your AWS Lambda functions with the Serverless Framework
layout: Doc
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->
### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/aws/guide/resources)
<!-- DOCS-SITE-LINK:END -->

# Resources

If you are using AWS as a provider for your Service, all *Resources* are other AWS infrastructure resources which the AWS Lambda functions in your *Service* depend on, like AWS DynamoDB or AWS S3.

Using the Serverless Framework, you can define the infrastructure resources you need in `serverless.yml`, and easily deploy them.

## Configuration

Every `serverless.yml` using the `aws` provider is a single AWS CloudFormation stack.  This is where your AWS Lambda functions and their event configurations are defined and it's how they are deployed.  When you add `resources` those resources are added into your CloudFormation stack upon `serverless deploy`.

Define your AWS resources in a property titled `resources`.  What goes in this property is raw CloudFormation template syntax, in YAML, like this:

```yml
# serverless.yml

service: usersCrud
provider: aws
functions:

resources:  // CloudFormation template syntax
  Resources:
    usersTable:
      Type: AWS::DynamoDB::Table
      Properties:
        TableName: usersTable
        AttributeDefinitions:
          - AttributeName: email
            AttributeType: S
        KeySchema:
          - AttributeName: email
            KeyType: HASH
        ProvisionedThroughput:
          ReadCapacityUnits: 1
          WriteCapacityUnits: 1
```

You can overwrite/attach any kind of resource to your CloudFormation stack. You can add `Resources`, `Outputs` or even overwrite the `Description`. You can also use [Serverless Variables](./variables.md) for sensitive data or reusable configuration in your resources templates.  Please be cautious as overwriting existing parts of your CloudFormation stack might introduce unexpected behavior.

## AWS CloudFormation Resource Reference

To have consistent naming in the Cloudformation Templates that get deployed we use a standard pattern:

`{Function Name}{Cloud Formation Resource Type}{ResourceName}{SequentialID or Random String}`

* `Function Name` - This is optional for Resources that should be recreated when the function name gets changed. Those resources are also called *function bound*
* `Cloud Formation Resource Type` - E.g., S3Bucket
* `Resource Name` - An identifier for the specific resource, e.g. for an S3 Bucket the configured bucket name.
* `SequentialID or Random String` - For a few resources we need to add an optional sequential id or random string to identify them

All resource names that are deployed by Serverless have to follow this naming scheme. The only exception (for backwards compatibility reasons) is the S3 Bucket that is used to upload artifacts so they can be deployed to your function.

We're also using the term `normalizedName` or similar terms in this guide. This means dropping any characters that aren't allowed in resources names, e.g. special characters.

| AWS Resource          |  Name Template                                          | Example                       |
|---                    |---                                                      | ---                           |
| S3::Bucket            | S3Bucket{normalizedBucketName}                          | S3BucketMybucket              |
|IAM::Role              | IamRoleLambdaExecution                                  | IamRoleLambdaExecution        |
|IAM::Policy            | IamPolicyLambdaExecution                                | IamPolicyLambdaExecution      |
|Lambda::Function       | {normalizedFunctionName}LambdaFunction                  | HelloLambdaFunction           |
|Lambda::Permission     | <ul><li>**Schedule**: {normalizedFunctionName}LambdaPermissionEventsRuleSchedule{index} </li><li>**S3**: {normalizedFunctionName}LambdaPermissionS3</li><li>**APIG**: {normalizedFunctionName}LambdaPermissionApiGateway</li><li>**SNS**: {normalizedFunctionName}LambdaPermission{normalizedTopicName}</li> | <ul><li>**Schedule**: HelloLambdaPermissionEventsRuleSchedule1 </li><li>**S3**: HelloLambdaPermissionS3</li><li>**APIG**: HelloLambdaPermissionApiGateway</li><li>**SNS**: HelloLambdaPermissionSometopic</li> |
|Events::Rule           | {normalizedFuntionName}EventsRuleSchedule{SequentialID} | HelloEventsRuleSchedule1      |
|ApiGateway::RestApi    | ApiGatewayRestApi                                       | ApiGatewayRestApi             |
|ApiGateway::Resource   | ApiGatewayResource{normalizedPath}                      | ApiGatewayResourceUsers       |
|ApiGateway::Method     | ApiGatewayResource{normalizedPath}{normalizedMethod}    | ApiGatewayResourceUsersGet    |
|ApiGateway::Authorizer | {normalizedFunctionName}ApiGatewayAuthorizer            | HelloApiGatewayAuthorizer     |
|ApiGateway::Deployment | ApiGatewayDeployment{randomNumber}                      | ApiGatewayDeployment12356789  |
|ApiGateway::ApiKey     | ApiGatewayApiKey{SequentialID}                          | ApiGatewayApiKey1             |
|SNS::Topic             | SNSTopic{normalizedTopicName}                           | SNSTopicSometopic             |
|AWS::Lambda::EventSourceMapping | <ul><li>**DynamoDB:** {normalizedFunctionName}EventSourceMappingDynamodb{tableName}</li><li>**Kinesis:** {normalizedFunctionName}EventSourceMappingKinesis{streamName}</li></ul> | <ul><li>**DynamoDB:** HelloLambdaEventSourceMappingDynamodbUsers</li><li>**Kinesis:** HelloLambdaEventSourceMappingKinesisMystream</li></ul> |
