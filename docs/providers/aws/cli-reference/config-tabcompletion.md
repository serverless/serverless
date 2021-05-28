<!--
title: Serverless Framework Commands - AWS Lambda - Config Tabcompletion
menuText: config tabcompletion
menuOrder: 1
description: Configure Serverless Tabcompletion
layout: Doc
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/aws/cli-reference/config-tabcompletion)

<!-- DOCS-SITE-LINK:END -->

# AWS - Config

The purpose of `serverless config tabcompletion` is to allow to enable or disable tab completion for the Framework in your shell. Currently supported shells are `fish`, `bash` and `zsh`.

## Provided lifecycle events

- `config:tabcompletion:install:install`
- `config:tabcompletion:uninstall:uninstall`

## Examples

### Enable tab completion

```
serverless config tabcompletion install
```

### Disable tab completion

```
serverless config tabcompletion uninstall
```
