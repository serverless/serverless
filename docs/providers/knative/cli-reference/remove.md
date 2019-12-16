<!--
title: Serverless Framework Commands - Knative - Remove
menuText: remove
menuOrder: 6
description: Remove a deployed service and all of its Knative Serving services and Knative Eventing events
layout: Doc
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/knative/cli-reference/remove/)

<!-- DOCS-SITE-LINK:END -->

# Knative - Remove

The `serverless remove` command will remove the deployed service, defined in your current working directory, from the provider.

```bash
serverless remove
```

## Options

- `--stage` or `-s` The name of the stage in service, `dev` by default.

## Examples

### Removal of service in a specific stage

```bash
serverless remove --stage dev
```

This example will remove the deployed service of your current working directory with the stage `dev`.
