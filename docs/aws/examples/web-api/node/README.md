<!--
title: Web API AWS Lambda Node Example
description: Create a nodeJS Lambda function on amazon web services
layout: Page
-->

# Web API with AWS Lambda in Node.js

This example demonstrates how to create a web api with AWS Gateway and Lambda.

# Steps

## 1. Configure your endpoint

In your serverless.yml file, configure a function and http to the events with path and method.



## 2. Deploy

`serverless deploy` or `sls deploy`. `sls` is shorthand for the serverless CLI command.

After you deploy your function. Serverless will setup and configure the AWS

## 2. Invoke the remote function


In your terminal window you should be the response from AWS Lambda

```bash
{
  "message": "Hello World",
  "event": {}
}
```

Congrats you have just deployed and ran your hello world function!
