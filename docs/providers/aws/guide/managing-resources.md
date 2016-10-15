<!--
title: Managing Resources
menuText: Managing Resources
description: Managing infrastructure resources on AWS to use with your Functions
layout: Doc
-->

# Managing Resources

Half of the value of AWS Lambda and similar serverless services is you can easily access other infrastructure services on their respective providers, like AWS DynamoDB or AWS S3.

Fortunately, the Serverless Framework can provision infrastructure as well as code, and you can define the infrastructure you need in `serverless.yml`, and easily provision it.

If the `provider` of `serverless.yml` is set to `aws`, you can define infrastructure resources in a property titled `resources`.  What goes in this property is raw CloudFormation template syntax, in YAML, like this:

```yml
// serverless.yml

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

The way this works is every `serverless.yml` for AWS is a single AWS CloudFormation stack.  This is where your AWS Lambda functions and their event configurations are defined and it's how they are deployed.  When you add `resources` those resources are added into your CloudFormation stack upon `serverless deploy`.

You can overwrite/attach any kind of resource to your CloudFormation stack. You can add `Resources`, `Outputs` or even overwrite the `Description`. You can also use [Serverless Variables](./08-serverless-variables.md) for sensitive data or reusable configuration in your resources templates.  Please be cautious as overwriting existing parts of your CloudFormation stack might introduce unexpected behavior.