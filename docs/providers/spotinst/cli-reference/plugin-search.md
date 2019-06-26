<!--
title: Serverless Framework Commands - Spotinst Functions - Plugin Search
menuText: Plugin Search
menuOrder: 11
description: Search through all available Serverless plugins
layout: Doc
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/spotinst/cli-reference/plugin-search)

<!-- DOCS-SITE-LINK:END -->

# Plugin Search

Search for a specific plugin based on a search query. Connected to the [Serverless plugin registry](https://github.com/serverless/plugins).

```bash
serverless plugin search --query query
```

## Options

- `--query` or `-q` The query you want to use for your search. **Required**.

## Provided lifecycle events

- `plugin:search:search`

## Examples

### Search for a `sqs` plugin

```bash
serverless plugin search --query sqs
```
