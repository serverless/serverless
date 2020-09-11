<!--
title: Knative - Knative Guide - Quick Start | Serverless Framework
menuText: Quick Start
menuOrder: 3
description: Get started with the Serverless Framework Knative provider integration in 5 minutes or less
layout: Doc
-->

# Quick Start

Complete the steps in this guide to install the Serverless Framework open-source CLI and deploy, invoke and remove a sample service on your Knative installation.

## Initial Setup

There are a few prerequisites you need to install and configure:

- [Install Node.js 8.x or later on your local machine](#install-nodejs-and-npm)
- [Install the Serverless Framework open-source CLI version 1.50.0 or later](#install-the-serverless-framework-open-source-cli)

If you already have these prerequisites setup you can skip ahead to deploy an example Service.

### Install Node.js and NPM

- Follow these [installation instructions](https://nodejs.org/en/download/).
- At the end, you should be able to run `node -v` from your command line and get a result like this...

```sh
$ node -v
vx.x.x
```

- You should also be able to run `npm -v` from your command line and should see...

```sh
$ npm -v
x.x.x
```

### Install the Serverless Framework open-source CLI

- Run this command in your terminal

```sh
npm install -g serverless
```

- After install is complete, you should be able to run `serverless -v` from your command line and get a result like this...

```sh
$ serverless -v
x.x.x
```

## Create and deploy a serverless Service

Now that you’ve completed your setup, let’s create and deploy a serverless Service.

### Create a new Service from a Template

1. Use the Serverless Framework open-source CLI to create a new Service with `knative-docker`template.

```sh
# Create a new Serverless service/project
$ serverless create --template knative-docker --path my-service
```

2. Install the dependencies

```sh
# Change into the newly created directory
$ cd my-service
$ npm install
```

### Set up Knative

[Install Knative](./installation.md) on your Kubernetes cluster.

### Set up the credentials

[Configure your Knative access](./credentials.md) to work with the Serverless Framework.

### Deploy the Service

Use this command to deploy your service for the first time and after you make changes to your functions or events in `serverless.yml` and want to deploy all changes within your service at the same time.

```bash
serverless deploy
```

More information in [deploy command](../cli-reference/deploy.md)

### Invoke your service's function

Invokes a Function and returns logs.

```bash
serverless invoke -f hello
```

More information in [invoke command](../cli-reference/invoke.md)

## Cleanup

### Remove your Service

If at any point you no longer need your service, you can run the following command to remove the functions and events that were created. This will delete the resources you created.

```sh
serverless remove
```
