<!--
title: Serverless Framework Documentation
menuText: Docs
layout: Doc
-->

# Serverless Documentation

The Serverless Framework allows you to easily build applications on [AWS Lambda](https://aws.amazon.com/lambda/).

Together, the Framework and these new compute services enable you to build more than ever, without having to operate complex infrastructure, and take advantage of Lambda's efficient pay-per-execution pricing.

Here are the main concepts behind the Serverless Framework...

## Concepts

### Functions

A Function is an independent unit of deployment, like a microservice.  It's merely code, deployed in the cloud, that is most often written to perform a single job, like:

* *Saving a user to the database*
* *Processing a file in a database*
* *Performing a scheduled task*

You can perform multiple jobs in your code, but we don't recommend it without good reason.  Separation of concerns is best.

The Framework allows you to easily develop and deploy Functions, and lots of them.

### Events

Anything that triggers a Function to execute is regarded by the Framework as an **Event**.  Events are infrastruture events on AWS, like:

* *An AWS API Gateway HTTP endpoint (e.g., for a REST API)*
* *An AWS S3 bucket upload (e.g., for an image)*
* *A CloudWatch timer (e.g., run every 5 minutes)*
* *An AWS SNS topic (e.g., a message)*
* *A CloudWatch Alert (e.g., something happened)*
* *[And more...](./events)*

The Framework allows you to easily define events to trigger your Functions, and deploy them together.

### Resources

**Resources** are AWS infrastructure components which your Functions use, like:

* *An AWS DynamoDB Table (e.g., for saving Users/Posts/Comments data)*
* *An AWS S3 Bucket (e.g., for saving images or files)*
* *An AWS SNS Topic (e.g., for sending messages asynchronously)*
* *Anything that can be defined in CloudFormation is supported by the Serverless Framework*

The Serverless Framework not only deploys your Functions and the Events that trigger them, but it also deploys the AWS infrastructure components your Functions depend upon.

### Services

A **Service** is the Framework's unit of organization.  It's where you define your Functions, the Events that trigger them, and the Resources your Functions use, all in one file entitled `serverless.yml`.  It looks like this:

```yml
// serverless.yml

service: users

functions: // Your "Functions"
  usersCreate:
    events: // The "Events" that trigger this function
      - http: post users/create
  usersCreate:
    events:
      - http: delete users/delete

resources: // The "Resources" your "Functions" use.  Raw AWS CloudFormation goes in here.
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
When you deploy with the Framework by running `serverless deploy`, everything in `serverless.yml` is deployed at once.

### Plugins

You can overwrite or extend the functionality of the Framework using **Plugins**.  Every `serverless.yml` can contain a `plugins:` property, which features multiple plugins.

```yml
// serverless.yml

plugins:
  - serverless-offline
  - serverless-secrets
```