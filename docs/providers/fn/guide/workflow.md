<!--
title: Serverless Framework Guide - Fn - Workflow
menuText: Workflow
menuOrder: 9
description: A guide and cheatsheet containing CLI commands and workflow recommendations.
layout: Doc
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/fn/guide/workflow)

<!-- DOCS-SITE-LINK:END -->

# Fn - Workflow

Intro. Quick recommendations and tips for various processes.

### Development Workflow

1. Write your functions
2. Use `serverless deploy` only when you've made changes to `serverless.yml` and in CI/CD systems.
3. Use `serverless deploy -f myFunction` to rapidly deploy changes when you are working on a specific Fn Function.
4. Use `serverless invoke -f myFunction -l` to test your Fn Functions.
5. Write tests to run locally.

### Larger Projects

- Break your application/project into multiple Serverless Services.
- Model your Serverless Services around Data Models or Workflows.
- Keep the Functions and Resources in your Serverless Services to a minimum.

## Cheat Sheet

A handy list of commands to use when developing with the Serverless Framework.

##### Create A Service:

Creates a new Service

```
serverless create -p [SERVICE NAME] -t fn-nodejs
```

```
serverless create -p [SERVICE NAME] -t fn-go
```

##### Deploy All

Use this when you have made changes to your Functions, Events or Resources in `serverless.yml` or you simply want to deploy all changes within your Service at the same time.

```
serverless deploy
```

##### Deploy Function

Use this to quickly overwrite your Fn Functions, allowing you to develop faster.

```
serverless deploy -f [FUNCTION NAME]
```

##### Invoke Function

Invokes an Fn Function and returns logs.

```
serverless invoke -f [FUNCTION NAME] -l
```

##### Streaming Logs

Open up a separate tab in your console and stream all logs for a specific Function using this command.

```
serverless logs -f [FUNCTION NAME]
```
