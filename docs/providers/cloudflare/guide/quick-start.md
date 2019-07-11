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

# Quick Start

This guide is a walk through of using the Serverless Plugin to deploy Cloudflare Workers to a zone already proxied on Cloudflare.

_Note:`workers.dev` domains are not currently supported using Serverless, but you can track our progress on [this Github issue](https://github.com/cloudflare/serverless-cloudflare-workers/issues/36)._

## Pre-requisites

Node.js `v10.X` or later.
Serverless CLI `v1.31.0` or later. You can run `npm install -g serverless` to install it. you also need our `serverless-cloudflare-workers` plugin. You can install it in your project with `npm install --save serverless-cloudflare-workers`.

## Create a new service

To create a new service, you can use the `cloudflare-workers` template. Optionally specify a unique name and an optional path for your service.

```bash
# Create a new Serverless Service/Project
$ serverless create --template cloudflare-workers --path new-project
# Change into the newly created directory
$ cd new-project
# Install npm dependencies
$ npm install
```

# Setup

### Config

To deploy, you will need either the environment variables set or manually input the `accountId` and `zoneId` in your `serverless.yml` according to the _zone_ you wish the Worker(s) to deploy to.

```yaml
# serverless.yml
service:
  name: hello
  config:
    accountId: ${env:CLOUDFLARE_ACCOUNT_ID}
    zoneId: ${env:CLOUDFLARE_ZONE_ID}
  functions:
    functionName:
      worker: scriptName
      script: filename
      events: ...
```

Configure the [functions](#function) according to your specific routing and naming conventions or leave `functions` as is from what the template generated. When you deploy with the Framework by running `serverless deploy`, everything in `serverless.yml` will be deployed at once.

### Environment Variables

You will need to set your Global API key from Cloudflare as an environmental variable named `CLOUDFLARE_AUTH_KEY`, and your Cloudflare account email as an environmental variable named `CLOUDFLARE_AUTH_EMAIL`. See: [How to find your API keys](https://support.cloudflare.com/hc/en-us/articles/200167836)

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

You’ll need to redefine your environmental variables each time you open a new terminal.

## Write Code

With the setup all complete we can get to the good stuff of writing code. The path to the file at which you write your Worker is expected to live in what's configured in the `serverless.yml` under `service.functions.someName.script`. In this file you can set the fetch event listener and [write Worker code in Javascript](https://developers.cloudflare.com/workers/writing-workers/).

`serverless.yaml`:

```
service:
    name: hello
    config:..
    functions:
      someName:
        worker: scriptName
        script: path/filename
        events: ...
```

`path/filename.js`:

```
addEventListener('fetch', event => {
  event.respondWith(helloWorld(event.request))
})

async function helloWorld(request) {
  return new Response('hello world')
}
```

_Note: Serverless plugin omits the extension `.js` in the `serverless.yml` file when referring to what script to run_

## Deploy, test and diagnose your service

1. **Deploy the Service**

To have the Worker(s) deployed globally run:

```bash
serverless deploy
```

You can use this when you have made changes to your Functions, Events or Resources in `serverless.yml` or when you simply want to deploy all changes within your Service at the same time. If you've made changes to your routes since last deploying, the Serverless Framework will update them on the server for you.

2. **Deploy the Function**

Use this to quickly upload and overwrite your function code, allowing you to develop faster.

```bash
serverless deploy -f someName
```

3. **Invoke the Function**

Invokes the Function and returns results.

```bash
serverless invoke --function helloWorld

Hello world
```

Your Function must have the `events` field populated in order for the `serverless` tool to know exactly which route to request.

```yml
# serverless.yml
---
foo:
  name: foo
  script: bar
  events:
    - http:
        url: example.com/foo/bar
        # Defines the method used by serverless when the `invoke` command is used. Cloudflare Workers only support GET requests for now
        method: GET
```

## Cleanup

If at any point, you no longer need your service, you can run the following command to remove the Functions, Events and Resources that were created.

```bash
serverless remove
```
