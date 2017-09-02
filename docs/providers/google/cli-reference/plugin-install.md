<!--
title: Serverless Framework Commands - Google Cloud Functions - Plugin Install
menuText: Plugin Install
menuOrder: 12
description: Install a Serverless plugin
layout: Doc
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->
### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/google/cli-reference/plugin-install)
<!-- DOCS-SITE-LINK:END -->

# Plugin Install

Install a Serverless plugin and add it to the services `plugins` array.

**Note:** You might want to change the order of the plugin in the services `plugins` array.

```bash
serverless plugin install --name pluginName
```

## Options
- `--name` or `-n` The plugins name. **Required**.

## Provided lifecycle events
- `plugin:install:install`

## Examples

### Install the `serverless-webpack` plugin

```bash
serverless plugin install --name serverless-webpack
```
