<!--
title: Serverless Framework Documentation
description: todo
layout: Page
-->

# Documentation

Welcome to the Serverless v1.0 documentation.

- [Quick Start](#quick-start)
- [Core Concepts](#concepts)
- [Plugins](#plugins)

## Quick start

Follow these simple steps to install the beta, create and deploy your first service, run your function and remove the service afterwards.

1. `npm install -g serverless`
2. `mkdir my-first-service && cd my-first-service`
3. `serverless create --template aws-nodejs`
4. `serverless deploy`
5. `serverless invoke --function hello`
6. `serverless remove`

## Provider Specific Setup
- [AWS Lambda Docs](./aws/)

## Concepts

Before we begin, let's run through some of the main concepts behind serverless.

[Functions](#functions), [Events](#events), [Resources](#resources), [Services](#services), and [Plugins](#plugins)

### Functions

Functions are the unit of deployment in a serverless application

### Events

Serverless is used to build event driven architecture.

Basically everything which can trigger a function is an event.

Events could be HTTP requests, events fired from a cloud storage (like a S3 bucket), scheduled events, etc.

todo: add links to provider events

### Resources

Resources are the different pieces that comprise your infrastructure

### Services

A *Serverless service* is a group of one or multiple functions and any resources they require. By grouping related functions together, it's easier to share code and resources between those functions. Services are also designed to be completely independent, which helps teams develop more quickly without waiting for others.

Each *Serverless service* contains a serverless.yml file:

### [`serverless.yml`](./serverless-yml.md)
  - Declares a Serverless service
  - Defines one or multiple functions in the service
  - Defines the provider the service will be deployed to
  - Defines custom plugins to be used
  - Defines events that trigger each function to execute
  - Defines one set of resources (e.g. 1 AWS CloudFormation stack) required by the functions in this service
  - Events listed in the `events` section may automatically create the resources required for the event upon deployment

### Plugins

Here you can read how to develop your own Serverless plugins. We'll get into details on how to write custom plugins to extend the functionality of Serverless. Furthermore we'll look into the way how you can use your plugin knowledge to integrate your own provider into the Serverless framework.

## Table of contents

- [Building plugins](./7_creating-plugins.md)
- [Building provider integrations](./8_creating-provider-plugins.md)

## How to contribute to Serverless

We love our community! Contributions are always welcomed!
Jump right into our [issues](https://github.com/serverless/serverless/issues) to join existing discussions or open up
new ones if you have a bug or want to improve Serverless.

Also feel free to open up [pull requests](https://github.com/serverless/serverless/pulls) which resolves issues!

You may also take a look at our [code of conduct](/code_of_conduct.md).

## Running in DEBUG mode
If you run into issues/errors while working with Serverless, we print a user-friendly error. However, when reporting bugs, it's often useful to output the stack trace and other important information. To set debug mode, make sure you set the environment variable `SLS_DEBUG` with the following command (if you're in Unix based system):

```
export SLS_DEBUG=*
```
