<!--
title: Serverless Framework - Workers Guide - Quick Start
menuText: Quick Start
menuOrder: 2
description: Getting started with the Serverless Framework on Cloudflare Workers
layout: Doc
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->
### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/cloudflare/guide/quick-start)
<!-- DOCS-SITE-LINK:END -->

# Cloudflare Workers - Quickstart

## Pre-requisites
Node.js `v6.5.0` or later.
Serverless CLI `v1.31.0` or later. You can run `npm install -g serverless` to install it. you also need our `serverless-cloudflare-workers` plugin. You can install it in your project with `npm install --save serverless-cloudflare-workers`.

## Create a new service
Create a new service using either the `cloudflare-workers` or `cloudflare-workers-enterprise` template, depending on your Cloudflare domain’s plan level, and specifying a unique name and an optional path for your service.
 
```bash
# Create a new Serverless Service/Project
$ serverless create --template cloudflare-workers --path new-project
# Change into the newly created directory
$ cd new-project
# Install npm dependencies
$ npm install
```

Note: there are two templates for [Cloudflare Workers](https://www.cloudflare.com/products/cloudflare-workers/): `cloudflare-workers` and `cloudflare-workers-enterprise`. The enterprise template sets up a project that can natively deploy [multiple scripts](https://developers.cloudflare.com/workers/api/config-api-for-enterprise/), each with their own routes. It requires an enterprise Cloudflare account to use.

The `cloudflare-workers` template still supports [conditional routing](https://developers.cloudflare.com/workers/recipes/conditional-routing/) and multiple scripts if you use a tool like [webpack](https://developers.cloudflare.com/workers/writing-workers/using-npm-modules/).

## Deploy, test and diagnose your service

You will need to set your Global API key from Cloudflare as an environmental variable named `CLOUDFLARE_AUTH_KEY`, and your Cloudflare account email as an environmental variable named `CLOUDFLARE_AUTH_EMAIL`. You can get your Global API key from your [Cloudflare profile](https://dash.cloudflare.com/profile) page. You will also need to set `accountId` and `zoneId` in `serverless.yml` under `service.config`. The first part of the path when you open [Cloudflare dashboard](https://dash.cloudflare.com/) as a logged in user is your `accountId`, e.g. `dash.cloudflare.com/{accountId}`. And the `zoneId` can be found from the overview tab after selecting the desired zone from the [Cloudflare dashboard](https://dash.cloudflare.com/).

Environmental variables are variables that live inside your terminal.

For Mac and Linux users, you can set environmental variables like this:

```bash
export CLOUDFLARE_AUTH_KEY=YOUR_API_KEY_HERE
export CLOUDFLARE_AUTH_EMAIL=YOUR_CLOUDFLARE_EMAIL
```

And for Windows (CMD) users, you can set environmental variables like this:

```bash
set CLOUDFLARE_AUTH_KEY=YOUR_API_KEY_HERE
set CLOUDFLARE_AUTH_EMAIL=YOUR_CLOUDFLARE_EMAIL
```

You’ll need to redefine your environmental variables after each time you close your terminal.

1. **Deploy the Service**

Use this when you have made changes to your Functions, Events or Resources in `serverless.yml` or you simply want to deploy all changes within your Service at the same time. If you've made changes to your routes since last deploying, the Serverless Framework will update them on the server for you.
 
```bash
serverless deploy
```

2. **Deploy the Function**

Use this to quickly upload and overwrite your function code, allowing you to develop faster.
 
```bash
serverless deploy -f hello
```

3. **Invoke the Function**

Invokes the Function and returns results.
 
```bash
serverless invoke --function helloWorld

Hello world
```

Your Function must have the `events` field populated in order for the `serverless` tool to know exactly which route to request. Defining the `headers` field is optional.

```yml
# serverless.yml
...
foo:
    name: foo
    script: bar
    events:
      - http:
          url: example.com/foo/bar
          # Defines the method used by serverless when the `invoke` command is used. Cloudflare Workers only support GET requests for now
          method: GET
          headers:
            someKey: someValue
```


## Cleanup
If at any point, you no longer need your service, you can run the following command to remove the Functions, Events and Resources that were created.
 
```bash
serverless remove
```
