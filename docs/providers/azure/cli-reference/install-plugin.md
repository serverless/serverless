<!--
title: Serverless Framework Commands - Azure Functions - Install Plugin
menuText: Install Plugin
menuOrder: 3
description: Install a Serverless plugin
layout: Doc
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->
### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/azure/cli-reference/install-plugin)
<!-- DOCS-SITE-LINK:END -->

# Install Plugin

Install a Serverless plugin and add it to the services `plugins` array.

**Note:** You might want to change the order of the plugin in the services `plugins` array.

```bash
serverless install plugin --name pluginName
```

## Options
- `--name` or `-n` The plugins name. **Required**.
- `--version` or `-v` The plugins version.

## Provided lifecycle events
- `install:plugin:plugin`

## Examples

### Install the `serverless-kubeless` plugin

```bash
serverless install plugin --name serverless-kubeless
```
