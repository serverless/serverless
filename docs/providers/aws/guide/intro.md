<!--
title: Serverless Framework - AWS Lambda Guide - Introduction
menuText: Intro
menuOrder: 1
description: An introduction to using AWS and AWS Lambda with the Serverless Framework.
layout: Doc
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/aws/guide/intro)

<!-- DOCS-SITE-LINK:END -->

# AWS - Introduction

The Serverless Framework helps you develop and deploy your [AWS Lambda](https://serverless.com/aws-lambda/) functions, along with the AWS infrastructure resources they require. It's a CLI that offers structure, automation and best practices out-of-the-box, allowing you to focus on building sophisticated, event-driven, serverless architectures, comprised of [Functions](#functions) and [Events](#events).

The Serverless Framework is different from other application frameworks because:

- It manages your code as well as your infrastructure
- It supports multiple languages (Node.js, Python, Java, and more)

## Core Concepts

Here are the Framework's main concepts and how they pertain to AWS and Lambda...

### Functions

A Function is an AWS Lambda function. It's an independent unit of deployment, like a microservice. It's merely code, deployed in the cloud, that is most often written to perform a single job such as:

- _Saving a user to the database_
- _Processing a file in a database_
- _Performing a scheduled task_

You can perform multiple jobs in your code, but we don't recommend doing that without good reason. Separation of concerns is best and the Framework is designed to help you easily develop and deploy Functions, as well as manage lots of them.

### Events

Anything that triggers an AWS Lambda Function to execute is regarded by the Framework as an **Event**. Events are infrastructure events on AWS such as:

- _An AWS API Gateway HTTP endpoint request (e.g., for a REST API)_
- _An AWS S3 bucket upload (e.g., for an image)_
- _A CloudWatch timer (e.g., run every 5 minutes)_
- _An AWS SNS topic (e.g., a message)_
- _A CloudWatch Alert (e.g., something happened)_
- _And more..._

When you define an event for your AWS Lambda functions in the Serverless Framework, the Framework will automatically create any infrastructure necessary for that event (e.g., an API Gateway endpoint) and configure your AWS Lambda Functions to listen to it.

### Resources

**Resources** are AWS infrastructure components which your Functions use such as:

- _An AWS DynamoDB Table (e.g., for saving Users/Posts/Comments data)_
- _An AWS S3 Bucket (e.g., for saving images or files)_
- _An AWS SNS Topic (e.g., for sending messages asynchronously)_
- _Anything that can be defined in CloudFormation is supported by the Serverless Framework_

The Serverless Framework not only deploys your Functions and the Events that trigger them, but it also deploys the AWS infrastructure components your Functions depend upon.

### Services

A **Service** is the Framework's unit of organization. You can think of it as a project file, though you can have multiple services for a single application. It's where you define your Functions, the Events that trigger them, and the Resources your Functions use. A service can be described in YAML or JSON format, using respectively a file named `serverless.yml` or `serverless.json` at the root directory of the project. It looks like this:

_serverless.yml_

```yml
service: users

functions: # Your "Functions"
  usersCreate:
    events: # The "Events" that trigger this function
      - httpApi: 'POST /users/create'
  usersDelete:
    events:
      - httpApi: 'DELETE /users/delete'

resources: # The "Resources" your "Functions" use.  Raw AWS CloudFormation goes in here.
```

_serverless.json_

```json
{
  "service": "users",
  "functions": {
    "usersCreate": {
      "events": [
        {
          "httpApi": "POST /users/create"
        }
      ]
    },
    "usersDelete": {
      "events": [
        {
          "httpApi": "DELETE /users/delete"
        }
      ]
    }
  },
  "resources": {}
}
```

The Framework also handles natively exporting JSON object from a Javascript file `serverless.js` or from a Typescript file `serverless.ts` at the root directory of the project. While the Framework is language-agnostic, projects written in Node.js will highly benefit from using the same language for the service definition file. Such service file looks like this:

_serverless.js_

```js
'use strict';

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
    usersDelete: {
      events: [
        {
          httpApi: 'DELETE /users/delete',
        },
      ],
    },
  },
  resources: {},
};
```

_serverless.ts_

```ts
// Requiring @types/serverless in your project package.json
import type { Serverless } from 'serverless/aws';

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
    usersDelete: {
      events: [
        {
          httpApi: 'DELETE /users/delete',
        },
      ],
    },
  },
  resources: {},
};

module.exports = serverlessConfiguration;
```

> If deploying using a serverless.ts file, ts-node needs to be installed separately as a dev dependency.

When you deploy with the Framework by running `serverless deploy`, everything in the service configuration file is deployed at once.

> For the sake of simplicity, most code snippet detailed in this documentation only refer to the `serverless.yml` YAML service file format. However, all functionalities work as well in the other available service file formats.

### Plugins

You can overwrite or extend the functionality of the Framework using **Plugins**. Every `serverless.yml` can contain a `plugins:` property, which features multiple plugins.

```yml
# serverless.yml

plugins:
  - serverless-offline
  - serverless-secrets
```

Read more about plugins in the [Plugin documentation](../../../guides/plugins).
