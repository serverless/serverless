<!--
title: Serverless Framework Commands - Tencent-SCF - Info
menuText: info
menuOrder: 13
description: Display information about your deployed service and the Serverless Cloud Function, Events and Tencent Cloud Resources it contains.
layout: Doc
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/tencent/cli-reference/info/)

<!-- DOCS-SITE-LINK:END -->

# Tencent-SCF - Info

Displays information about the deployed service, such as runtime, region, stage and function list.

```bash
serverless info
```

## Options

- `--stage` or `-s` The stage in your service you want to display information about.
- `--region` or `-r` The region in your stage that you want to display information about.

## Provided lifecycle events

- `info:info`

## Examples

```bash
$ sls info
Serverless:

Service Information
service: my-service
stage: dev
region: ap-guangzhou

Deployed functions:
  my-service-dev-function_one

Undeployed function:
  my-service-dev-function_two
```
