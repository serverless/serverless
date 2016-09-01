<!--
title: Building Serverless Provider Integrations
description: todo
layout: Page
-->

# Building provider integrations

Integrating different infrastructure providers happens through the standard plugin system.
Take a look at the ["building plugins"](./building-plugins.md) documentation to understand how the plugin system works.

## Provider specific plugins

You can add the providers name inside the constructor of your plugin. This makes it possible to only execute your plugins logic when the Serverless service uses the provider you've specified in your plugin.

## Deployment

Infrastructure provider plugins should bind to specific lifecycle events of the `deploy` command to compile the function and their events to provider specific resources.

### Deployment lifecycle

Let's take a look at the [core `deploy` plugin](/lib/plugins/deploy) and the different lifecycle hooks it provides.

The following lifecycle events are run in order once the user types `serverless deploy` and hits enter:

- `deploy:initialize`
- `deploy:setupProviderConfiguration`
- `deploy:compileFunctions`
- `deploy:compileEvents`
- `deploy:createDeploymentArtifacts`
- `deploy:deploy`

Plugin developers can hook into those lifecycle events to compile and deploy functions and events on your providers infrastructure.

Let's take a closer look at each lifecycle event to understand what its purpose is and what it should be used for.

#### `deploy:initialize`

This lifecycle should be used to load the basic resources the provider needs into memory (e.g. parse a basic resource
template skeleton such as a CloudFormation template).

#### `deploy:setupProviderConfiguration`

The purpose of the `deploy:setupProviderConfiguration` lifecycle is to take the basic resource template which was created in the previous lifecycle and deploy the rough skeleton on the cloud providers infrastructure (without any functions or events) for the first time.

#### `deploy:createDeploymentArtifacts`

The whole service get's zipped up into one .zip file.

Serverless will automatically exclude the following files / folders to reduce the size of the .zip file:

- .git
- .gitignore
- .serverless
- serverless.yaml
- serverless.yml
- serverless.env.yaml
- serverless.env.yml
- .DS_Store

You can always include previously excluded files and folders if you want to.

#### `deploy:compileFunctions`

Next up the functions inside the [`serverless.yml`](./serverless-yml.md) file should be compiled to provider specific resources and stored into memory.

#### `deploy:compileEvents`

After that the events which are defined in the [`serverless.yml`](./serverless-yml.md) file on a per function basis should be compiled to provider specific resources and also stored into memory.

#### `deploy:deploy`

The final lifecycle is the `deploy:deploy` lifecycle which should be used to deploy the previously compiled function and event resources to the providers infrastructure.

### Amazon Web Services provider integration

Curious how this works for the Amazon Web Services (AWS) provider integration?

Here are the steps the AWS plugins take to compile and deploy the service on the AWS infrastructure in detail.

#### The steps in detail

1. The [`serverless.yml`](./serverless-yml.md) and
[`serverless.env.yml`](../understanding-serverless/serverless-env-yml.md) files are loaded into memory
2. A default AWS CloudFormation template is loaded and deployed to AWS (A S3 bucket for the service gets created)(`deploy:setupProviderConfiguration`)
3. The functions of the [`serverless.yml`](./serverless-yml.md) file are compiled to lambda resources and stored into memory (`deploy:compileFunctions`)
4. Each functions events are compiled into CloudFormation resources and stored into memory (`deploy:compileEvents`)
5. Old functions (if available) are removed from the S3 bucket (`deploy:deploy`)
6. The service gets zipped up and is uploaded to S3 (`deploy:createDeploymentArtifacts` and `deploy:deploy`)
7. The compiled functions, event resources and custom provider resources are attached to the core CloudFormation template and the updated CloudFormation template gets redeployed (`deploy:deploy`)

#### The code

You may also take a closer look at the corresponding plugin code to get a deeper knowledge about what's going on behind the scenes.

The full AWS integration can be found in [`lib/plugins/aws`](/lib/plugins/aws).
