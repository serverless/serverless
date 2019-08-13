<!--
title: Serverless Framework - Fn Guide - Deploying
menuText: Deploying
menuOrder: 7
description: How to deploy your Fn functions and their required infrastructure
layout: Doc
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/fn/guide/deploying)

<!-- DOCS-SITE-LINK:END -->

# Fn - Deploying

The Serverless Framework was designed to provision your Fn Functions and Events. It does this via a couple of methods designed for different types of deployments.

## Deploy All

This is the main method for doing deployments with the Serverless Framework:

```bash
serverless deploy
```

Use this method when you have updated your Function, Event or Resource configuration in `serverless.yml` and you want to deploy that change (or multiple changes at the same time) to your Fn cluster.

**Note:** You can specify a different configuration file name with the the `--config` option.

### How It Works

The Serverless Framework translates all syntax in `serverless.yml` to [Fn](https://github.com/fnproject/fn) calls to provision your Functions.

For each function in your `serverless.yml` file, Fn will create an Fn Function.

For example, let's take the following example `serverless.yml` file:

```yaml
service: hello-world

functions: # Your "Functions"
  hello:
    name: hi
    version: 0.0.1
    runtime: go
    events:
      - http:
          path: /hello
```

When deploying that file FN will provide you with one endpoint that you can hit at: `FN_API_URL/r/hello-world/hello`

## Deploy Function

This deployment method updates or deploys a single function. It performs the platform API call to deploy your package without the other resources. It is much faster than redeploying your whole service each time.

```bash
serverless deploy --function myFunction
```

### Tips

Check out the [deploy command docs](../cli-reference/deploy.md) for all details and options.
