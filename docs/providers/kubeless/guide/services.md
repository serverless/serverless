<!--
title: Serverless Framework - Kubeless Guide - Services
menuText: Services
menuOrder: 4
description: How to manage and configure serverless services, which contain your Kubeless functions and their events.
layout: Doc
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/kubeless/guide/services)

<!-- DOCS-SITE-LINK:END -->

# Kubeless - Services

A `service` in the Serverless Framework is like a project ((not to be confused with [Kubernetes Services](https://kubernetes.io/docs/concepts/services-networking/service/). It's where you define your Kubeless Functions and the `events` that trigger them, all in a file called `serverless.yml`.

To get started building your first Serverless Framework project, create a `service`.

## Organization

In the beginning of an application, many people use a single Service to define all of the Functions and Events. This is what we recommend in the beginning.

```bash
myService/
  serverless.yml  # Contains all functions and infrastructure resources
```

However, as your application grows, you can break it out into multiple services. A lot of people organize their services by workflows or data models, and group the functions related to those workflows and data models together in the service.

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

To create a service, use the `create` command. You must also pass in a runtime (e.g., node.js, python etc.) you would like to write the service in. You can also pass in a path to create a directory and auto-name your service:

```bash
# Create service with the Python template in the folder ./new-project
$ serverless create --template kubeless-python --path new-project
```

Here are the available runtimes for Kubeless using the Serverless plugin:

- kubeless-python
- kubeless-nodejs

Check out the [create command docs](../cli-reference/create) for all the details and options.

## Contents

You'll see the following files in your working directory:

- `serverless.yml`
- `handler.py`
- `package.json`

### serverless.yml

Each `service` configuration is managed in the `serverless.yml` file. The main responsibilities of this file are:

- Declare a Serverless service
- Define one or more functions in the service
  - Define the provider the service will be deployed to (in our case, kubeless)
  - Define any custom plugins to be used (in our case, we will need to use the serverless-kubeless plugin)
  - Define events that trigger each function to execute (e.g. HTTP requests)
  - Allow events listed in the `events` section to automatically create the resources required for the event upon deployment
  - Allow flexible configuration using Serverless Variables

You can see the name of the service, the provider configuration and the first function inside the `functions` definition which points to the `handler.py` file. Any further service configuration will be done in this file.

```yml
# serverless.yml
# This is a serverless framework way to group
# several functions. Not to be confused with K8s services
service: new-project
provider:
  name: kubeless
  runtime: python3.11

plugins:
  - serverless-kubeless

functions:
  # The top name will be the name of the Function object
  # and the K8s service object to get a request to call the function
  hello:
    # The function to call as a response to the HTTP event
    handler: handler.hello
```

### handler.py

The `handler.py` file contains your function code. The function definition in `serverless.yml` will point to this `handler.py` file and the function exported here.

### package.json

The `package.json` file is the npm package definition of our functions with all their dependencies, including the kubeless-serverless plugin.

## Deployment

When you deploy a Service, all of the Functions and Events in your `serverless.yml` are translated into calls to the Kubernetes cluster API to dynamically define those resources.

To deploy a service, use the `deploy` command:

```bash
serverless deploy
```

Check out the [deployment guide](https://serverless.com/framework/docs/providers/kubeless/guide/deploying/) to learn more about deployments and how they work. Or, check out the [deploy command docs](../cli-reference/deploy) for all the details and options.

## Removal

To easily remove your Service from your Kubernetes cluster, you can use the `remove` command.

Run `serverless remove --verbose` to trigger the removal process. As in the deploy step we're also running in the `verbose` mode so you can see all details of the remove process.

Serverless will start the removal and informs you about it's process on the console. A success message is printed once the whole service is removed.

The removal process will only remove the service on your Kubernetes cluster. The service directory will still remain on your local machine so you can still modify and (re)deploy it to the same or a new Kubernetes provider.

## Version Pinning

The Serverless framework is usually installed globally via `npm install -g serverless`. This way you have the Serverless CLI available for all your services.

Installing tools globally has the downside that the version can't be pinned inside package.json. This can lead to issues if you upgrade Serverless, but your colleagues or CI system don't.

### Pinning a Version

To configure version pinning define a `frameworkVersion` property in your serverless.yml. Whenever you run a Serverless command from the CLI it checks if your current Serverless version is matching the `frameworkVersion` range. The CLI uses [Semantic Versioning](http://semver.org/) so you can pin it to an exact version or provide a range. In general we recommend to pin to an exact version to ensure everybody in your team has the exact same setup and no unexpected problems happen.

### Examples

#### Exact Version

```yml
# serverless.yml

frameworkVersion: '2.1.0'

service: users

provider:
  name: kubeless
  runtime: python3.11
…
```

#### Version Range

```yml
# serverless.yml

frameworkVersion: ^2.1.0 # >=2.1.0 && <3.0.0

service: users

provider:
  name: kubeless
  runtime: python3.11

…
```
