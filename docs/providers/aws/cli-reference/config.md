<!--
title: Serverless Framework Commands - AWS Lambda - Config
menuText: config
menuOrder: 1
description: Configure Serverless
layout: Doc
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/aws/cli-reference/config)

<!-- DOCS-SITE-LINK:END -->

# AWS - Config

The purpose of `serverless config` is to allow to enable or disable automatic update mechanism of the Framework. Additionally, it supports two subcommands, `config credentials` and `config tabcompletion`. For more details about them, please refer to their corresponding documentation pages. Auto update mechanism is supported for global installations across all operating systems with the exception of standalone binary installation on Windows.

## Options

- `--autoupdate` Turn on auto update mechanism
- `--no-autoupdate` Turn off auto update mechanism

## Provided lifecycle events

- `config:config`

## Examples

### Turn on auto update mechanism

```
serverless config --autoupdate
```

### Turn off auto update mechanism

```
serverless config --no-autoupdate
```
