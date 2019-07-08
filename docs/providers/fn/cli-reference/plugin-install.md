<!--
title: Serverless Framework Commands - Fn - Plugin Install
menuText: Plugin Install
menuOrder: 9
description: Install a Serverless plugin
layout: Doc
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/fn/cli-reference/plugin-install)

<!-- DOCS-SITE-LINK:END -->

# Plugin Install

Install a Serverless plugin and add it to the services `plugins` array. By default, a latest version is installed.
If you want a specific version, you can specify `<pluginname>@<version>` as name option.

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

### Install a specific version

```bash
serverless plugin install --name serverless-webpack@3.0.0-rc.2
```
