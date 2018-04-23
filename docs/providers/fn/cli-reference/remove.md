<!--
title: Serverless Framework Commands - Fn - Remove
menuText: remove
menuOrder: 6
description: Remove a deployed Service and all of its Fn Functions and Kubernetes Deployments and Services.
layout: Doc
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->
### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/fn/cli-reference/remove)
<!-- DOCS-SITE-LINK:END -->

# Fn - Remove

The `sls remove` command will remove the deployed service, defined in your current working directory, from the provider.

```bash
serverless remove
```

It will remove the Fn Function objects from your Kubernetes cluster, the Kubernetes Deployments and the Kubernetes Services associated with the Serverless service.

## Options
- `--verbose` or `-v` Shows additional information during the removal.

## Provided lifecycle events
- `remove:remove`
