<!--
title: Serverless Framework - AWS Lambda Guide - Services
menuText: Services
menuOrder: 4
description: How to manage and configure serverless services, which contain your AWS Lambda functions, their events and infrastructure resources.
layout: Doc
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->
### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/aws/guide/services)
<!-- DOCS-SITE-LINK:END -->

# Services

A *Service* is like a Project.  It's where you define your AWS Lambda Functions, the Events that trigger them and any AWS infrastructure Resources they require, all in a file called `serverless.yml`.

To get started building your first Serverless Framework project, create a *Service*.

## Organization

In the beginning of an application, many people use a single Service to define all of the Functions, Events and Resources for that project.  This is what we recommend in the beginning.

```bash
myApp/
  serverless.yml  # Contains all functions and infrastructure resources
```

However, as your application grows, you can break it out into multiple services.  A lot of people organize their services by workflows or data models, and group the functions related to those workflows and data models together in the service.

```bash
users/
  serverless.yml  # Contains 4 functions that do Users CRUD operations and the Users database
posts/
  serverless.yml # Contains 4 functions that do Posts CRUD operations and the Posts database
comments/
  serverless.yml # Contains 4 functions that do Comments CRUD operations and the Comments database
```
This makes sense since related functions usually use common infrastructure resources, and you want to keep those functions and resources together as a single unit of deployment, for better organization and separation of concerns.

**Note:** Currently, every service will create a separate REST API on AWS API Gateway.  Due to a limitation with AWS API Gateway, you can only have a custom domain per one REST API.  If you plan on making a large REST API, please make note of this limitation.  Also, a fix is in the works and is a top priority.

## Creation

To create a service, use the `create` command. You must also pass in a runtime (e.g., node.js, python etc.) you would like to write the service in.  You can also pass in a path to create a directory and auto-name your service:

```bash
serverless create --template aws-nodejs --path myService
```

Here are the available runtimes for AWS Lambda:

* aws-nodejs
* aws-python
* aws-java-gradle
* aws-java-maven
* aws-scala-sbt

Check out the [create command docs](../cli-reference/create) for all the details and options.

## Contents

You'll see the following files in your working directory:
- `serverless.yml`
- `handler.js`
- `event.json`

### serverless.yml

Each *Serverless service* configuration is managed in the `serverless.yml` file. The main responsibilities of this file are:

  - Declare a Serverless service
  - Define one or multiple functions in the service
  - Define the provider the service will be deployed to (and the runtime if provided)
  - Define custom plugins to be used
  - Define events that trigger each function to execute (e.g. HTTP requests)
  - Define a set of resources (e.g. 1 AWS CloudFormation stack) required by the functions in this service
  - Allow events listed in the `events` section to automatically create the resources required for the event upon deployment
  - Allow flexible configuration using Serverless Variables

You can see the name of the service, the provider configuration and the first function inside the `functions` definition which points to the `handler.js` file. Any further service configuration will be done in this file.

```yml
# serverless.yml

service: users

provider:
  name: aws
  runtime: nodejs4.3
  memorySize: 512

functions:
  usersCreate: # A Function
    events: # The Events that trigger this Function
      - http: post users/create
  usersDelete: # A Function
    events:  # The Events that trigger this Function
      - http: delete users/delete

# The "Resources" your "Functions" use.  Raw AWS CloudFormation goes in here.
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
        ProvisionedThroughput:
          ReadCapacityUnits: 1
          WriteCapacityUnits: 1
```

Every `serverless.yml` translates to a single AWS CloudFormation template and a CloudFormation stack is created from that resulting CloudFormation template.

### handler.js

The `handler.js` file contains your function code. The function definition in `serverless.yml` will point to this `handler.js` file and the function exported here.

### event.json

This file contains event data you can use to invoke your function with via `serverless invoke -p event.json`

## Deployment

When you deploy a Service, all of the Functions, Events and Resources in your `serverless.yml` are translated to an AWS CloudFormation template and deployed as a single CloudFormation stack.

To deploy a service, use the `deploy` command:

```bash
serverless deploy
```

Deployment defaults to `dev` stage and `us-east-1` region on AWS, unless you specified these elsewhere, or add them in as options:

```bash
serverless deploy --stage prod --region us-east-1
```

Check out the [deployment guide](https://serverless.com/framework/docs/providers/aws/guide/deploying/) to learn more about deployments and how they work.  Or, check out the [deploy command docs](../cli-reference/deploy) for all the details and options.

## Removal

To easily remove your Service from your AWS account, you can use the `remove` command.

Run `serverless remove -v` to trigger the removal process. As in the deploy step we're also running in the `verbose` mode so you can see all details of the remove process.

Serverless will start the removal and informs you about it's process on the console. A success message is printed once the whole service is removed.

The removal process will only remove the service on your provider's infrastructure. The service directory will still remain on your local machine so you can still modify and (re)deploy it to another stage, region or provider later on.
