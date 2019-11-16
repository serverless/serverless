<!--
title: Serverless Framework - Cloudflare Workers Guide - Deploying
menuText: Deploying
menuOrder: 7
description: How to deploy your Cloudflare Workers functions and their required infrastructure
layout: Doc
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/cloudflare/guide/deploying)

<!-- DOCS-SITE-LINK:END -->

# Cloudflare Workers - Deploying

The Serverless Framework was designed to provision your Cloudflare Workers Functions and Events. It does this via a couple of methods designed for different types of deployments.

## prerequisites

In order to deploy your Cloudflare Worker, you need to set your Cloudflare email as an environmental variable called `CLOUDFLARE_AUTH_EMAIL`, and your Cloudflare Global API Key as an environmental variable called `CLOUDFLARE_AUTH_KEY`. You will also need to set `accountId` and `zoneId` in `serverless.yml` under `service.config`. The first part of the path when you open [Cloudflare dashboard](https://dash.cloudflare.com/) as a logged in user is your `accountId`, e.g. `dash.cloudflare.com/{accountId}`. And the `zoneId` can be found from the overview tab after selecting the desired zone from the [Cloudflare dashboard](https://dash.cloudflare.com/).

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

## Deploy All

This is the main method for doing deployments with the Serverless Framework:

```bash
serverless deploy
```

Use this method when you have updated your Function, Event or Resource configuration in `serverless.yml` and you want to deploy that change (or multiple changes at the same time) to your Cloudflare Worker. If you've made changes to any of your routes since last deploying, the Serverless Framework will update them on the server for you.

**Note:** You can specify a different configuration file name with the the `--config` option.

### How It Works

The Serverless Framework reads in `serverless.yml` and uses it to provision your Functions.

For each defined Function in your `serverless.yml` file, the Framework will create a Cloudflare Workers script. This means that only enterprise customers can declare more than one Function, but anyone can use [webpack](https://developers.cloudflare.com/workers/writing-workers/using-npm-modules/) to package their application into a single script.

For example, let's take the following example `serverless.yml` file:

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
    # Events are optional to declare and only affect the `serverless invoke` command
    events:
      - http:
          url: example.com/hello/*
          method: GET
          headers:
            greeting: hi

  # Only Enterprise accounts would be allowed to add this second function
  foo:
    name: foo
    script: bar
    events:
      - http:
          url: example.com/foo/*
          method: GET
```

After deploying that file, you’ll be able to hit the specified top-level routes of your zone, `example.com/hello/*` and `example.com/foo/*`, and any endpoints that resolve to these routes, like `example.com/hello/user` and `example.com/foo/bar`.

## Deploy Function

This deployment method updates or deploys a single function. It performs the platform API call to deploy your package without the other resources. It is much faster than re-deploying your whole service each time.

```bash
serverless deploy --function myFunction
```

If you've made changes to the routes corresponding to this Function since last deploying, the Serverless Framework will update them on the server for you.

### Tips

Check out the [deploy command docs](../cli-reference/deploy.md) for all details and options.
