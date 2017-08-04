<!--
title: Hello World F# Example
menuText: Hello World F# Example
description: Create a F# Hello World Lambda function
layout: Doc
-->

# Hello World F# Example

## Prerequisites

* Make sure `serverless` is installed. [See installation guide](../../../guide/installation.md).
* [.Net Core 1.0.1 SDK](https://www.microsoft.com/net/download/core)
    * 1.1 isn't currently supported by AWS Lambda 
* [NodeJS v4 or higher](https://nodejs.org/en/)
* An AWS Account

## Build and Package 

From the root of this directory, run `build.cmd`, or `build.sh` if on Linux / Mac.

This will produce your deployment package at `bin/release/netcoreapp1.0/deploy-package.zip`.

## Deployment and Invocation

Once packaged, you can follow [these instructions](https://github.com/serverless/serverless#quick-start) to deploy and remotely invoke the function on AWS Lambda.

In short the commands you will need to run are (from the root of this directory):

```
serverless config credentials --provider aws --key {YourAwsAccessKey} --secret {YourAwsSecret}
serverless deploy -v
serverless invoke -f hello -l
serverless remove
```

By default this template deploys to us-east-1, you can change that in "serverless.yml" under the `region: us-east-1` key.