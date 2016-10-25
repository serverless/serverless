<!--
title: Serverless Framework Commands - AWS Lambda - Remove
menuText: Remove
menuOrder: 7
description: Remove a deployed Service and all of its AWS Lambda Functions, Events and Resources
layout: Doc
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->
### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/aws/cli-reference/remove)
<!-- DOCS-SITE-LINK:END -->

# Remove

Removes the deployed service which is defined in your current working directory.

```bash
serverless remove
```

## Options
- `--stage` or `-s` The name of the stage in service.
- `--region` or `-r` The name of the region in stage.
- `--verbose` or `-v` Shows all stack events during deployment.

## Provided lifecycle events
- `remove:remove`

## Examples

### Removal of service in specific stage and region

```bash
serverless remove --stage dev --region us-east-1
```

This example will remove the deployed service of your current working directory with the stage `dev` and the region `us-east-1`.