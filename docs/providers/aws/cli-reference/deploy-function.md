<!--
title: Serverless Framework Commands - AWS Lambda - Deploy Function
menuText: Deploy Function
menuOrder: 5
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
