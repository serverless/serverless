<!--
title: Serverless Cloudformation Resource naming Reference
menuText: Cloudformation Resource Reference
layout: Doc
-->

# Cloudformation Resource Reference

To have consistent naming in the Cloudformation Templates that get deployed we've defined a standard name:

`{Function Name}{Cloud Formation Resource Type}{ResourceName}{SequentialID or Random String}`

* `Function Name` this is optional for Resources that should be recreated when the function name gets changed. Those resources are also called *function bound*
* `Cloud Formation Resource Type` e.g. S3Bucket
* `Resource Name` an identifier for the specific resource, e.g. for an S3 Bucket the configured bucket name.
* `SequentialID or Random String` For a few resources we need to add an optional sequential id or random string to identify them

All resource names that are deployed by Serverless have to follow this naming scheme. The only exception (for backwards compatibility reasons) is the S3 Bucket that is used to upload artifacts so they can be deployed to your function.

We're also using the term `normalizedName` or similar terms in this guide. This basically just means dropping any characters that aren't allowed in resources names, e.g. special characters.

| AWS Resource          |  Name Template                                          | Example                       |
|---                    |---                                                      | ---                           |
| S3::Bucket            | S3Bucket{normalizedBucketName}                          | S3BucketMybucket              |
|IAM::Role              | IamRoleLambdaExecution                                  | IamRoleLambdaExecution        |
|IAM::Policy            | IamPolicyLambdaExecution                                | IamPolicyLambdaExecution      |
|Lambda::Function       | {normalizedFunctionName}LambdaFunction                  | HelloLambdaFunction           |
|Lambda::Permission     | <ul><li>**Schedule**: {normalizedFunctionName}LambdaPermissionEventsRuleSchedule{index} </li><li>**S3**: {normalizedFunctionName}LambdaPermissionS3</li><li>**APIG**: {normalizedFunctionName}LambdaPermissionApiGateway</li><li>**SNS**: {normalizedFunctionName}LambdaPermission{normalizedTopicName}</li></ul> | <ul><li>**Schedule**: HelloLambdaPermissionEventsRuleSchedule1 </li><li>**S3**: HelloLambdaPermissionS3</li><li>**APIG**: HelloLambdaPermissionApiGateway</li><li>**SNS**: HelloLambdaPermissionSometopic</li></ul> |
|Events::Rule           | {normalizedFuntionName}EventsRuleSchedule{SequentialID} | HelloEventsRuleSchedule1      |
|ApiGateway::RestApi    | ApiGatewayRestApi                                       | ApiGatewayRestApi             |
|ApiGateway::Resource   | ApiGatewayResource{normalizedPath}                      | <ul><li>ApiGatewayResourceUsers</li><li>ApiGatewayResourceUsers**Var** for paths containing a variable</li><li>ApiGatewayResource**Dash** if the path is just a `-`</li></ul>       |
|ApiGateway::Method     | ApiGatewayResource{normalizedPath}{normalizedMethod}    | ApiGatewayResourceUsersGet    |
|ApiGateway::Authorizer | {normalizedFunctionName}ApiGatewayAuthorizer            | HelloApiGatewayAuthorizer     |
|ApiGateway::Deployment | ApiGatewayDeployment{randomNumber}                      | ApiGatewayDeployment12356789  |
|ApiGateway::ApiKey     | ApiGatewayApiKey{SequentialID}                          | ApiGatewayApiKey1             |
|SNS::Topic             | SNSTopic{normalizedTopicName}                           | SNSTopicSometopic             |
|AWS::Lambda::EventSourceMapping | <ul><li>**DynamoDB**: {normalizedFunctionName}EventSourceMappingDynamodb{SequentialID} </li><li>**Kinesis**: {normalizedFunctionName}EventSourceMappingKinesis{SequentialID} </li></ul> | <ul><li>**DynamoDB**: HelloLambdaEventSourceMappingDynamodb1 </li><li>**Kinesis**: HelloLambdaEventSourceMappingKinesis1 </li></ul> |
