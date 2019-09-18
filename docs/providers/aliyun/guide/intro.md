<!--
title: Serverless Framework - Alibaba Cloud Function Compute Guide - Introduction
menuText: Intro
menuOrder: 1
description: An introduction to using Alibaba Cloud Function Compute the Serverless Framework.
layout: Doc
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/aliyun/guide/intro)

<!-- DOCS-SITE-LINK:END -->

# Alibaba Cloud - Introduction

The Serverless Framework helps you develop and deploy serverless applications using Alibaba Cloud Function Compute. It's a CLI that offers structure, automation and best practices out-of-the-box, allowing you to focus on building sophisticated, event-driven, serverless architectures, comprised of [Functions](#functions) and [Events](#events).

The Serverless Framework is different than other application frameworks because:

- It manages your code as well as your infrastructure
- It supports multiple languages (Node.js, Python, Java, and more)

## Core Concepts

Here are the Framework's main concepts and how they pertain to Alibaba Cloud Function Compute...

### Functions

A Function is an [Alibaba Cloud Function Compute Function](https://serverless.aliyun.com). It's an independent unit of deployment, like a microservice. It's merely code, deployed in the cloud, that is most often written to perform a single job such as:

- _Saving a user to the database_
- _Processing a file in a database_

You can perform multiple jobs in your code, but we don't recommend doing that without good reason. Separation of concerns is best and the Framework is designed to help you easily develop and deploy Functions, as well as manage lots of them.

### Events

Anything that triggers a Alibaba Cloud Function Compute to execute is regarded by the Framework as an **Event**. Events are platform events on Alibaba Cloud Function Compute such as:

- _An HTTP Trigger (e.g., for a REST API)_
- _An OSS event (e.g., Image uploaded into bucket)_
- _And more..._

When you define an event for your Alibaba Cloud Function Compute in the Serverless Framework, the Framework will automatically translate the event with its function into corresponding cloud resources. This way the event is configured so that your functions can listen to it.

### Services

A **Service** is the Framework's unit of organization. You can think of it as a project file, though you can have multiple services for a single application. It's where you define your Functions, the Events that trigger them, and the Resources your Functions use, all in one file entitled `serverless.yml` (or `serverless.json`). It looks like this:

```yml
# serverless.yml

service: users

functions: # Your "Functions"
  usersCreate:
    events: # The "Events" that trigger this function
      - http: create
```

When you deploy with the Framework by running `serverless deploy`, everything in `serverless.yml` is deployed at once.

### Plugins

You can overwrite or extend the functionality of the Framework using **Plugins**. Every `serverless.yml` can contain a `plugins:` property, which features multiple plugins.

```yml
# serverless.yml

plugins:
  - serverless-plugin-identifier
  - serverless-another-plugin
```
