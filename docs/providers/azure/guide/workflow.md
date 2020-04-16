<!--
title: Serverless Framework Guide - Azure Functions - Workflow
menuText: Workflow
menuOrder: 14
description: A guide and cheatsheet containing CLI commands and workflow recommendations.
layout: Doc
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/azure/guide/workflow)

<!-- DOCS-SITE-LINK:END -->

# Azure - Workflow

Intro. Quick recommendations and tips for various processes.

### Development Workflow

1. Write your functions
2. Run function app locally by using `sls offline` and `npm start` (or `func host start`). See [quickstart](./quick-start).
3. Use `serverless deploy` to deploy your function app (preferably in a CI/CD environment)
4. Use `serverless invoke -f myFunction` to test your Azure Functions.

### Larger Projects

- Break your application/project into multiple Function Apps.
- Model your Function Apps around Data Models or Workflows.
- Keep the Functions and Resources in your Function Apps to a minimum.

## Cheat Sheet

A handy list of commands to use when developing with the Serverless Framework.

##### Create A Function App:

Install the boilerplate application:

- with node:

```bash
sls create -t azure-nodejs -p my-app
```

- with python:

```bash
sls create -t azure-python -p my-app
```

##### Install A Service

This is a convenience method to install a pre-made Serverless Service locally by downloading the GitHub repo and unzipping it.

```
serverless install -u [GITHUB URL OF SERVICE]
```

##### Deploy

Use this when you have made changes to your Function App

```
sls deploy
```

##### Invoke Function

Invokes an Azure Function

```
sls invoke function -f [FUNCTION NAME]
```
