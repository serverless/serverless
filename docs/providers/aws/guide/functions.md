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

If you are using AWS as a provider for your *Service*, all *Functions* are AWS Lambda functions.

## Configuration

All of the AWS Lambda functions in your serverless service can be found in `serverless.yml` under the `functions` property.

```yml
# serverless.yml

service: myService

provider:
  name: aws
  runtime: nodejs4.3

functions:
  functionOne:
    handler: handler.functionOne
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
  memorySize: 512 # inherited value

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

You can also use an existing IAM role by adding your IAM Role ARN in the `iamRoleARN` property. For example:

```yml
# serverless.yml

service: new-service
provider:
  name: aws
  iamRoleARN: arn:aws:iam::YourAccountNumber:role/YourIamRole
```

Support for separate IAM Roles per function is coming soon.

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

We're working on great Environment Variable support. Until then, you'll be able to use the following tools for different languages to set environment variables and make them available to your code.

## Javascript

You can use [dotenv](https://www.npmjs.com/package/dotenv) to load files with environment variables. Those variables can be set during your CI process or locally and then packaged and deployed together with your function code.

## Python

You can use [python-dotenv](https://github.com/theskumar/python-dotenv) to load files with environment variables. Those variables can be set during your CI process or locally and then packaged and deployed together with your function code.

## Java

For Java the easiest way to set up environment like configuration is through [property files](https://docs.oracle.com/javase/tutorial/essential/environment/properties.html). While those will not be available as environment variables they are very commonly used configuration mechanisms throughout Java.

## Log Group Resources

By default, the framework does not create LogGroups for your Lambdas. However this behavior will be deprecated soon and we'll be adding CloudFormation LogGroups resources as part of the stack. This makes it easy to clean up your log groups in the case you remove your service, and make the lambda IAM permissions much more specific and secure.

To opt in for this feature now to avoid breaking changes later, add the following to your provider config in serverless.yml:

```
provider:
  cfLogs: true
```

If you get a CloudFormation error saying that log group already exists, you have to remove it first from AWS console, then deploy, otherwise for new services this should work out of the box.
