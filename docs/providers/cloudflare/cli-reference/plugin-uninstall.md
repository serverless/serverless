<!--
title: Serverless Framework Commands - Cloudflare Workers - Plugin Uninstall
menuText: Plugin Uninstall
menuOrder: 8
description: Uninstall a Serverless plugin
layout: Doc
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/cloudflare/cli-reference/plugin-uninstall)

<!-- DOCS-SITE-LINK:END -->

# Plugin Uninstall

Uninstall a Serverless plugin and remove it from the services `plugins` array.

```bash
serverless plugin uninstall --name pluginName
```

## Options

- `--name` or `-n` The plugins name. **Required**.

## Provided lifecycle events

- `plugin:uninstall:uninstall`

## Examples

### Remove the `serverless-webpack` plugin

```bash
serverless plugin uninstall --name serverless-webpack
```
