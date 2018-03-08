<!--
title: Serverless Framework - AWS Lambda Guide - Quick Start
menuText: Quick Start
menuOrder: 1
description: Getting started with the Serverless Framework on AWS Lambda
layout: Doc
-->

# Quick Start

## Pre-requisites

1. Node.js `v6.5.0` or later.
2. Serverless CLI `v1.9.0` or later. You can run 
`npm install -g serverless` to install it.
3. An AWS account. If you don't already have one, you can sign up for a [free trial](https://aws.amazon.com/s/dm/optimization/server-side-test/free-tier/free_np/) that includes 1 million free Lambda requests per month.
4. **Set-up your [Provider Credentials](./credentials.md)**. [Watch the video on setting up credentials](https://www.youtube.com/watch?v=HSd9uYj2LJA)

## Tutorials

Check out the following links for tutorial walkthroughs:

- [Build an Node.js REST API](/blog/serverless-express-rest-api/)
- [Deploy a GraphQL endpoint](/blog/make-serverless-graphql-api-using-lambda-dynamodb/)

Or follow the steps below for creating & deploying a simple service and learning some simple Serverless commands.

## Create a new service

Create a new service using the Node.js template, specifying a unique name and an optional path for your service.

```bash
# Create a new Serverless Service/Project
$ serverless create --template aws-nodejs --path my-service
# Change into the newly created directory
$ cd my-service
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

  Invokes a Function and returns logs.
  
  ```bash
  serverless invoke -f hello -l
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
