<!--
title: Serverless Framework Documentation
description: todo
layout: Page
-->

# Serverless Documentation

Welcome to the Serverless v1.0 documentation.

- [Quick Start](#quick-start)
- [Core Concepts](#concepts)
- [Plugins](#plugins)

## Quick start

- [AWS Quick Start](./aws/README.md#quick-start)

## Provider Specific Setup
- [AWS Lambda Docs](./aws/)
- [Azure Functions docs](./azure/)
- [OpenWhisk docs](./openwhisk/)
- [Google Cloud Function docs](./google/)

## Concepts

Before we begin, let's run through some of the main concepts behind serverless.

[Functions](#functions), [Events](#events), [Resources](#resources), [Services](#services), and [Plugins](#plugins)

### Functions

Functions are the unit of deployment in a serverless application

### Events

Serverless is used to build event driven architecture.

Basically everything which can trigger a function is an event.

Events could be HTTP requests, events fired from a cloud storage (like a S3 bucket), scheduled events, etc.

- [AWS Events](./aws/events.md)

### Resources

Resources are the different pieces that comprise your infrastructure

- [AWS Resources](TODO NEED DOC)

### Services

A *Serverless service* is a group of one or multiple functions and any resources they require. By grouping related functions together, it's easier to share code and resources between those functions. Services are also designed to be completely independent, which helps teams develop more quickly without waiting for others.

### Plugins

Here you can read how to develop your own Serverless plugins. We'll get into details on how to write custom plugins to extend the functionality of Serverless. Furthermore we'll look into the way how you can use your plugin knowledge to integrate your own provider into the Serverless framework.

- [Building plugins](./core/plugins)
- [Building provider integrations](./core/plugins)

## How to contribute to Serverless

We love our community! Contributions are always welcomed!
Jump right into our [issues](https://github.com/serverless/serverless/issues) to join existing discussions or open up
new ones if you have a bug or want to improve Serverless.

Also feel free to open up [pull requests](https://github.com/serverless/serverless/pulls) which resolves issues!

You may also take a look at our [code of conduct](/code_of_conduct.md).
