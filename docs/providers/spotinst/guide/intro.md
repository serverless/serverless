<!--
title: Serverless Framework - Spotinst Functions Guide - Introduction
menuText: Intro
menuOrder: 1
description: An introduction to using Spotinst Functions with the Serverless Framework.
layout: Doc
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/spotinst/guide/intro)

<!-- DOCS-SITE-LINK:END -->

# Spotinst - Introduction

Spotinst Functions is a Multi-Cloud Functions as a Service (FaaS) platform that utilizes affordable compute and network infrastructure.
Spotinst will take care of everything required to run and scale your code with high availability, advanced analytics and monitoring, and in low execution prices by finding the best available compute possible based on **Spot Pricing** across all cloud providers (Amazon Web Services, Microsoft Azure, Google Cloud, IBM Cloud, Oracle and even Bare-metal servers on Equinix).

When creating a `Function`, you can specify your desired `Cloud providers`, as well as the `geographical location` (for example `US East` or `Europe`). In addition you can defines triggers to execute the functions.

Using the Serverless Framework you can develop and deploy your Spotinst Functions easily through a CLI that offers structure, automation, and best practices out-of-the-box. This allows you to focus on building sophisticated, event-driven, serverless architectures, comprised of [Functions](#functions) and [Events](#events).

## Core Benefits of `Spotinst Functions`

1.  Multi-Cloud Deployments `(50+ Locations!)`
2.  50-80% Cost Reduction `(via Cloud Spot Prices)`
3.  Faster Execution time & Advanced Analytics

## Core Concepts

### Applications

An application is a logical frame that groups several Environments and Functions of the same business logic. Commonly, it stores environments and functions that belong to the same business application.
For example, "WebApplication" or "API"

### Environments

An Environment is a configuration group that contains multiple Functions. An environment contains metadata about the functions compute preference such as **Eligible Cloud Providers** and **compute geographical locations** (e.g us-east, us-west, Europe, APAC, etc..), as well as cost and performance strategies such as least-expensive, compute location or highest-performance locations (based on network and compute latency).

The functions underneath the environment share similar characteristics and are managed as a consolidated group to some extent.

For example, you can create several environments for your application's Dev and Prod functions of the same Application

![](<https://s3.amazonaws.com/spotinst-public/assets/IMG/sQ7iaNHCTXnhxSe_S4LlQpQ+(1).png>)

### Functions

A Function is an [Spotinst Function](https://help.spotinst.com/hc/en-us/articles/115004143245-Function). It's an independent unit of deployment, like a microservice. It's merely code, deployed in the cloud, that is most often written to perform a specific job.

You can perform multiple jobs in your code, but we don't recommend doing that without good reason. Separation of concerns is best and the Framework is designed to help you easily develop and deploy Functions, as well as manage lots of them.

### Events

Anything that triggers an [Spotinst Function](https://help.spotinst.com/hc/en-us/articles/115004143245-Function) to execute is regarded by the Framework as an **Event** (in Spotinst Functions they called Triggers). Events platform events such as:

- _An HTTP Trigger (e.g., for a REST API)_
- _A scheduled Cron event (e.g., run every 5 minutes)_
- _And more..._

### Function Template

```node
# handler.js
module.exports.main = function main (event, context, callback) {
    callback(null, {
    statusCode: 200,
    body: '{"hello":"from NodeJS8.3 function"}',
    headers: {"Content-Type": "application/json"}
  });
};
```

### Services

A **Service** is the Framework's unit of organization. You can think of it as a project file, though you can have multiple services for a single application. It's where you define your Functions, the Events that trigger them, and the Resources your Functions use, all in one file by default entitled `serverless.yml` (or `serverless.json` or `serverless.js`). It looks like this:

```yml
service: spotinst-nodejs # NOTE: update this with your service name

provider:
  name: spotinst
  spotinst:
    #environment: <env-XXXX> # NOTE: Remember to add the Spotinst Environment ID

functions:
  hello:
    runtime: nodejs8.3
    handler: handler.main
    memory: 128
    timeout: 30
#    access: private
#    cron:  # Setup scheduled trigger with cron expression
#      active: true
#      value: '* * * * *'
#    environmentVariables:
#      key: value
```

When you deploy with the Framework by running `serverless deploy`, everything in `serverless.yml` (or the file specified with the `--config` option) is deployed at once.

### Plugins

You can overwrite or extend the functionality of the Framework using **Plugins**. Every `serverless.yml` can contain a `plugins:` property, which features multiple plugins. Please include the **serverless-spotinst-functions** as part of your plugins in the serverless.yml file.

```yml
plugins:
  - serverless-spotinst-functions
```
