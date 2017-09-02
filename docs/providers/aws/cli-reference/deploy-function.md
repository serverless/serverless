<!--
title: Serverless Framework Commands - AWS Lambda - Deploy Function
menuText: deploy function
menuOrder: 6
description: Deploy your AWS Lambda functions quickly without cloudformation
layout: Doc
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->
### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/aws/cli-reference/deploy-function)
<!-- DOCS-SITE-LINK:END -->

# AWS - Deploy Function

The `sls deploy function` command deploys an individual function without AWS CloudFormation.  This command simply swaps out the zip file that your CloudFormation stack is pointing toward.  This is a much faster way of deploying changes in code.

```bash
serverless deploy function -f functionName
```

**Note:** Because this command is only deploying the function code, function
properties such as environment variables and events will **not** be deployed.
Those properties are deployed via CloudFormation, which does not execute with
this command.

## Options
- `--function` or `-f` The name of the function which should be deployed
- `--stage` or `-s` The stage in your service that you want to deploy to.
- `--region` or `-r` The region in that stage that you want to deploy to.

## Examples

### Deployment without stage and region options

```bash
serverless deploy function --function helloWorld
```

### Deployment with stage and region options

```bash
serverless deploy function --function helloWorld --stage dev --region us-east-1
```
