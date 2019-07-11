<!--
title: Serverless Framework - Fn Guide - Quick Start
menuText: Quick Start
menuOrder: 2
description: Getting started with the Serverless Framework on Fn
layout: Doc
-->

# Fn - Quick Start

## Pre-requisites

1. Node.js `v6.5.0` or later.
2. Serverless CLI `v1.20` or later. You can run
   `npm install -g serverless` to install it.
3. Install Fn & Dependencies(./installation.md).

## Create a new service

Create a new service using the Nodejs template, specifying a unique name and an optional path for your service.

```bash
# Create a new Serverless Service/Project
$ serverless create --template fn-nodejs --path new-project
# Change into the newly created directory
$ cd new-project
# Install npm dependencies
$ npm install
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
serverless deploy -f hello
```

3. **Invoke the Function**

Invokes the Function and returns results.

```bash
$ serverless invoke --function hello --data '{"name":"Bob"}' -l
Serverless: Calling Function: hello
{ message: 'Hello Bob' }
I show up in the logs name was: Bob
```

4. **Fetch the Function Logs**

Open up a separate tab in your console and view logs for a specific Function using this command.

```bash
serverless logs -f hello
```

## Cleanup

If at any point, you no longer need your service, you can run the following command to remove the Functions, Events and Resources that were created.

```bash
serverless remove
```
