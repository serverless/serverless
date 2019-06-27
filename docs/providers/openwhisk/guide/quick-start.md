<!--
title: Serverless Framework - Apache Openwhisk Guide - Quick Start
menuText: Quick Start
menuOrder: 1
description: Getting started with the Serverless Framework on Apache Openwhisk
layout: Doc
-->

# OpenWhisk - Quick Start

## Pre-requisites

1. Node.js `v6.5.0` or later.
2. Serverless CLI `v1.9.0` or later. You can run
   `npm install -g serverless` to install it.
3. An IBM Bluemix account. If you don't already have one, you can sign up for an [account](https://console.bluemix.net/registration/) and then follow the instructions for getting access to [OpenWhisk on Bluemix](https://console.ng.bluemix.net/openwhisk/).
4. **Set-up your [Provider Credentials](./credentials.md)**.
5. Install Framework & Dependencies
   _Due to an [outstanding issue](https://github.com/serverless/serverless/issues/2895) with provider plugins, the [OpenWhisk provider](https://github.com/serverless/serverless-openwhisk) must be installed as a global module._

```bash
$ npm install --global serverless serverless-openwhisk
```

## Create a new service

Create a new service using the Node.js template, specifying a unique name and an optional path for your service.

```bash
# Create a new Serverless Service/Project
$ serverless create --template openwhisk-nodejs --path my-service
# Change into the newly created directory
$ cd my-service
# Install npm dependencies
$ npm install
```

**Using a self-hosted version of the platform?**

Ensure you set the `ignore_certs` option in the `serverless.yaml` prior to deployment.

```
provider:
  name: openwhisk
  ignore_certs: true
```

## Deploy, test and diagnose your service

1. **Deploy the Service**

Use this when you have made changes to your Functions, Events or Resources in `serverless.yml` or you simply want to deploy all changes within your Service at the same time.

```bash
serverless deploy -v
```

2. **Deploy the Function**

Use this to quickly upload and overwrite your function code, allowing you to develop faster.

```bash
serverless deploy function -f hello
```

3. **Invoke the Function**

Invokes the Function and returns results.

```bash
serverless invoke --function hello
# results
{
  "payload": "Hello, World!"
}

serverless invoke --function hello --data '{"name": "OpenWhisk"}'
#results
{
  "payload": "Hello, OpenWhisk!"
}
```

4. **Fetch the Function Logs**

Open up a separate tab in your console and stream all logs for a specific Function using this command.

```bash
serverless logs -f hello -t
```

## Cleanup

If at any point, you no longer need your service, you can run the following command to remove the Functions, Events and Resources that were created, and ensure that you don't incur any unexpected charges.

```bash
serverless remove
```

Check out the [Serverless Framework Guide](./README.md) for more information.
