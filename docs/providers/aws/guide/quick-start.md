<!--
title: Serverless Framework - AWS Lambda Guide - Quick Start
menuText: Quick Start
menuOrder: 1
description: Getting started with the Serverless Framework on AWS Lambda
layout: Doc
-->

# Quick Start

Complete the steps in this guide to install the Serverless Framework open-source CLI and deploy a sample Service on AWS that reports deployment information and operational metrics to the Serverless Framework Dashboard.

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

Use the Serverless Framework open-source CLI to create a new Service.

```sh
# Create a new Serverless service/project
$ serverless

# Change into the newly created directory
$ cd your-service-name
```

The `serverless` command will guide you through creating a new Node or Python Service, [configuring your AWS Account](https://serverless.com/framework/docs/providers/aws/guide/credentials/) to work with the Serverless Framework, and setting up a free Serverless Framework Dashboard account so you can monitor, troubleshoot, and test your new service.

Looking to get started with something other than Node or Python? No problem. You can use the [`create`](https://serverless.com/framework/docs/providers/aws/cli-reference/create/) command to get started with a variety of other languages.

### Set up an endpoint

An Event is anything that can trigger your serverless functions. In this case, you need to define an endpoint in your `serverless.yml` that will trigger your serverless function.

```yaml
functions:
  hello:
    handler: handler.hello
    # Add the following lines:
    events:
      - http:
          path: hello
          method: post
```

### Deploy the Service

Use this command to deploy your service for the first time and after you make changes to your Functions, Events or Resources in `serverless.yml` and want to deploy all changes within your Service at the same time.

```bash
serverless deploy -v
```

### Test your Service

Replace the URL in the following curl command with your returned endpoint URL, which you can find in the `sls deploy` output, to hit your URL endpoint.

```bash
$ curl -X POST https://xxxxxxxxxx.execute-api.us-east-1.amazonaws.com/dev/hello
```

### Invoke your Service's function

Invokes a Function and returns logs.

```bash
serverless invoke -f hello -l
```

### Fetch the Function Logs

Open up a separate tab in your console and stream all logs for a specific Function using this command.

```bash
serverless logs -f hello -t
```

### Monitor your Service

Use either of the two commands below to generate mock errors that you will then be able to visualize in the Serverless Framework Dashboard. If you use the curl command remember to replace the URL in the command with your returned endpoint URL, which you can find in your `sls deploy` output.

```bash
serverless invoke -f hello -d '{"body": "not a json string"}' # causes a JSON parsing error so error Insights will populate
```

```bash
$ curl https://xxxxxxxxxx.execute-api.us-east-1.amazonaws.com/dev/hello --data-binary 'not a json string' # causes a JSON parsing error so error Insights will populate
```

## Cleanup

### Remove your Service

If at any point you no longer need your Service, you can run the following command to remove the Functions, Events and Resources that were created. This will delete the AWS resources you created and ensure that you don't incur any unexpected charges. It will also remove the Service from your Serverless Framework Dashboard.

```sh
serverless remove
```

## Deploy more Services!

Now you are ready to leverage the hundreds of Service Examples available to you from Serverless, Inc. and our large and growing community to build your own Services.

### Create a new Service from an Example

The `serverless` introduction above guided you through creating a new service for a simple Node.js project. However, if you want to create a project for a more advanced use case and you don’t want to start from scratch, check out the list of available examples.

Clone a Service from the Serverless Inc. repository of [Examples](https://serverless.com/examples/)

```sh
# replace folder-name below with the folder name of the example you want to use
$ serverless create -u https://github.com/serverless/examples/tree/master/folder-name -n my-project
```

Or, clone a Service example from the Serverless open-source community

```sh
$ serverless create -u https://github.com/author/project -n my-project
```

### Remember to configure your new Service to work with the Serverless Framework account for monitoring, troubleshooting and testing features.

Run the `serverless` command in your new project to connect it to your Serverless Framework Dashboard account to enable the monitoring, troubleshooting and testing features.

```sh
$ serverless
```

Deploy your service

```sh
$ sls deploy
```

## Additional Tutorials

Want to learn more? Check out a list of available tutorials [here](https://serverless.com/courses/).
