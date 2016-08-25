---
title: Serverless Concepts
description: todo
layout: Page
---

# Concepts

Intro text

- Link to functions section
- Link to events section
- Link to resources section
- Link to services section
- Link to plugins section

# Serverless Functions

Functions are the unit of deployment in a serverless application

# Serverless Events

Serverless is used to build event driven architecture.

Basically everything which can trigger a function is an event.

Events could be HTTP requests, events fired from a cloud storage (like a S3 bucket), scheduled events, etc.

todo: add links to provider events

# Serverless Resources

todo


# Services

A *Serverless service* is a group of one or multiple functions and any resources they require. By grouping related
functions together, it's easier to share code and resources between those functions. Services are also designed to
be completely independent, which helps teams develop more quickly without waiting for others.

Each *Serverless service* contains two configuration files:

### [`serverless.yml`](./serverless-yml.md)
  - Declares a Serverless service
  - Defines one or multiple functions in the service
  - Defines the provider the service will be deployed to (and the runtime if provided)
  - Defines custom plugins to be used
  - Defines events that trigger each function to execute (e.g. HTTP requests)
  - Defines one set of resources (e.g. 1 AWS CloudFormation stack) required by the functions in this service
  - Events listed in the `events` section may automatically create the resources required for the event upon deployment

### [`serverless.env.yml`](./serverless-env-yml.md)
  - Defines stages for this service
  - Defines regions for each stage
  - Defines Serverless variables

## Example

Let's take a look at a service example to see how everything works together.

### Service Structure

```
users
  |__ lib                   // contains logic
  |__ users.js              // single handler file, requires lib
  |__ serverless.yml
  |__ serverless.env.yml
  |__ node_modules
  |__ package.json
```


# Serverless Plugins

Here you can read how to develop your own Serverless plugins. We'll get into details on how to write custom plugins to
extend the functionality of Serverless. Furthermore we'll look into the way how you can use your plugin knowledge
to integrate your own provider into the Serverless framework.

## Table of contents

- [Building plugins](building-plugins.md)
- [Building provider integrations](building-provider-integrations.md)
