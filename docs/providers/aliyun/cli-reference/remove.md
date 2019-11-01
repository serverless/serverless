<!--
title: Serverless Framework Commands - Alibaba Cloud Function Compute - Remove
menuText: remove
menuOrder: 9
description: Remove a deployed Service and all of its Alibaba Cloud Function Compute Functions, Events and Resources
layout: Doc
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/aliyun/cli-reference/remove)

<!-- DOCS-SITE-LINK:END -->

# Alibaba Cloud - Remove

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

Note: by default RAM roles and policies created during the deployment are not removed. You can use `serverless remove --remove-roles` if you do want to remove them.
