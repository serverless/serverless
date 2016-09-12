<!--
title: Serverless Framework Documentation
layout: Doc
-->

# Serverless Documentation

Welcome to the Serverless documentation.

- [Quick Start Guide](./01-guide/README.md)
- [Core Concepts](#concepts)
- [CLI Reference](./03-cli-reference/README.md)
- [Providers](#providers)
- [Extending Serverless](./04-extending-serverless/README.md)
- [Contributing to Serverless](#contributing)

## Providers
- [AWS Integration Docs](./02-providers/aws/README.md)

## Concepts

Before we begin, let's run through some of the main concepts behind serverless.

* [Functions](#functions)
* [Events](#events)
* [Resources](#resources)
* [Services](#services)
* [Plugins](#plugins)

### Functions

Functions are the essential part for any serverless infrastructure. Several functions together form a service. A service typically solves one particular problem in your infrastructure.

### Events

Serverless is used to build event driven architecture. Basically everything which can trigger a function is an event.

Events could be HTTP requests, events fired from a cloud storage (like a S3 bucket), scheduled events, etc.

- [AWS Events](./02-providers/aws/events/README.md)

### Resources

Resources are the different pieces that comprise your infrastructure like databases, storage buckets, API Gateways or other resources your provider lets you configure.

### Services

A *Serverless service* is a group of one or multiple functions and any resources they require. By grouping related functions together, it's easier to share code and resources between those functions. Services are also designed to be completely independent, which helps teams develop more quickly without waiting for others.

### Plugins

Here you can read how to develop your own Serverless plugins. We'll get into details on how to write custom plugins to extend the functionality of Serverless. Furthermore we'll look into the way how you can use your plugin knowledge to integrate your own provider into the Serverless framework.

- [Building plugins](./04-extending-serverless/README.md)

Connect with the community on [gitter](https://gitter.im/serverless/serverless) or in the [Forum](http://forum.serverless.com)

## Contributing
We love our contributors! Please read our [Contributing Document](../CONTRIBUTING.md) to learn how you can start working on the Framework yourself.

Check out our [help-wanted](https://github.com/serverless/serverless/labels/help-wanted) or [help-wanted-easy](https://github.com/serverless/serverless/labels/help-wanted-easy) labels to find issues we want to move forward on with your help.

## Usage Tracking

[Anonymous Usage Tracking](./usage-tracking.md)