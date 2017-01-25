<!--
title: Serverless Framework - AWS Lambda Guide - Functions
menuText: Functions
menuOrder: 5
description: How to configure AWS Lambda functions in the Serverless Framework
layout: Doc
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->
### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/aws/guide/functions)
<!-- DOCS-SITE-LINK:END -->

# Functions

If you are using AWS as a provider, all *functions* inside the service are AWS Lambda functions.

## Configuration

All of the Lambda functions in your serverless service can be found in `serverless.yml` under the `functions` property.

```yml
# serverless.yml
service: myService

provider:
  name: aws
  runtime: nodejs4.3
  memorySize: 512 # optional, default is 1024
  timeout: 10 # optional, default is 6

functions:
  hello:
    handler: handler.hello # required, handler set in AWS Lambda
    name: ${self:provider.stage}-lambdaName # optional, Deployed Lambda name
    description: Description of what the lambda function does # optional, Description to publish to AWS
    runtime: python2.7 # optional overwrite, default is provider runtime
    memorySize: 512 # optional, default is 1024
    timeout: 10 # optional, default is 6
```

The `handler` property points to the file and module containing the code you want to run in your function.

```javascript
// handler.js
module.exports.functionOne = function(event, context, callback) {}
```

You can add as many functions as you want within this property.

```yml
# serverless.yml

service: myService

provider:
  name: aws
  runtime: nodejs4.3

functions:
  functionOne:
    handler: handler.functionOne
    description: optional description for your Lambda
  functionTwo:
    handler: handler.functionTwo
  functionThree:
    handler: handler.functionThree
```

Your functions can either inherit their settings from the `provider` property.

```yml
# serverless.yml
service: myService

provider:
  name: aws
  runtime: nodejs4.3
  memorySize: 512 # will be inherited by all functions

functions:
  functionOne:
    handler: handler.functionOne
```

Or you can specify properties at the function level.

```yml
# serverless.yml
service: myService

provider:
  name: aws
  runtime: nodejs4.3

functions:
  functionOne:
    handler: handler.functionOne
    memorySize: 512 # function specific
```

## Permissions

Every AWS Lambda function needs permission to interact with other AWS infrastructure resources within your account.  These permissions are set via an AWS IAM Role.  You can set permission policy statements within this role via the `provider.iamRoleStatements` property.

```yml
# serverless.yml
service: myService

provider:
  name: aws
  runtime: nodejs4.3
  iamRoleStatements: # permissions for all of your functions can be set here
    - Effect: Allow
      Action: # Gives permission to DynamoDB tables in a specific region
        - dynamodb:DescribeTable
        - dynamodb:Query
        - dynamodb:Scan
        - dynamodb:GetItem
        - dynamodb:PutItem
        - dynamodb:UpdateItem
        - dynamodb:DeleteItem
      Resource: "arn:aws:dynamodb:us-east-1:*:*"

functions:
  functionOne:
    handler: handler.functionOne
    memorySize: 512
```

Another example:

```yml
# serverless.yml
service: myService
provider:
  name: aws
  iamRoleStatements:
      -  Effect: "Allow"
         Action:
           - "s3:ListBucket"
         Resource: { "Fn::Join" : ["", ["arn:aws:s3:::", { "Ref" : "ServerlessDeploymentBucket"} ] ] } # You can put CloudFormation syntax in here.  No one will judge you.  Remember, this all gets translated to CloudFormation.
      -  Effect: "Allow"
         Action:
           - "s3:PutObject"
         Resource:
           Fn::Join:
             - ""
             - - "arn:aws:s3:::"
               - "Ref" : "ServerlessDeploymentBucket"

functions:
  functionOne:
    handler: handler.functionOne
    memorySize: 512
```

You can also use an existing IAM role by adding your IAM Role ARN in the `role` property. For example:

```yml
# serverless.yml
service: new-service
provider:
  name: aws
  role: arn:aws:iam::YourAccountNumber:role/YourIamRole
```

See the documentation about [IAM](./iam.md) for function level IAM roles.

## VPC Configuration

You can add VPC configuration to a specific function in `serverless.yml` by adding a `vpc` object property in the function configuration. This object should contain the `securityGroupIds` and `subnetIds` array properties needed to construct VPC for this function. Here's an example configuration:

```yml
# serverless.yml
service: service-name
provider: aws

functions:
  hello:
    handler: handler.hello
    vpc:
      securityGroupIds:
        - securityGroupId1
        - securityGroupId2
      subnetIds:
        - subnetId1
        - subnetId2
```

Or if you want to apply VPC configuration to all functions in your service, you can add the configuration to the higher level `provider` object, and overwrite these service level config at the function level. For example:

```yml
# serverless.yml
service: service-name
provider:
  name: aws
  vpc:
    securityGroupIds:
      - securityGroupId1
      - securityGroupId2
    subnetIds:
      - subnetId1
      - subnetId2

functions:
  hello: # this function will overwrite the service level vpc config above
    handler: handler.hello
    vpc:
      securityGroupIds:
        - securityGroupId1
        - securityGroupId2
      subnetIds:
        - subnetId1
        - subnetId2
  users: # this function will inherit the service level vpc config above
    handler: handler.users
```

Then, when you run `serverless deploy`, VPC configuration will be deployed along with your lambda function.

## Environment Variables

You can add Environment Variable configuration to a specific function in `serverless.yml` by adding an `environment` object property in the function configuration. This object should contain a key/value collection of string:

```yml
# serverless.yml
service: service-name
provider: aws

functions:
  hello:
    handler: handler.hello
    environment:
      TABLE_NAME: tableName
```

Or if you want to apply Environment Variable configuration to all functions in your service, you can add the configuration to the higher level `provider` object. Environment Variable configured at the function level are overwriting the ones defined at the service level. For example:

```yml
# serverless.yml
service: service-name
provider:
  name: aws
  environment:
    TABLE_NAME: tableName1

functions:
  hello: # this function will INHERIT the service level environment config above
    handler: handler.hello
  users: # this function will OVERWRITE the service level environment config above
    handler: handler.users
    environment:
      TABLE_NAME: tableName2
```

## Log Group Resources

By default, the framework does not create LogGroups for your Lambdas. However this behavior will be deprecated soon and we'll be adding CloudFormation LogGroups resources as part of the stack. This makes it easy to clean up your log groups in the case you remove your service, and make the lambda IAM permissions much more specific and secure.

To opt in for this feature now to avoid breaking changes later, add the following to your provider config in serverless.yml:

```yml
provider:
  cfLogs: true
```

If you get a CloudFormation error saying that log group already exists, you have to remove it first from AWS console, then deploy, otherwise for new services this should work out of the box.
