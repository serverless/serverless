<!--
title: Serverless Framework Commands - Azure Functions - Uninstall Plugin
menuText: Plugin Uninstall
menuOrder: 4
description: Uninstall a Serverless plugin
layout: Doc
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->
### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/azure/cli-reference/uninstall-plugin)
<!-- DOCS-SITE-LINK:END -->

# Plugin Uninstall

Uninstall a Serverless plugin and remove it from the services `plugins` array.

```bash
serverless uninstall plugin --name pluginName
```

## Options
- `--name` or `-n` The plugins name. **Required**.

## Provided lifecycle events
- `uninstall:plugin:plugin`

## Examples

### Remove the `serverless-kubeless` plugin

```bash
serverless uninstall plugin --name serverless-kubeless
```
