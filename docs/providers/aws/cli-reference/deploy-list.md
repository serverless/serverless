<!--
title: Serverless Framework Commands - AWS Lambda - Deploy List
menuText: deploy list
menuOrder: 7
description: List your previous CloudFormation deployments
layout: Doc
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

## Examples

### List existing deploys

```bash
serverless deploy list
```

### List deployed functions and their versions

```bash
serverless deploy list functions
```
