<!--
title: Serverless Framework Commands - AWS Lambda - Deploy List
menuText: deploy list
menuOrder: 3
description: List your previous CloudFormation deployments
layout: Doc
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/aws/cli-reference/deploy-list)

<!-- DOCS-SITE-LINK:END -->

# Azure - Deploy List

The `sls deploy list` command will list information about your deployments.

You can see all deployments to your Azure Function App with the timestamp of deployment.

The displayed information is useful when rolling back a deployment or function via `serverless rollback`.

## Options

- `--config` or `-c` Name of your configuration file, if other than `serverless.yml|.yaml|.js|.json`.

## Examples

### List existing deployments

```bash
sls deploy list
```
