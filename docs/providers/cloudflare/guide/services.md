<!--
title: Serverless Framework - Cloudflare Workers Guide - Services
menuText: Services
menuOrder: 4
description: How to manage and configure Serverless services, which contain your Cloudflare Workers and their events.
layout: Doc
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/cloudflare/guide/services)

<!-- DOCS-SITE-LINK:END -->

# Cloudflare Workers - Services

A `service` is like a project. It's where you define your Cloudflare Workers and the `events` you test them with, all in a file called `serverless.yml`.

To get started building your first Serverless Framework project, create a `service`.

## Organization

In the beginning of an application created by a team with an Enterprise Cloudflare account, and for the lifespan of an application made by a team with a Non-Enterprise Cloudflare account, we recommend you use a single Service to define all of the Functions and Events for that project.

```bash
myService/
 serverless.yml  # Contains all functions and infrastructure resources
```

However, as your application grows as an Enterprise Cloudflare user, you can break it out into multiple services. A lot of people organize their services by workflows or data models, and group the functions related to those workflows and data models together in the service.

```bash
users/
 serverless.yml # Contains 4 functions that do Users CRUD operations and the Users database
posts/
 serverless.yml # Contains 4 functions that do Posts CRUD operations and the Posts database
comments/
 serverless.yml # Contains 4 functions that do Comments CRUD operations and the Comments database
```

This makes sense since related functions usually use common infrastructure resources, and you want to keep those functions and resources together as a single unit of deployment, for better organization and separation of concerns.

## Creation

To create a service, use the `create` command. You can also pass in a path to create a directory and auto-name your service:

```bash
# Create service with cloudflare-workers template in the folder ./my-service
serverless create --template cloudflare-workers --path my-service
```

Here are the available runtimes for Cloudflare Workers:

- cloudflare-workers
- cloudflare-workers-enterprise
- cloudflare-workers-rust

Check out the [create command docs](../cli-reference/create) for all the details and options.

## Contents

You'll see the following files in your working directory:

- `serverless.yml`
- `helloWorld.js`

### serverless.yml

Each `service` configuration is managed in the `serverless.yml` file. The main responsibilities of this file are:

- Declare a Serverless service
- Define one or more functions in the service
- Define the provider the service will be deployed to
- Define any custom plugins to be used
- Define events that trigger each function to execute (e.g. HTTP requests)
- Allow events listed in the `events` section to automatically create the resources required for the `serverless invoke` command

You can see the name of the service, the provider configuration and the first function inside the `functions` definition. Any further service configuration will be done in this file.

```yml
# serverless.yml

service:
  name: hello-world

provider:
  name: cloudflare
  config:
    accountId: CLOUDFLARE_ACCOUNT_ID
    zoneId: CLOUDFLARE_ZONE_ID

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
          url: example.com/hello/user
          method: GET
          headers:
            someKey: someValue

  # Only Enterprise accounts would be allowed to add this second function and its corresponding route above
  foo:
    name: foo
    script: bar
    events:
      - http:
          url: example.com/foo/bar
          method: GET
```

### helloWorld.js

The `helloWorld.js` file contains a barebones Cloudflare Worker that returns ‘hello world’.

## Deployment

When you deploy a Service, all of the Functions, and Events in your `serverless.yml` are translated into calls to Cloudflare to create your Cloudflare Worker(s).

To deploy a service, first `cd` into the relevant service directory:

```bash
cd my-service
```

Then use the `deploy` command:

```bash
serverless deploy
```

Check out the [deployment guide](./deploying.md) to learn more about deployments and how they work. Or, check out the [deploy command docs](../cli-reference/deploy.md) for all the details and options.

## Removal

To easily remove your Service from Cloudflare’s data centers, you can use the `remove` command.

Run `serverless remove` to trigger the removal process.

Serverless will start the removal and informs you about it's process on the console. A success message is printed once the whole service is removed.

The removal process will only remove the service on your provider's infrastructure. The service directory will still remain on your local machine so you can still modify and (re)deploy it to another stage, region or provider later on.

## Version Pinning

The Serverless framework is usually installed globally via `npm install -g serverless`. This way you have the Serverless CLI available for all your services.

Installing tools globally has the downside that the version can't be pinned inside package.json. This can lead to issues if you upgrade Serverless, but your colleagues or CI system don't. You can use a feature in your serverless.yml without worrying that your CI system will deploy with an old version of Serverless.

### Pinning a Version

To configure version pinning define a `frameworkVersion` property in your serverless.yaml. Whenever you run a Serverless command from the CLI it checks if your current Serverless version is matching the `frameworkVersion` range. The CLI uses [Semantic Versioning](http://semver.org/) so you can pin it to an exact version or provide a range. In general we recommend to pin to an exact version to ensure everybody in your team has the exact same setup and no unexpected problems happen.

### Examples

#### Exact Version

```yml
# serverless.yml

frameworkVersion: '2.1.0'
```

#### Version Range

```yml
# serverless.yml

frameworkVersion: ^2.1.0 # >=2.1.0 && <3.0.0
```

## Installing Serverless in an existing service

If you already have a Serverless service, and would prefer to lock down the framework version using `package.json`, then you can install Serverless as follows:

```bash
# from within a service
npm install serverless --save-dev
```

### Invoking Serverless locally

To execute the locally installed Serverless executable you have to reference the binary out of the node modules directory.

Example:

```
node ./node_modules/serverless/bin/serverless deploy
```
