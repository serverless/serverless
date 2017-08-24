<!--
title: Serverless Framework - Azure Functions Guide - Services
menuText: Services
menuOrder: 4
description: How to manage and configure serverless services, which contain your Azure Functions, their events and resources.
layout: Doc
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->
### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/azure/guide/services)
<!-- DOCS-SITE-LINK:END -->

# Azure - Services

A `service` is like a project.  It's where you define your Azure Functions, the
`events` that trigger them and any  `resources` they require, all in a file
called `serverless.yml`.

To get started building your first Serverless Framework project, create a
`service`.

## Organization

In the beginning of an application, many people use a single Service to define
all of the Functions, Events and Resources for that project.  This is what we
recommend in the beginning.

```bash
myService/
  serverless.yml  # Contains all functions and infrastructure resources
```

However, as your application grows, you can break it out into multiple services.
A lot of people organize their services by workflows or data models, and group
the functions related to those workflows and data models together in the service.

```bash
users/
  serverless.yml # Contains 4 functions that do Users CRUD operations and the Users database
posts/
  serverless.yml # Contains 4 functions that do Posts CRUD operations and the Posts database
comments/
  serverless.yml # Contains 4 functions that do Comments CRUD operations and the Comments database
```

This makes sense since related functions usually use common infrastructure
resources, and you want to keep those functions and resources together as a
single unit of deployment, for better organization and separation of concerns.

## Creation

To get started, you can simply use the `create` command to generate a new service:

```bash
serverless create -t azure-nodejs --path <my-app>
```

> Alternatively, you can use the `install` command to create a new service, based on an existing GitHub boilerplate: `serverless install --url https://github.com/azure/boilerplate-azurefunctions --name my-app`

## Contents

You'll see the following files in your working directory:
- `serverless.yml`
- `handler.js`

### serverless.yml

Each `service` configuration is managed in the `serverless.yml` file. The main responsibilities of this file are:

- Declare a Serverless service
- Define one or more functions in the service
    - Define the provider the service will be deployed to (and the runtime if provided)
    - Define any custom plugins to be used
    - Define events that trigger each function to execute (e.g. HTTP requests)
    - Allow events listed in the `events` section to automatically create the resources required for the event upon deployment
    - Allow flexible configuration using Serverless Variables

You can see the name of the service, the provider configuration and the first function inside the `functions` definition which points to the `handler.js` file. Any further service configuration will be done in this file.

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
     handler: handler.hello
     events:
       - http: true
         x-azure-settings:
           authLevel : anonymous
```

### handler.js

The `handler.js` file contains your function code. The function definition in
`serverless.yml` will point to this `handler.js` file and the function exported
here.

### event.json

Create this file and add event data so you can invoke your function with the data
via `serverless invoke -p event.json`

## Deployment

When you deploy a Service, all of the Functions, and Events in your
`serverless.yml` are translated into calls to the platform API to dynamically
define those resources.

To deploy a service, first `cd` into the relevant service directory:

```bash
cd my-service
```

Then use the `deploy` command:

```bash
serverless deploy
```

Check out the [deployment guide](https://serverless.com/framework/docs/providers/azure/guide/deploying/)
to learn more about deployments and how they work.  Or, check out the
[deploy command docs](../cli-reference/deploy) for all the details and options.

## Removal

To easily remove your Service from your Azure Functions account, you can use the
`remove` command.

Run `serverless remove -v` to trigger the removal process. As in the deploy step
we're also running in the `verbose` mode so you can see all details of the remove
process.

Serverless will start the removal and informs you about it's process on the
console. A success message is printed once the whole service is removed.

The removal process will only remove the service on your provider's
infrastructure. The service directory will still remain on your local machine so
you can still modify and (re)deploy it to another stage, region or provider later
on.

## Version Pinning

The Serverless framework is usually installed globally via `npm install -g
serverless`. This way you have the Serverless CLI available for all your
services.

Installing tools globally has the downside that the version can't be pinned
inside package.json. This can lead to issues if you upgrade Serverless, but your
colleagues or CI system don't. You can now use a new feature in your
serverless.yml which is available only in the latest version without worrying
that your CI system will deploy with an old version of Serverless.

### Pinning a Version

To configure version pinning define a `frameworkVersion` property in your
serverless.yaml. Whenever you run a Serverless command from the CLI it checks if
your current Serverless version is matching the `frameworkVersion` range. The CLI
uses [Semantic Versioning](http://semver.org/) so you can pin it to an exact
version or provide a range. In general we recommend to pin to an exact version to
ensure everybody in your team has the exact same setup and no unexpected problems
happen.

### Examples

#### Exact Version

```yml
# serverless.yml

frameworkVersion: "=1.0.3"

…
```

#### Version Range

```yml
# serverless.yml

frameworkVersion: ">=1.0.0 <2.0.0"

…
```


## Installing Serverless in an existing service

If you already have a Serverless service, and would prefer to lock down the
framework version using `package.json`, then you can install Serverless as
follows:

```bash
# from within a service
npm install serverless --save-dev
```

### Invoking Serverless locally

To execute the locally installed Serverless executable you have to reference the
binary out of the node modules directory.

Example:
```
node ./node_modules/serverless/bin/serverless deploy
```
