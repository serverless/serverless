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

A `service` is like a project. It's where you define your AWS Lambda Functions, the `events` that trigger them and any AWS infrastructure `resources` they require, all in a file called `serverless.yml`.

To get started building your first Serverless Framework project, create a `service`.

## Organization

In the beginning of an application, many people use a single Service to define all of the Functions, Events and Resources for that project. This is what we recommend in the beginning.

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
# Create service with nodeJS template in the folder ./myService
serverless create --template aws-nodejs --path myService
```

Here are the available templates for AWS Lambda:

- aws-clojurescript-gradle
- aws-clojure-gradle
- aws-nodejs
- aws-nodejs-typescript
- aws-alexa-typescript
- aws-nodejs-ecma-script
- aws-python
- aws-python3
- aws-ruby
- aws-provided
- aws-kotlin-jvm-maven
- aws-kotlin-nodejs-gradle
- aws-groovy-gradle
- aws-java-gradle
- aws-java-maven
- aws-scala-sbt
- aws-csharp
- aws-fsharp
- aws-go
- aws-go-dep
- aws-go-mod

Check out the [create command docs](../cli-reference/create) for all the details and options.

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
- Define a set of resources (e.g. 1 DynamoDB table) required by the functions in this service
- Allow events listed in the `events` section to automatically create the resources required for the event upon deployment
- Allow flexible configuration using Serverless Variables

You can see the name of the service, the provider configuration and the first function inside the `functions` definition which points to the `handler.js` file. Any further service configuration will be done in this file.

```yml
# serverless.yml

service: users

provider:
  name: aws
  runtime: nodejs12.x
  stage: dev # Set the default stage used. Default is dev
  region: us-east-1 # Overwrite the default region used. Default is us-east-1
  stackName: my-custom-stack-name-${opt:stage, self:provider.stage, 'dev'} # Overwrite default CloudFormation stack name. Default is ${self:service}-${opt:stage, self:provider.stage, 'dev'}
  apiName: my-custom-api-gateway-name-${opt:stage, self:provider.stage, 'dev'} # Overwrite default API Gateway name. Default is ${opt:stage, self:provider.stage, 'dev'}-${self:service}
  profile: production # The default profile to use with this service
  memorySize: 512 # Overwrite the default memory size. Default is 1024
  deploymentBucket:
    name: com.serverless.${self:provider.region}.deploys # Overwrite the default deployment bucket
    serverSideEncryption: AES256 # when using server-side encryption
    tags: # Tags that will be added to each of the deployment resources
      key1: value1
      key2: value2
  deploymentPrefix: serverless # Overwrite the default S3 prefix under which deployed artifacts should be stored. Default is serverless
  versionFunctions: false # Optional function versioning
  stackTags: # Optional CF stack tags
    key: value
  stackPolicy: # Optional CF stack policy. The example below allows updates to all resources except deleting/replacing EC2 instances (use with caution!)
    - Effect: Allow
      Principal: '*'
      Action: 'Update:*'
      Resource: '*'
    - Effect: Deny
      Principal: '*'
      Action:
        - Update:Replace
        - Update:Delete
      Resource: '*'
      Condition:
        StringEquals:
          ResourceType:
            - AWS::EC2::Instance

functions:
  usersCreate: # A Function
    handler: users.create
    events: # The Events that trigger this Function
      - http: post users/create
  usersDelete: # A Function
    handler: users.delete
    events: # The Events that trigger this Function
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

**Note:** This file is not created by default

Create this file and add event data so you can invoke your function with the data via `serverless invoke -p event.json`

## Deployment

When you deploy a Service, all of the Functions, Events and Resources in your `serverless.yml` are translated to an AWS CloudFormation template and deployed as a single CloudFormation stack.

To deploy a service, first `cd` into the relevant service directory:

```bash
cd my-service
```

Then use the `deploy` command:

```bash
serverless deploy
```

Deployment defaults to `dev` stage and `us-east-1` region on AWS, unless you specified these elsewhere, or add them in as options:

```bash
serverless deploy --stage prod --region us-east-1
```

Check out the [deployment guide](https://serverless.com/framework/docs/providers/aws/guide/deploying/) to learn more about deployments and how they work. Or, check out the [deploy command docs](../cli-reference/deploy) for all the details and options.

## Removal

To easily remove your Service from your AWS account, you can use the `remove` command.

Run `serverless remove -v` to trigger the removal process. As in the deploy step we're also running in the `verbose` mode so you can see all details of the remove process.

Serverless will start the removal and informs you about its process on the console. A success message is printed once the whole service is removed.

The removal process will only remove the service on your provider's infrastructure. The service directory will still remain on your local machine so you can still modify and (re)deploy it to another stage, region or provider later on.

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
  runtime: nodejs12.x
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
  runtime: nodejs12.x
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
