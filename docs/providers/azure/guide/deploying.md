<!--
title: Serverless Framework - Azure Functions Guide - Deploying
menuText: Deploying
menuOrder: 8
description: How to deploy your Azure Functions functions and their required infrastructure
layout: Doc
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/azure/guide/deploying)

<!-- DOCS-SITE-LINK:END -->

# Azure - Deploying

The `serverless-azure-functions` plugin can deploy a Function App as well as other resources (storage account, App Insights, API Management, etc.). Here is some guidance on using the `deploy` command.

### How It Works

The Serverless Framework translates all syntax in `serverless.yml` to an [Azure Resource Manager Template](https://docs.microsoft.com/en-us/azure/azure-resource-manager/resource-group-authoring-templates) and [Azure function bindings](https://docs.microsoft.com/en-us/azure/azure-functions/functions-triggers-bindings)

- Provider plugin parses `serverless.yml` configuration and translates to Azure resources.
- The code of your Functions is then packaged into a directory and zipped.
- Resources are deployed in the following order: _ARM template, Functions_

For more detail on deployment, visit our [docs](https://github.com/serverless/serverless-azure-functions/blob/master/docs/DEPLOY.md)

### Rollback

By default, the `rollback` functionality is enabled. This allows for users to revert to a previous deployment should something go wrong with the current release. See our [rollback docs](../cli-reference/rollback.md) for more detail.

### Tips

Check out the [deploy command docs](../cli-reference/deploy.md) for all details and options.
