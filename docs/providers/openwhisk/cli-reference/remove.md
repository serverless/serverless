<!--
title: Serverless Framework Commands - Apache OpenWhisk - Remove
menuText: remove
menuOrder: 11
description: Remove a deployed Service and all of its Apache OpenWhisk Functions, Events and Resources
layout: Doc
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/openwhisk/cli-reference/remove)

<!-- DOCS-SITE-LINK:END -->

# OpenWhisk - Remove

The `sls remove` command will remove the deployed service, defined in your current working directory, from the provider.

```bash
serverless remove
```

## Provided lifecycle events

- `remove:remove`

## Examples

### Removal of service in specific stage and region

```bash
serverless remove
```

This example will remove the deployed service of your current working directory from the current platform endpoint.
