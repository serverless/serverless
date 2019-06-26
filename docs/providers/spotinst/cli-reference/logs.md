<!--
title: Serverless Framework Commands - Spotinst Functions - Logs
menuText: logs
menuOrder: 6
description: View logs of your Spotinst Functions Function within your terminal using the Serverless Framework
layout: Doc
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/spotinst/cli-reference/logs)

<!-- DOCS-SITE-LINK:END -->

# Spotinst Functions - Logs

Lets you view the logs for of the specified function.

```bash
serverless logs -f hello
```

## Options

- `-f` the name of the function that you want to fetch the logs for **Required**
- `--startTime` a unit of time that you want to start searching the logs from. Here is a list of the supported string formats

```bash
30m                             # since 30 mins ago
2h                              # since 2 hours ago
3d                              # since 3 days ago
```

## Examples

**Note** There is a small lag between calling the function and when the logs are available so keep that in mind when checking

```bash
serverless logs -f hello --startTime 3h
```

This will fetch your logs started from 3 hours ago until the current time
