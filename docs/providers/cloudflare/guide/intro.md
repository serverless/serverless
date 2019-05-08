<!--
title: Serverless Framework - Cloudflare Workers Guide - Introduction
menuText: Intro
menuOrder: 1
description: An introduction to using Cloudflare Workers with the Serverless Framework.
layout: Doc
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->
### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/cloudflare/guide/intro)
<!-- DOCS-SITE-LINK:END -->


# Cloudflare Workers - Introduction

The Serverless Framework helps you develop and deploy serverless applications using [Cloudflare Workers](https://www.cloudflare.com/products/cloudflare-workers/). It's a CLI that offers structure, automation, and best practices out-of-the-box, allowing you to focus on building sophisticated, event-driven, serverless architectures, comprised of [Functions](#functions) and [Events](#events). It lets you manage your Worker routing in a flat configuration file that you can keep in alongside the rest of your code in version control, and the Serverless Framework will intelligently manage your routes as they change.
 
The Serverless Framework is different than other application frameworks because:
* It manages your code as well as your infrastructure
* It supports multiple languages (Although Cloudflare Workers only supports Javascript for now)

## Core Concepts
Here are the Serverless Framework's main concepts and how they pertain to Cloudflare Workers.
 
### Functions
A Function is a Cloudflare Worker. It's an independent unit of deployment, like a microservice. It's merely code, deployed on Cloudflare’s 152+ PoPs (points of presence), that is most often written to perform a single job, such as:
* *Performing A/B Testing*
* *Custom routing based on user location, custom headers, etc.*
* *Hosting webhook endpoints*
 
### Events
Anything that triggers a Cloudflare Worker Event to execute is regarded by the Framework as an **Event**. The only event that triggers a Cloudflare Worker is an HTTP request. Since the only event that can trigger a Worker is an HTTP request, declaring events is optional, and only used to declare specific endpoints that can be called by [`serverless invoke`](../cli-reference/invoke.md). This is useful for defining specific hooks into your application for testing.
 
### Services
A **Service** is the Serverless Framework's unit of organization. You can think of it as a project file, though you can have multiple services for a single application. It's where you define your Functions and the routes they will live on, all in one file entitled `serverless.yml`. Non-Enterprise Cloudflare accounts can only deploy one function (that can be deployed to multiple routes), while Enterprise Cloudflare accounts can deploy multiple functions at once: 

```yml
# serverless.yml

service:
    name: hello-world
    config:
      accountId: CLOUDFLARE_ACCOUNT_ID 
      zoneId: CLOUDFLARE_ZONE_ID 

provider:
  name: cloudflare

plugins:
  - serverless-cloudflare-workers

functions:
  helloWorld:
    # What the script will be called on Cloudflare (this property value must match the function name one line above)
    name: helloWorld
    # The name of the script on your machine, omitting the .js file extension
    script: helloWorld
    # Events are only relevant to the `serverless invoke` command and don’t affect deployment in any way
    events:
      - http:
          url: example.com/hello/*
          # Defines the method used by serverless when the `invoke` command is used. Cloudflare Workers only support GET requests for now
          method: GET
          headers:
            someKey: someValue


  # Only Enterprise accounts would be allowed to add this second function and its corresponding route above
  foo:
    name: foo
    script: bar
    events:
      - http:
          url: example.com/foo/*
          method: GET
```

You get your `accountId` by grabbing it from the URL when using the [Cloudflare dashboard](https://dash.cloudflare.com), and your `zoneId` from the `overview` tab after selecting the desired zone from the [Cloudflare dashboard](https://dash.cloudflare.com).

You will also need to set your Global API key from Cloudflare as an environmental variable named `CLOUDFLARE_AUTH_KEY`, and your Cloudflare account email as an environmental variable named `CLOUDFLARE_AUTH_EMAIL`. You can get your Global API key from your [Cloudflare profile](https://dash.cloudflare.com/profile) page.

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

If you’re not an enterprise customer and you want to execute different code on multiple routes with only one function, we recommend writing code based off of our [conditional routing](https://developers.cloudflare.com/workers/recipes/conditional-routing/) template to check your route and execute different code accordingly. You can also write workers in separate files and compile it into one worker with [webpack](https://developers.cloudflare.com/workers/writing-workers/using-npm-modules/).

When you deploy with the Framework by running `serverless deploy`, everything in `serverless.yml` is deployed at once.

### Plugins

You can overwrite or extend the functionality of the Framework using **Plugins**.
Every `serverless.yml` can contain a `plugins:` property, which features multiple
plugins.

```yml
# serverless.yml

plugins:
  - serverless-cloudflare-workers
  - serverless-another-plugin
```

You can add our `serverless-cloudflare-workers` plugin to your project by running `npm install --save serverless-cloudflare-workers`.
