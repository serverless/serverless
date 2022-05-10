<!--
title: Serverless Framework Concepts
description: An introduction to using AWS and AWS Lambda with the Serverless Framework.
layout: Doc
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/aws/guide/intro)

<!-- DOCS-SITE-LINK:END -->

# Serverless Framework Concepts

The Serverless Framework helps you develop and deploy [AWS Lambda](https://serverless.com/aws-lambda/) functions, along with the AWS infrastructure resources they require. It's a CLI that offers structure, automation and best practices out-of-the-box, allowing you to focus on building sophisticated, event-driven, serverless architectures, comprised of [Functions](#functions) and [Events](#events).

The Serverless Framework is different from other application frameworks because:

- It manages your code as well as your infrastructure
- It supports multiple languages (Node.js, Python, Java, and more)

Here are the Framework's main concepts and how they pertain to AWS and Lambda.

## Functions

The code of a serverless application is deployed and executed in AWS Lambda functions.

Each function is an independent unit of execution and deployment, like a microservice. A function is merely code, deployed in the cloud, that is most often written to perform a single job such as:

- Saving a user to the database
- Processing a file in a database
- Performing a scheduled task

[Learn more on defining functions](./functions.md)

## Events

Functions are triggered by events. Events come from other AWS resources, for example:

- An HTTP request on an API Gateway URL (e.g. for a REST API)
- A new file uploaded in an S3 bucket (e.g. for an image upload)
- A CloudWatch schedule (e.g. run every 5 minutes)
- A message in an SNS topic
- A CloudWatch alert
- And more...

When you configure an event on a Lambda function, Serverless Framework will automatically create the infrastructure needed for that event (e.g. an API Gateway endpoint) and configure your functions to listen to it.

[Learn more on defining function events](./events.md)

## Resources

Resources are AWS infrastructure components which your functions use such as:

- A DynamoDB table (e.g. for saving users/posts/comments data)
- An S3 bucket (e.g. for saving images or files)
- An SNS topic (e.g. for sending messages asynchronously)
- Anything that can be defined in CloudFormation is supported by the Serverless Framework

Serverless Framework can deploy functions and their events, but also AWS resources.

[Learn more on defining AWS resources](./resources.md)

## Services

A service is the Framework's unit of organization. You can think of it as a project file, though you can have multiple services for a single application.

A service is configured via a `serverless.yml` file where you define your functions, events and AWS resources to deploy. It looks like this:

```yml
service: users

functions: # Your "Functions"
  usersCreate:
    events: # The "Events" that trigger this function
      - httpApi: 'POST /users/create'
  usersDelete:
    events:
      - httpApi: 'DELETE /users/delete'

resources: # The "Resources" your "Functions" use. Raw AWS CloudFormation goes in here.
```

When deploying with the Framework via `serverless deploy`, everything in the configuration file is deployed at once.

[Learn more on configuring a service](./services.md)

### Alternative configuration format

In case you need more flexibility, you can also define the service configuration in JSON (`serverless.json`), JavaScript (`serverless.js`) or TypeScript (`serverless.ts`).

While Serverless Framework is language-agnostic, projects written in Node.js can benefit from using the same language all around. When using JavaScript or TypeScript, the file must export the configuration as a JS object, for example:

```js
'use strict';

// serverless.js

module.exports = {
  service: 'users',
  functions: {
    usersCreate: {
      events: [
        {
          httpApi: 'POST /users/create',
        },
      ],
    },
    // ...
  },
  resources: {},
};
```

```ts
// Requiring @types/serverless in your project package.json
import type { Serverless } from 'serverless/aws';

// serverless.ts

const serverlessConfiguration: Serverless = {
  service: 'users',
  functions: {
    usersCreate: {
      events: [
        {
          httpApi: 'POST /users/create',
        },
      ],
    },
    // ...
  },
  resources: {},
};

module.exports = serverlessConfiguration;
```

Note: when deploying using a `serverless.ts` file, `ts-node` needs to be installed separately as a dev dependency.

For the sake of simplicity, most examples in the documentation refer to the `serverless.yml` format. However, all functionalities work with the other available service file formats.

### Plugins

You can overwrite or extend the functionality of the Framework using plugins. Every `serverless.yml` can contain a `plugins:` property, which features multiple plugins.

```yml
# serverless.yml

plugins:
  - serverless-offline
  - serverless-secrets
```

[Learn more about plugins](../../../guides/plugins)
