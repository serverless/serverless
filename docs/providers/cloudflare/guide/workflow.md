<!--
title: Serverless Framework Guide - Cloudflare Workers - Workflow
menuText: Workflow
menuOrder: 9
description: A guide and cheatsheet containing CLI commands and workflow recommendations.
layout: Doc
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/cloudflare/guide/workflow)

<!-- DOCS-SITE-LINK:END -->

# Cloudflare Workers - Workflow

Generally, Cloudflare Workers can be written locally, deployed with serverless, and tested with the [`serverless invoke`](../cli-reference/invoke.md) command. However, using the [Cloudflare Workers Playground](https://cloudflareworkers.com/#) can help you test and view your worker’s results live if you need more insight while developing your Cloudflare Worker.

Below is a list of general tips for developing Cloudflare Workers with Serverless.

### Development Workflow

Write your functions
Use `serverless deploy` only when you've made changes to `serverless.yml` and in CI/CD systems.
Use `serverless deploy -f myFunction` to rapidly deploy changes when you are working on a specific Cloudflare Workers Function.
Use `serverless invoke -f myFunction` to test your Cloudflare Workers Functions.

### Larger Projects

- For Non-Enterprise Cloudflare customers, combining multiple workers into one file or using [webpack](https://developers.cloudflare.com/workers/writing-workers/using-npm-modules/).
- Keep the Functions and Resources in your Serverless Services to a minimum.

## Cheat Sheet

A handy list of commands to use when developing with the Serverless Framework.

##### Create A Service:

Creates a new Service:

```bash
serverless create -p [SERVICE NAME] -t cloudflare-workers
```

##### Deploy All

Use this when you have made changes to your Functions, Events or Resources in `serverless.yml` or you simply want to deploy all changes within your Service at the same time.

```bash
serverless deploy
```

##### Deploy Function

Use this to quickly overwrite your Cloudflare Workers Functions, allowing you to develop faster if you have an Enterprise account that supports deploying multiple functions.

```bash
serverless deploy -f [FUNCTION NAME]
```

##### Invoke Function

Invokes a Cloudflare Workers Function.

```bash
serverless invoke -f [FUNCTION NAME]
```
