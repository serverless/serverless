<!--
title: Serverless Framework Guide - Google Cloud Functions - Workflow
menuText: Workflow
menuOrder: 14
description: A guide and cheatsheet containing CLI commands and workflow recommendations.
layout: Doc
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/google/guide/workflow)

<!-- DOCS-SITE-LINK:END -->

# Google - Workflow

Intro. Quick recommendations and tips for various processes.

## Development Workflow

1. Write your functions
2. Use `serverless deploy` when you've made changes to `serverless.yml` and in CI/CD systems
3. Use `serverless invoke --function myFunction` to test your Google Cloud Functions
4. Open up a separate tab in your console and see logs in there via `serverless logs --function myFunction`
5. Write tests to run locally

### Larger Projects

- Break your application / project into multiple Serverless Services
- Model your Serverless Services around Data Models or Workflows
- Keep the Functions and Resources in your Serverless Services to a minimum

## Cheat Sheet

A handy list of commands to use when developing with the Serverless Framework.

### Create A Service:

1. Create a new service with the `google-nodejs` template

```bash
serverless create --template google-nodejs --path my-service
```

2. Install the dependencies

```bash
cd my-service
npm install
```

3. Update `serverless.yml`

Update the `project` and `credentials` in your projects `serverless.yml`

### Install A Service

This is a convenience method to install a pre-made Serverless Service locally by downloading the Github repo and unzipping it.

```
serverless install -u [GITHUB URL OF SERVICE]
```

### Deploy

Use this when you have made changes to your Functions, Events or Resources in `serverless.yml` or you simply want to deploy all changes within your Service at the same time.

```
serverless deploy
```

### Invoke Function

Invokes an Google Cloud Function

```
serverless invoke function --function [FUNCTION NAME]
```

### Logs

Open up a separate tab in your console and see logs for a specific function using the following command.

```
serverless logs --function [FUNCTION NAME]
```

### Info

See information about your deployed service by running the `info` command in your service directory.

```
serverless info
```
