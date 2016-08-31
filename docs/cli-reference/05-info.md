<!--
title: Serverless Info CLI Command
description: Display information about your deployed service
layout: Page
-->

# Info

Displays information about the deployed service.

```
serverless info
```

## Options
- `--stage` or `-s` The stage in your service you want to display information about.
- `--region` or `-r` The region in your stage that you want to display information about.

## Provided lifecycle events
- `info:info`

## Examples

### AWS

On AWS the info plugin uses the `Outputs` section of the CloudFormation stack. Outputs will include Lambda function ARN's, a `ServiceEndpoint` for the API Gateway endpoint and user provided custom Outputs.

**Example:**

```
$ serverless info

Service Information
service: my-serverless-service
stage: dev
region: us-east-1
endpoints:
  GET - https://dxaynpuzd4.execute-api.us-east-1.amazonaws.com/dev/users
functions:
  my-serverless-service-dev-hello: arn:aws:lambda:us-east-1:377024778620:function:my-serverless-service-dev-hello
```
