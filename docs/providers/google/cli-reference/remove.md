<!--
title: Serverless Framework Commands - Google Cloud Functions - Remove
menuText: Remove
menuOrder: 13
description: Remove a deployed Service and all of its Google Cloud Functions Functions, Events and Resources
layout: Doc
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->
### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/google/cli-reference/remove)
<!-- DOCS-SITE-LINK:END -->

# Remove

The `serverless remove` command will remove the deployed service, defined in your current working directory, from the provider.

**Note:** Only the deployed service with all its resources will be removed. The code on your local machine will remain.

```bash
serverless remove
```

## Examples

### Service removal

```bash
serverless remove
```

This example will remove the deployed service of your current working directory.
