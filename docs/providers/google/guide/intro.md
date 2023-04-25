<!--
title: Serverless Framework - Google Cloud Functions Guide - Introduction
menuText: Intro
menuOrder: 1
description: An introduction to using Google Cloud Functions the Serverless Framework.
layout: Doc
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/google/guide/intro)

<!-- DOCS-SITE-LINK:END -->

# Google - Introduction

The Serverless Framework helps you develop and deploy serverless applications using Google Cloud Functions. It's a CLI that offers structure, automation and best practices out-of-the-box, allowing you to focus on building sophisticated, event-driven, serverless architectures, comprised of [Functions](#functions) and [Events](#events).

The Serverless Framework is different than other application frameworks because:

- It manages your code as well as your infrastructure
- It supports multiple languages (Node.js, Python, Java, and more)

**Note: Google Cloud support is currently experimental and may not yet be appropriate for production usage.**

## Core Concepts

Here are the Framework's main concepts and how they pertain to Google Cloud Functions...

### Functions

A Function is a [Google Cloud Function](https://cloud.google.com/functions/). It's an independent unit of deployment, like a microservice. It's merely code, deployed in the cloud, that is most often written to perform a single job such as:

- _Saving a user to the database_
- _Processing a file in a database_
- _Performing a scheduled task_

You can perform multiple jobs in your code, but we don't recommend doing that without good reason. Separation of concerns is best and the Framework is designed to help you easily develop and deploy Functions, as well as manage lots of them.

### Events

Anything that triggers a Google Cloud Function to execute is regarded by the Framework as an **Event**. Events are platform events on Google Cloud Functions such as:

- _An HTTP Trigger (e.g., for a REST API)_
- _A pubSub event (e.g., run function when message is sent to topic)_
- _A Storage event (e.g., Image uploaded into bucket)_
- _And more..._

When you define an event for your Google Cloud Function in the Serverless Framework, the Framework will automatically translate the event with its function into a corresponding [deployment resource](https://cloud.google.com/deployment-manager/docs/configuration/supported-resource-types). This way the event is configured so that your functions can listen to it.

### Services

A **Service** is the Framework's unit of organization. You can think of it as a project file, though you can have multiple services for a single application. It's where you define your Functions, the Events that trigger them, and the Resources your Functions use, all in one file by default entitled `serverless.yml` (or `serverless.json` or `serverless.js`). It looks like this:

```yml
# serverless.yml

service: users

functions: # Your "Functions"
  usersCreate:
    events: # The "Events" that trigger this function
      - http: create
```

When you deploy with the Framework by running `serverless deploy`, everything in `serverless.yml` (or the file specified with the `--config` option) is deployed at once.

### Plugins

You can overwrite or extend the functionality of the Framework using **Plugins**. Every `serverless.yml` can contain a `plugins:` property, which features multiple plugins.

```yml
# serverless.yml

plugins:
  - serverless-plugin-identifier
  - serverless-another-plugin
```
