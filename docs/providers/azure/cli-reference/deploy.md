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

The `sls deploy apim` command will deploy API management as configured within `serverless.yml`. If you have it configured, it will automatically deploy as a lifecycle event of `sls deploy`. However, if you make changes to your configuration or just want to deploy APIM, this will do the job

## Options

- `--resourceGroup` or `-g` - Specify the resource group name
- `--stage` or `-s` - Specify stage name
- `--region` or `-r` - Specify region name
- `--subscriptionId` or `-i` - Specify subscription ID
- `--config` or `-c` Name of your configuration file, if other than `serverless.yml|.yaml|.js|.json`.
- `--verbose` Shows all stack events during deployment, and display any Stack Output.

## Artifacts

After the `serverless deploy` command runs, all created deployment artifacts are placed in the `.serverless` folder of the service.

## Examples

### Deployment

```bash
serverless deploy
```

```bash
# Deploy APIM
sls deploy apim
```

This is the simplest deployment usage possible. With this command, Serverless will deploy your service to the defined Azure platform endpoints.

## Provided lifecycle events

- `deploy:deploy`
- `deploy:list:list`
- `deploy:apim:apim`
