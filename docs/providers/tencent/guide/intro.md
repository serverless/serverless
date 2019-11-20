<!--
title: Tencent Cloud - Serverless Cloud Function (SCF) Guide - Introduction | Serverless Framework
menuText: Intro
menuOrder: 1
description: An introduction to using Tencent Cloud's Serverless Cloud Function (SCF) with the Serverless Framework.
layout: Doc
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/tencent/guide/intro/)

<!-- DOCS-SITE-LINK:END -->

# Tencent SCF - Introduction

The Serverless Framework helps you develop and deploy your Tencent SCF (Serverless Cloud Function), along with the Tencent infrastructure resources they require. It's a CLI that offers structure, automation and best practices out-of-the-box, allowing you to focus on building sophisticated, event-driven, serverless architectures, comprised of [Functions](#functions) and [Events](#events).

The Serverless Framework is different from other application frameworks because:

- It manages your code as well as your infrastructure
- It supports multiple languages (Node.js, Python, PHP, and more)

## Core Concepts

Here are the Framework's main concepts and how they pertain to Tencent Serverless Cloud Functions.

### Functions

A Function is an Tencent Serverless Cloud Function. It's an independent unit of deployment, like a microservice. It's merely code, deployed in the cloud, that is most often written to perform a single job such as:

- _Saving a user to the database_
- _Processing a file in a database_
- _Performing a scheduled task_

You can perform multiple jobs in your code, but we don't recommend doing that without good reason. Separation of concerns is best and the Framework is designed to help you easily develop and deploy Functions, as well as manage lots of them.

### Events

Anything that triggers an Tencent SCF to execute is regarded by the Framework as an **Event**. Events are infrastructure events on SCF such as:

- _An API Gateway HTTP endpoint request (e.g., for a REST API)_
- _A COS bucket upload (e.g., for an image)_
- _A scheduled task (e.g., run every 5 minutes)_
- _And more..._

When you define an event for your functions in the Serverless Framework, the Framework will automatically create any infrastructure necessary for that event (e.g., an API Gateway endpoint) and configure your SCF functions to listen to it.

### Resources

**Resources** are Tencent Cloud infrastructure components which your Functions use such as:

- _An API Gateway Service and API (e.g., for a REST API)_
- _A COS Bucket (e.g., for saving images or files)_
- _A Cloud Kafka Topic (e.g., for sending messages)_
- _And more..._

For scheduled task and API Gateway, The Serverless Framework not only deploys your Functions and the Events that trigger them, but it also deploys the Tencent Cloud infrastructure components your Functions depend upon.

### Services

A **Service** is the Framework's unit of organization. You can think of it as a project file, though you can have multiple services for a single application. It's where you define your Functions, the Events that trigger them, and the Resources your Functions use, all in one file entitled `serverless.yml` (or `serverless.json` or `serverless.js`). It looks like this:

```yml
# serverless.yml

service: users

functions: # Your "Functions"
  hello_world:
    events: # The "Events" that trigger this function
      - timer:
          name: timer
          parameters:
            cronExpression: '0 */1 * * *'
            enable: false
  function_two:
    events:
      - apigw:
          name: hello_world_apigw
          parameters:
            stageName: release
            httpMethod: ANY
```

When you deploy with the Framework by running `serverless deploy`, everything in `serverless.yml` is deployed at once.

### Plugins

You can overwrite or extend the functionality of the Framework using **Plugins**. Every `serverless.yml` can contain a `plugins:` property, which features multiple plugins.

```yml
# serverless.yml

plugins:
  - serverless-tencent-scf
  - serverless-secrets
```
