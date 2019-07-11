<!--
title: Serverless Framework Commands - Apache OpenWhisk - Deploy Function
menuText: deploy function
menuOrder: 5
description: Deploy your Apache OpenWhisk functions quickly
layout: Doc
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/openwhisk/cli-reference/deploy-function)

<!-- DOCS-SITE-LINK:END -->

# OpenWhisk - Deploy Function

The `sls deploy function` command deploys an individual function. This command simply compiles a deployment package with a single function handler. This is a much faster way of deploying changes in code.

```bash
serverless deploy function -f functionName
```

**Note:** Because this command is only deploying the function code, function
properties such as environment variables and events will **not** be deployed.

## Options

- `--function` or `-f` The name of the function which should be deployed
