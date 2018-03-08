<!--
title: Serverless Framework - Auth0 Webtasks - Introduction
menuText: Intro
menuOrder: 1
description: An introduction to using Auth0 Webtasks with the Serverless Framework.
layout: Doc
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->
### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/webtasks/guide/intro)
<!-- DOCS-SITE-LINK:END -->

# Auth0 Webtasks - Introduction

The Serverless Framework helps you develop and deploy serverless applications using Auth0 Webtasks. The Serverless CLI offers structure, automation and best practices out-of-the-box. And with Auth0 Webtasks it's simple and easy to deploy code in just seconds.

**Note:** A local profile is required to use Auth0 Webtasks with the Serverless Framework. Follow the steps in the [Quick Start](quick-start.md) to get setup in less than a minute.

## Core Concepts

Here are the Framework's main concepts and how they pertain to Auth0 Webtasks...

### Services

A **Service** is the Framework's unit of organization. You can think of it as a project file, though you can have multiple services for a single application.  

The Auth0 Webtasks platform was designed to be simple and easy to use with minimal configuration. Therefore, services that uses Auth0 Webtasks are just a few lines of configuration in a single file, entitled `serverless.yml` (or `serverless.json` or `serverless.js`). It looks like this:

```yml
# serverless.yml

service: users

provider:
  name: webtasks

functions:
  user:
    handler: handler

plugins:
  - '@webtask/serverless-webtasks'
```

### Functions

A Function is an independent unit of deployment, like a microservice. It's merely code, deployed in the cloud, that is most often written to perform just a single job. When using Auth0 Webtasks, a Function is implemented as a webtask on the Auth0 Webtasks platform.

You can perform multiple jobs in your code, but we don't recommend doing that without good reason. Separation of concerns is best and the Framework is designed to help you easily develop and deploy Functions, as well as manage lots of them.

### Events

By default, a webtask is configured to respond to HTTP events. The Auth0 Webtasks platform also supports scheduled events, so that your code can be invoked at a regular interval.

### Plugins

You can overwrite or extend the functionality of the Serverless Framework using **Plugins**. Every `serverless.yml` can contain a `plugins:` property, which features multiple plugins. 

In fact, the Auth0 Webtasks provider is itself a plugin and needs to be specified in the `serverless.yml` file.

```yml
# serverless.yml

plugins:
  - '@webtask/serverless-webtasks'
```
