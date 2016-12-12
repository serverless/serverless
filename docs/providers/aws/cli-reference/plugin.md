<!--
title: Serverless Framework Commands - AWS Lambda - Plugin
menuText: Plugin
menuOrder: 11
description: Discover, install and uninstall Serverless plugins
layout: Doc
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->
### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/aws/cli-reference/plugin)
<!-- DOCS-SITE-LINK:END -->

# Plugin

Helps you to discover and manage Serverless plugins. Connected to the [Serverless plugin registry](https://github.com/serverless/plugins).

## List

List all available plugins on the terminal.

```bash
serverless plugin list
```

## Search

Search for a specific plugin based on a search query.

```bash
serverless plugin search --query webpack
```

### Options
- `--query` or `-q` The query you want to use for your search. **Required**.

## Install

Install a Serverless plugin and add it to the services `plugins` array.

**Note:** You might want to change the order of the plugin in the services `plugins` array.

```bash
serverless plugin install --name serverless-webpack
```

### Options
- `--name` or `-n` The plugins name. **Required**.

## Uninstall

Uninstall a Serverless plugin and remove it from the services `plugins` array.

```bash
serverless plugin uninstall --name serverless-webpack
```

### Options
- `--name` or `-n` The plugins name. **Required**.
