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

# Deploying

The Serverless Framework was designed to provision your Azure Functions Functions, Triggers and Rules safely and quickly.  It does this via a couple of methods designed for different types of deployments.

## Deploy All

This is the main method for doing deployments with the Serverless Framework:

```bash
serverless deploy
```

Use this method when you have updated your Function, Event or Resource configuration in `serverless.yml` and you want to deploy that change (or multiple changes at the same time) to Azure Functions.

### How It Works

The Serverless Framework translates all syntax in `serverless.yml` to an Azure Resource Manager Template and Azure Function project.

* Provider plugin parses `serverless.yml` configuration and translates to Azure resources.
* The code of your Functions is then packaged into a directory and zipped.
* Resources are deployed in the following order: *ARM template, Functions*

### Tips

* Use this in your CI/CD systems, as it is the safest method of deployment.

Check out the [deploy command docs](../cli-reference/deploy.md) for all details and options.

## Deploy Function

This deployment method updates a single function. It performs the platform API call to deploy your package without the other resources. It is much faster than redeploying your whole service each time.

```bash
serverless deploy function --function myFunction
```

### How It Works

* The Framework packages up the targeted Azure Function into a zip file.
* That zip file is deployed to the Function App using the kudu zip API.

### Tips

* Use this when you are developing and want to test on Azure Functions because it's much faster.
* During development, people will often run this command several times, as opposed to `serverless deploy` which is only run when larger infrastructure provisioning is required.

Check out the [deploy command docs](../cli-reference/deploy.md) for all details and options.
