<!--
title: Serverless Framework Commands - Fn - Logs
menuText: logs
menuOrder: 4
description: View logs of your Fn Function within your terminal using the Serverless Framework
layout: Doc
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/fn/cli-reference/logs)

<!-- DOCS-SITE-LINK:END -->

# Fn - Logs

Lets you watch the logs of a specific function.

```bash
serverless logs -f hello
```

## Options

- `--function` or `-f` The function you want to fetch the logs for. **Required**

## Examples

```bash
serverless logs -f hello
```

This will fetch the logs for hello for the most recent calls to it.
