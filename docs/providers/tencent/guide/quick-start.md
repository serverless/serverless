<!--
title: Tencent Cloud - Serverless Cloud Function (SCF) Guide - Quick Start | Serverless Framework
menuText: Quick Start
menuOrder: 2
description: Get started with Serverless Cloud Function (Tencent) in 5 minutes or less
layout: Doc
-->

# Quick Start

Complete the steps in this guide to install the Serverless Framework open-source CLI and deploy a sample Service on Tencent Cloud that reports deployment information and operational metrics to the Serverless Framework.

## Initial Setup

There are a few prerequisites you need to install and configure:

- [Install Node.js 6.x or later on your local machine](#install-nodejs-and-npm)
- [Install the Serverless Framework open-source CLI version 1.47.0 or later](#install-the-serverless-framework-open-source-cli)

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

1. Use the Serverless Framework open-source CLI to create a new Service with `tencent-nodejs`template.

````sh
# Create a new Serverless service/project
$ serverless create --template tencent-nodejs --path my-service

2. Install the dependencies

```sh
# Change into the newly created directory
$ cd my-service
$ npm install
````

### Set up the credentials

[Configure your Tencent Cloud account](./credentials.md) to work with the Serverless Framework.

### Set up an endpoint

An Event is anything that can trigger your serverless functions. In this case, you need to define a endpoint in your `serverless.yml` that will trigger your serverless function.

```yaml
service: my-service # service name

provider: # provider information
  name: tencent
  runtime: Nodejs8.9
  credentials: ~/credentials

plugins:
  - serverless-tencent-scf

functions:
  hello_world:
    handler: index.main_handler
    runtime: Nodejs8.9
    events:
      - apigw:
          name: hello_world_apigw
          parameters:
            stageName: release
            serviceId:
            integratedResponse: true
            httpMethod: ANY
```

### Deploy the Service

Use this command to deploy your service for the first time and after you make changes to your Functions, Events or Resources in `serverless.yml` and want to deploy all changes within your Service at the same time.

```bash
serverless deploy
```

More information in [deploy command](../cli-reference/deploy.md)

### Test your Service

Replace the URL in the following curl command with your returned endpoint URL, which you can find in the `sls deploy` output, to hit your URL endpoint.

```bash
$ curl -X POST https://service-xxxx-1300000000.ap-guangzhou.apigateway.myqcloud.com/release/
```

### Invoke your Service's function

Invokes a Function and returns logs.

```bash
serverless invoke -f hello_world
```

More information in [invoke command](../cli-reference/invoke.md)

### Fetch the Function Logs

Open up a separate tab in your console and stream all logs for a specific Function using this command.

```bash
serverless logs -f hello_world -t
```

## Cleanup

### Remove your Service

If at any point you no longer need your Service, you can run the following command to remove the Functions, Events and Resources that were created. This will delete the resources you created and ensure that you don't incur any unexpected charges.

```sh
serverless remove
```
