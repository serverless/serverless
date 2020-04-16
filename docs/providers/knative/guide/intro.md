<!--
title: Knative - Knative Guide - Introduction | Serverless Framework
menuText: Intro
menuOrder: 1
description: An introduction to using Knative with the Serverless Framework
layout: Doc
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/knative/guide/intro/)

<!-- DOCS-SITE-LINK:END -->

# Knative - Introduction

The Serverless Framework helps you develop and deploy your [Knative Serving](https://knative.dev/docs/serving) services, along with the [Knative Eventing](https://knative.dev/docs/eventing) configurations as event sources. It's a CLI that offers structure, automation and best practices out-of-the-box, allowing you to focus on building sophisticated, event-driven, serverless architectures, comprised of [functions](#functions) and [fvents](#events).

The Serverless Framework is different from other application frameworks because:

- It manages your code as well as your infrastructure
- It supports multiple languages (Node.js, Python, PHP, and more)

## Core Concepts

Here are the Framework's main concepts and how they pertain to Knative primitives.

### Functions

A Function is a [Knative Serving](https://knative.dev/docs/serving) service. It's an independent unit of deployment, like a microservice. It's merely code, deployed in the cloud, that is most often written to perform a single job such as:

- _Saving a user to the database_
- _Processing a file in a database_
- _Performing a scheduled task_

You can perform multiple jobs in your code, but we don't recommend doing that without good reason. Separation of concerns is best and the Framework is designed to help you easily develop and deploy functions, as well as manage lots of them.

### Events

Anything that triggers a [Knative Serving](https://knative.dev/docs/serving) service to execute is regarded by the Framework as an **Event**. Events are [Knative Eventing](https://knative.dev/docs/eventing) sources such as:

- _A Kafka event_
- _AWS SQS queue element_
- _A scheduled task (e.g., run every 5 minutes)_
- _And more..._

When you define an event for your functions in the Serverless Framework, the Framework will automatically create any infrastructure necessary for that event (e.g., a [Knative Trigger](https://knative.dev/docs/eventing/broker-trigger)) and configure your [Knative Serving](https://knative.dev/docs/serving) functions to listen to it.

### Resources

**Resources** are Knative infrastructure components which your Functions use such as:

- _A Kafka event source_
- _AWS SQS event source_
- _A scheduled task (e.g., run every 5 minutes)_
- _And more..._

### Services

A **Service** is the Framework's unit of organization. You can think of it as a project file, though you can have multiple services for a single application. It's where you define your Functions, the Events that trigger them, and the Resources your Functions use, all in one file entitled `serverless.yml` (or `serverless.json` or `serverless.js`). It looks like this:

```yaml
service: users

functions: # Your "Functions"
  functionOne:
    events: # The "Events" that trigger this function
      - kafka:
          consumerGroup: KAFKA_CONSUMER_GROUP_NAME
          bootstrapServers:
            - server1
            - server2
          topics:
            - my-topic
  functionTwo:
    events:
      - cron:
          schedule: '* * * * *'
          data: '{"message": "Hello world from a Cron event source!"}'
```

When you deploy with the Framework by running `serverless deploy`, everything in `serverless.yml` is deployed at once.

### Plugins

You can overwrite or extend the functionality of the Framework using **Plugins**. Every `serverless.yml` can contain a `plugins:` property, which features multiple plugins.

```yaml
plugins:
  - serverless-knative
  - serverless-secrets
```
