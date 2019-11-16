<!--
title: Serverless Framework Commands - Azure Functions - Deploy
menuText: deploy
menuOrder: 2
description: Deploy your service to the specified provider
layout: Doc
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/azure/cli-reference/deploy)

<!-- DOCS-SITE-LINK:END -->

# Azure - Deploy

The `serverless deploy` command deploys your infrastructure and app code via the Azure Resource Manager API.

```bash
serverless deploy
```

## Options

- `--config` or `-c` Name of your configuration file, if other than `serverless.yml|.yaml|.js|.json`.
- `--noDeploy` or `-n` Skips the deployment steps and leaves artifacts in the `.serverless` directory
- `--verbose` or `-v` Shows all stack events during deployment, and display any Stack Output.

## Artifacts

After the `serverless deploy` command runs, all created deployment artifacts are placed in the `.serverless` folder of the service.

## Examples

### Deployment

```bash
serverless deploy
```

This is the simplest deployment usage possible. With this command, Serverless will deploy your service to the defined Azure platform endpoints.

## Provided lifecycle events

- `deploy:deploy`
- `deploy:list:list`
