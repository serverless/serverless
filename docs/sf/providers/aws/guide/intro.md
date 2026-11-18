<!--
title: Serverless Framework Concepts
description: 'The core concepts of the Serverless Framework on AWS: services, functions, events, resources, stages and plugins, and how they map to AWS.'
short_title: Serverless Framework Concepts
keywords:
  [
    'Serverless Framework',
    'AWS Lambda',
    'serverless.yml',
    'service',
    'stage',
    'event-driven architecture',
  ]
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/aws/guide/intro)

<!-- DOCS-SITE-LINK:END -->

# Serverless Framework Concepts

The Serverless Framework is a command-line tool that deploys AWS Lambda functions together with the events that trigger them and the AWS resources they use, from one configuration file per service. This page defines the concepts the rest of the docs use (service, function, event, resource, stage and plugin) and links to the page that covers each.

Here is a service that uses all of them:

```yaml
# serverless.yml
service: users # the service

provider:
  name: aws
  runtime: nodejs24.x
  stage: dev # the default stage

plugins: # plugins that extend the Framework
  - serverless-offline

functions: # the functions
  createUser:
    handler: handler.createUser
    events: # the events that trigger createUser
      - httpApi: 'POST /users'

resources: # other AWS resources, in CloudFormation syntax
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

`serverless deploy` deploys everything in the file at once.

## Services

A service is one `serverless.yml` and everything it deploys: functions, their events and other resources. It is the Framework's unit of deployment; an application is often several services, deployed together with [Serverless Compose](../../../guides/compose.md). See [Services](./services.md).

Besides `serverless.yml`, the configuration file can be `serverless.yaml`, `serverless.json`, `serverless.toml`, `serverless.js`, `serverless.mjs`, `serverless.cjs` or `serverless.ts`. A JavaScript or TypeScript file exports the configuration object, and the Framework loads `serverless.ts` without a separate TypeScript loader:

```javascript
// serverless.mjs
export default {
  service: 'users',
  provider: { name: 'aws', runtime: 'nodejs24.x' },
  functions: {
    createUser: {
      handler: 'handler.createUser',
      events: [{ httpApi: 'POST /users' }],
    },
  },
}
```

## Functions

A function is your code deployed as an AWS Lambda function, with its handler, runtime, memory, timeout, environment variables and permissions. Each function usually does one job, such as saving a user or resizing an image. See [Functions](./functions.md).

## Events

An event is what triggers a function: an HTTP request, a message on an SQS queue, a file uploaded to S3, a schedule. For each event in a function's `events` list, the Framework creates the event source or connects an existing one, and grants it permission to invoke the function. See [AWS Lambda events](./events.md) for every event type.

## Resources

Resources are the other AWS infrastructure your functions use, such as DynamoDB tables, S3 buckets or SNS topics. You declare them under `resources` in AWS CloudFormation syntax, and the Framework deploys them with the functions. See [AWS infrastructure resources](./resources.md).

## Stages

A stage is one deployed copy of a service, such as `dev`, `staging` or `prod`. Each stage is a separate AWS CloudFormation stack named `<service>-<stage>`, so each stage has its own functions and resources. Select the stage with `--stage` on the command line or `provider.stage` in `serverless.yml`; without either, the stage is `dev`. The region works the same way with `--region` and `provider.region`, and defaults to `us-east-1`. Use [parameters](../../../guides/parameters.md) for values that differ per stage, and see [deploying](./deploying.md) for how a stage is deployed.

## Plugins

A plugin adds commands or deployment behavior to the Framework, for example `serverless-offline` for running an HTTP API locally. List plugins under `plugins` in `serverless.yml` and install them with `serverless plugin install`. Python requirements, alerts and version pruning are built in and need no plugin. See [Plugins](../../../guides/plugins/README.md).
