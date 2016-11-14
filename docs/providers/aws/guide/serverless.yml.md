<!--
title: Serverless Framework - AWS Lambda Guide - Serverless.yml Reference
menuText: Serverless.yml
menuOrder: 16
description: A list of all available properties on serverless.yml for AWS
layout: Doc
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->
### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/aws/guide/serverless.yml)
<!-- DOCS-SITE-LINK:END -->

# Serverless.yml Reference

Here is a list of all available properties in `serverless.yml` when the provider is set to `aws`.

```yml
# serverless.yml

service: myService

frameworkVersion: ">=1.0.0 <2.0.0"

provider:
  name: aws
  runtime: nodejs4.3
  stage: dev # Set the default stage used. Default is dev
  region: us-east-1 # Overwrite the default region used. Default is us-east-1
  profile: production # The default profile to use with this service
  memorySize: 512 # Overwrite the default memory size. Default is 1024
  timeout: 10 # The default is 6
  deploymentBucket: com.serverless.${self:provider.region}.deploys # Overwrite the default deployment bucket
  apiKeys: # List of API keys to be used by your service API Gateway REST API
    - myFirstKey
    - ${opt:stage}-myFirstKey
    - ${env:MY_API_KEY} # you can hide it in a serverless variable
  stackTags: # Optional CF stack tags
   key: value
  stackPolicy: # Optional CF stack policy. The example below allows updates to all resources except deleting/replacing EC2 instances (use with caution!)
    - Effect: Allow
      Principal: "*"
      Action: "Update:*"
      Resource: "*"
    - Effect: Deny
      Principal: "*"
      Action:
        - Update:Replace
        - Update:Delete
      Condition:
        StringEquals:
          ResourceType:
            - AWS::EC2::Instance

functions:
  usersCreate: # A Function
    handler: users.create # The file and module for this specific function.
    memorySize: 512 # memorySize for this specific function.
    timeout: 10 # Timeout for this specific function.  Overrides the default set above.
    events: # The Events that trigger this Function
      - http: # This creates an API Gateway HTTP endpoint which can be used to trigger this function.  Learn more in "events/apigateway"
          path: users/create # Path for this endpoint
          method: get # HTTP method for this endpoint
          cors: true # Turn on CORS for this endpoint, but don't forget to return the right header in your response
          private: true # Requires clients to add API keys values in the `x-api-key` header of their request
          authorizer: # An AWS API Gateway custom authorizer function
            name: authorizerFunc # The name of the authorizer function (must be in this service)
            arn:  xxx:xxx:Lambda-Name # Can be used instead of name to reference a function outside of service
            resultTtlInSeconds: 0
            identitySource: method.request.header.Authorization
            identityValidationExpression: someRegex
      - s3:
          bucket: photos
          event: s3:ObjectCreated:*
          rules:
            - prefix: uploads/
            - suffix: .jpg
      - schedule:
          rate: rate(10 minutes)
          enabled: false
          input:
            key1: value1
            key2: value2
            stageParams:
              stage: dev
      - sns:
          topicName: aggregate
          displayName: Data aggregation pipeline
      - stream:
          arn: arn:aws:kinesis:region:XXXXXX:stream/foo
          batchSize: 100
          startingPosition: LATEST
          enabled: false

# The "Resources" your "Functions" use.  Raw AWS CloudFormation goes in here.
resources:
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
