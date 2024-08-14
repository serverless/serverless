<!--
title: Serverless Framework Commands - AWS Lambda - Deploy List
description: List your previous CloudFormation deployments
short_title: Commands - Deploy List
keywords:
  [
    'Serverless',
    'Framework',
    'AWS',
    'Lambda',
    'Deploy List',
    'Serverless AWS Lambda Commands',
    'AWS Lambda Deployment List',
    'Serverless Framework CLI',
    'Serverless Deploy List',
  ]
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/aws/cli-reference/deploy-list)

<!-- DOCS-SITE-LINK:END -->

# AWS - Deploy List

The `sls deploy list [functions]` command will list information about your deployments.

You can either see all available deployments in your S3 deployment bucket by running `serverless deploy list` or you can see the deployed functions by running `serverless deploy list functions`.

The displayed information is useful when rolling back a deployment or function via `serverless rollback`.

## Options

- `--stage` or `-s` The stage in your service that you want to deploy to.
- `--region` or `-r` The region in that stage that you want to deploy to.
- `--aws-profile` The AWS profile you want to use.

## Examples

### List existing deploys

```bash
serverless deploy list
```

### List deployed functions and their versions

```bash
serverless deploy list functions
```
