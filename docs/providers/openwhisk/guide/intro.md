<!--
title: Serverless Framework - Apache OpenWhisk Guide - Introduction
menuText: Intro
menuOrder: 1
description: An introduction to using Apache OpenWhisk with the Serverless Framework.
layout: Doc
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/openwhisk/guide/intro)

<!-- DOCS-SITE-LINK:END -->

# OpenWhisk - Introduction

The Serverless Framework helps you develop and deploy serverless applications using Apache OpenWhisk. It's a CLI that offers structure, automation and best practices out-of-the-box, allowing you to focus on building sophisticated, event-driven, serverless architectures, comprised of [Functions](#functions) and [Events](#events).

The Serverless Framework is different than other application frameworks because:

- It manages your code as well as your infrastructure
- It supports multiple languages (Node.js, Python, PHP, Ruby, Swift, Java, and more)

## Core Concepts

Here are the Framework's main concepts and how they pertain to Apache OpenWhisk…

### Functions

A Function is an [Apache OpenWhisk Action](http://bit.ly/2wMfe3s). It's an independent unit of deployment, like a microservice. It's merely code, deployed in the cloud, that is most often written to perform a single job such as:

- _Saving a user to the database_
- _Processing a file in a database_
- _Performing a scheduled task_

You can perform multiple jobs in your code, but we don't recommend doing that without good reason. Separation of concerns is best and the Framework is designed to help you easily develop and deploy Functions, as well as manage lots of them.

### Events

Anything that triggers an Apache OpenWhisk Action to execute is regarded by the Framework as an **Event**. Events are platform events on Apache OpenWhisk such as:

- _An API Gateway HTTP endpoint (e.g., for a REST API)_
- _A NoSQL database update (e.g., for a user profile)_
- _A scheduled timer (e.g., run every 5 minutes)_
- _A Kafka queue message (e.g., a message)_
- _A Webhook fires (e.g., Github project update)_
- _And more..._

When you define an event for your Apache OpenWhisk Action in the Serverless Framework, the Framework will automatically translate this into [Triggers and Rules](http://bit.ly/2xQmFE8) needed for that event and configure your functions to listen to it.

### Services

A **Service** is the Framework's unit of organization. You can think of it as a project file, though you can have multiple services for a single application. It's where you define your Functions, the Events that trigger them, and the Resources your Functions use, all in one file by default entitled `serverless.yml` (or `serverless.json` or `serverless.js`). It looks like this:

```yml
# serverless.yml

service: users

functions: # Your "Functions"
  usersCreate:
    events: # The "Events" that trigger this function
      - http: post /users/create
  usersDelete:
    events:
      - http: delete /users/delete
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
