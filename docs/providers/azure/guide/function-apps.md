<!--
title: Serverless Framework - Azure Functions Guide - Function Apps
menuText: Function Apps
menuOrder: 4
description: How to manage and configure serverless function apps, which contain your Azure Functions, their events and resources.
layout: Doc
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/azure/guide/function-apps)

<!-- DOCS-SITE-LINK:END -->

# Azure - Function Apps

A `function app` is like a project. It's where you define your Azure Functions, the `events` that trigger them and any `resources` they require, all in a file called `serverless.yml`.

To get started building your first Serverless Framework project, create a `function app`.

## Organization

In the beginning of an application, many people use a single function app to define all of the Functions, Events and Resources for that project. This is what we recommend in the beginning.

```bash
myFunctionApp/
  serverless.yml  # Contains all functions and infrastructure resources
```

However, as your application grows, you can break it out into multiple function apps. A lot of people organize their function apps by workflows or data models, and group the functions related to those workflows and data models together in the function app.

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

To get started, you can simply use the `create` command to generate a new function app:

```bash
serverless create -t azure-nodejs --path <my-app>
```

## Contents

You'll see the following files in your working directory:

- `serverless.yml`
- `hello.js`
- `goodbye.js`

### serverless.yml

Each `function app` configuration is managed in the `serverless.yml` file. The main responsibilities of this file are:

- Declare a function app
- Define one or more functions in the function app
  - Define the provider the function app will be deployed to (and the runtime if provided)
  - Define any custom plugins to be used
  - Define events that trigger each function to execute (e.g. HTTP requests)
  - Allow events listed in the `events` section to automatically create the resources required for the event upon deployment
  - Allow flexible configuration using Serverless Variables

You can see the name of the function app, the provider configuration and the first function inside the `functions` definition which points to the `handler.js` file. Any further function app configuration will be done in this file.

```yml
# serverless.yml

service: azfx-node-http

provider:
  name: azure
  location: West US

plugins:
  - serverless-azure-functions

functions:
  hello:
    handler: hello.handler
    events:
      - http: true
        authLevel: anonymous
      - http: true
        direction: out
          name: res
  goodbye:
    handler: goodbye.handler
    events:
      - http: true
        authLevel: anonymous
      - http: true
        direction: out
        name: res
```

### hello.js and goodbye.js

The `hello/goodbye.js` files contains your function code. There are two functions defined to demonstrate the configuration for multiple functions. These two functions in particular take the name provided as input to HTTP request and respond with "Hello/Goodbye {name}". The function definitions in `serverless.yml` will point to this `hello/goodbye.js` files and the functions exported there.

## Deployment

When you deploy a function app, all of the Functions, and Events in your `serverless.yml` are translated into calls to the platform API to dynamically define those resources.

To deploy a function app, first `cd` into the relevant function app directory:

```bash
cd my-function-app
```

Then use the `deploy` command:

```bash
serverless deploy
```

Check out the [deployment guide](https://serverless.com/framework/docs/providers/azure/guide/deploying/) to learn more about deployments and how they work. Or, check out the [deploy command docs](../cli-reference/deploy) for all the details and options.

## Removal

To easily remove your function app from your Azure Functions account, you can use the `remove` command.

Run `serverless remove -v` to trigger the removal process. As in the deploy step we're also running in the `verbose` mode so you can see all details of the remove process.

Serverless will start the removal and informs you about it's process on the console. A success message is printed once the whole function app is removed.

The removal process removes the entire resource group containing your function app with its ancillary resources.

## Version Pinning

The Serverless framework is usually installed globally via `npm i -g serverless`. This way you have the Serverless CLI available for all your function apps.

Installing tools globally has the downside that the version can't be pinned inside package.json. This can lead to issues if you upgrade Serverless, but your colleagues or CI system don't. You can now use a new feature in your serverless.yml which is available only in the latest version without worrying that your CI system will deploy with an old version of Serverless.

### Pinning a Version

To configure version pinning define a `frameworkVersion` property in your serverless.yaml. Whenever you run a Serverless command from the CLI it checks if your current Serverless version is matching the `frameworkVersion` range. The CLI uses [Semantic Versioning](http://semver.org/) so you can pin it to an exact version or provide a range. In general we recommend to pin to an exact version to ensure everybody in your team has the exact same setup and no unexpected problems happen.

### Examples

#### Exact Version

```yml
# serverless.yml

frameworkVersion: '2.1.0'

…
```

#### Version Range

```yml
# serverless.yml

frameworkVersion: ^2.1.0 # >=2.1.0 && <3.0.0

…
```

## Installing Serverless in an existing function app

If you already have a Serverless function app, and would prefer to lock down the framework version using `package.json`, then you can install Serverless as follows:

```bash
# from within a function app
npm i serverless --save-dev
```
