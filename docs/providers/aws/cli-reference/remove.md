<!--
title: Serverless Framework Commands - AWS Lambda - Remove
description: Remove a deployed Service and all of its AWS Lambda Functions, Events and Resources
short_title: Commands - Remove
keywords: ['Serverless', 'Framework', 'AWS Lambda', 'remove']
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/aws/cli-reference/remove)

<!-- DOCS-SITE-LINK:END -->

# AWS - Remove

The `sls remove` command will remove the deployed service, defined in your current working directory, from the provider.

```bash
serverless remove
```

## Options

- `--stage` or `-s` The name of the stage in service.
- `--region` or `-r` The name of the region in stage.
- `--aws-profile` The AWS profile you want to use.
- `--verbose` Shows all stack events during deployment.

## Provided lifecycle events

- `remove:remove`

## Examples

### Removal of service in specific stage and region

```bash
serverless remove --stage dev --region us-east-1
```

This example will remove the deployed service of your current working directory with the stage `dev` and the region `us-east-1`.
