<!--
title: Serverless Framework Commands - Tencent-SCF - Remove
menuText: remove
menuOrder: 16
description: Remove a deployed Service and all of its Tencent-SCF Functions, Events and Resources
layout: Doc
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/tencent/cli-reference/remove/)

<!-- DOCS-SITE-LINK:END -->

# Tencent-SCF - Remove

The `sls remove` command will remove the deployed service, defined in your current working directory, from the provider.

```bash
serverless remove
```

## Options

- `--stage` or `-s` The name of the stage in service, `dev` by default.
- `--region` or `-r` The name of the region in stage, `ap-guangzhou` by default.

## Examples

### Removal of service in specific stage and region

```bash
serverless remove --stage dev --region ap-guangzhou
```

This example will remove the deployed service of your current working directory with the stage `dev` and the region `ap-guangzhou`.
