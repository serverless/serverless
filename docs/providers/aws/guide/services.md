<!--
title: Serverless Framework Services
description: How to manage and configure serverless services, which contain your AWS Lambda functions, their events and infrastructure resources.
layout: Doc
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/aws/guide/services)

<!-- DOCS-SITE-LINK:END -->

# Serverless Framework Services

A service, aka a project, is the Framework's unit of organization.

A service is configured via a `serverless.yml` file where you define your functions, the events that trigger them, and the AWS resources to deploy. For example:

```yml
service: users

provider:
  # Configuration of the cloud provider
  name: aws

functions:
  # The functions to deploy
  usersCreate:
    events:
      - httpApi: 'POST /users/create'
  usersDelete:
    events:
      - httpApi: 'DELETE /users/delete'

plugins:
  # Plugins to enable

resources:
  # Additional AWS resources to deploy
```

To create a new service, run the `serverless` command and check out the [Getting started guide](../../../getting-started.md#getting-started).

## Organization

In the beginning of an application, many people use a single service to define all functions, events and resources for that project. This is what we recommend in the beginning.

```bash
my-service/
  # Contains all functions and infrastructure resources
  serverless.yml
```

However, as an application grows, you can break it out into multiple services. A lot of people organize their services by workflows or data models, and group the functions related to those workflows and data models together in the service.

```bash
users/
  # Contains 4 functions that do Users CRUD operations and the Users database
  serverless.yml
posts/
  # Contains 4 functions that do Posts CRUD operations and the Posts database
  serverless.yml
comments/
  # Contains 4 functions that do Comments CRUD operations and the Comments database
  serverless.yml
```

This makes sense since related functions usually use common infrastructure resources, and you want to keep those functions and resources together as a single unit of deployment, for better organization and separation of concerns.

To orchestrate and deploy multiple services, check out the ["Composing services" documentation](../../../guides/compose.md).

## Contents

You'll see the following files in your working directory:

- `serverless.yml`
- `handler.js`

### serverless.yml

Each `service` configuration is managed in the `serverless.yml` file. The main responsibilities of this file are:

- Declare a serverless service
- Define the cloud provider the service will be deployed to
- Define one or more functions
- Define the events that trigger each function (e.g. HTTP requests)
- Define any plugin to use
- Define a set of AWS resources to create
- Allow events listed in the `events` section to automatically create the resources required for the event upon deployment
- Allow flexible configuration using [variables](./variables.md)

You can see the name of the service, the provider configuration and the first function inside the `functions` definition which points to the `handler.js` file. Any further service configuration will be done in this file.

```yml
# serverless.yml
service: users

provider:
  name: aws
  runtime: nodejs14.x
  stage: dev # Set the default stage used. Default is dev
  region: us-east-1 # Overwrite the default region used. Default is us-east-1
  profile: production # The default profile to use with this service
  memorySize: 512 # Overwrite the default memory size. Default is 1024

functions:
  usersCreate: # A function
    handler: users.create
    events: # The events that trigger this function
      - httpApi: 'POST /users/create'
  usersDelete: # A function
    handler: users.delete
    events: # The events that trigger this function
      - httpApi: 'DELETE /users/delete'

# The "Resources" your "Functions" use. Raw AWS CloudFormation goes in here.
resources:
  Resources:
    usersTable:
      Type: AWS::DynamoDB::Table
      Properties:
        TableName: usersTable
        AttributeDefinitions:
          - AttributeName: email
            AttributeType: S
        KeySchema:
          - AttributeName: email
            KeyType: HASH
        BillingMode: PAY_PER_REQUEST
```

## Deployment

When you deploy a service, all functions, events and resources in `serverless.yml` are translated to an AWS CloudFormation template and deployed as a single CloudFormation stack.

To deploy a service, run the `deploy` command in the same directory as `serverless.yml`:

```bash
serverless deploy
```

Deployment defaults to `dev` stage and `us-east-1` region on AWS. You can deploy to a different stage or region via CLI options:

```bash
serverless deploy --stage prod --region us-east-1
```

Check out the [deployment guide](https://serverless.com/framework/docs/providers/aws/guide/deploying/) to learn more about deployments and how they work. Or, check out the [`deploy` command reference](../cli-reference/deploy) to see all the options available.

## Removal

To easily remove your service from your AWS account, you can use the `serverless remove` command.

The removal process will only remove the service on your provider's infrastructure (including all the resources mentioned in `serverless.yml`). The service directory will still remain on your local machine, so you can still modify and (re)deploy it to another stage, region or provider later on.

## Version Pinning

The Serverless Framework is usually installed globally via `npm install -g serverless`. This way you have the Serverless CLI available for all your services.

Installing tools globally has the downside that the version can't be pinned inside package.json. This can lead to issues if you upgrade Serverless, but your colleagues or CI system don't. You can now use a new feature in your serverless.yml which is available only in the latest version without worrying that your CI system will deploy with an old version of Serverless.

### Pinning a Version

To configure version pinning define a `frameworkVersion` property in your serverless.yaml. Whenever you run a Serverless command from the CLI it checks if your current Serverless version is matching the `frameworkVersion` range. The CLI uses [Semantic Versioning](http://semver.org/) so you can pin it to an exact version or provide a range. In general we recommend to pin to an exact version to ensure everybody in your team has the exact same setup and no unexpected problems happen.

### Examples

#### Exact Version

```yml
# serverless.yml

frameworkVersion: '2.1.0'

service: users

provider:
  name: aws
  runtime: nodejs14.x
  memorySize: 512

…
```

#### Version Range

```yml
# serverless.yml

frameworkVersion: "^2.1.0" # >=2.1.0 && <3.0.0

service: users

provider:
  name: aws
  runtime: nodejs14.x
  memorySize: 512

…
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
