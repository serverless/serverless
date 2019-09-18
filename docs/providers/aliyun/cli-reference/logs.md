<!--
title: Serverless Framework Commands - Alibaba Cloud Function Compute - Logs
menuText: logs
menuOrder: 8
description: View logs of your Alibaba Cloud Function Compute Function within your terminal using the Serverless Framework
layout: Doc
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/aliyun/cli-reference/logs)

<!-- DOCS-SITE-LINK:END -->

# Alibaba Cloud - Logs

Lets you watch the logs of a specific function.

```bash
serverless logs --function functionName
```

## Options

- `--function` or `-f` The function you want to fetch the logs for. **Required**
- `--count` or `-c` The number of logs to display.

## Examples

### Retrieving logs

```bash
serverless logs --function functionName
```

This will display logs for the specified function.
