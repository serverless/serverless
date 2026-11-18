<!--
title: Serverless Framework Services
description: What a Serverless Framework service is, what its serverless.yml holds, how to split an application into services, and how to deploy, remove and pin one.
short_title: Services
keywords:
  [
    'Serverless Framework',
    'serverless service',
    'serverless.yml',
    'frameworkVersion',
    'stages',
  ]
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/aws/guide/services)

<!-- DOCS-SITE-LINK:END -->

# Serverless Framework Services

A service is the Serverless Framework's unit of deployment: one `serverless.yml` file, the code next to it, and everything the file declares (functions, the events that trigger them, and other AWS resources). Each deploy of a service to a stage and Region creates or updates the service's AWS CloudFormation stack (a few options, such as an external stack for alerts, add stacks of their own).

A service with two functions behind an HTTP API:

```yaml
# serverless.yml
service: users

provider:
  name: aws
  runtime: nodejs24.x

functions:
  usersCreate:
    handler: users.create
    events:
      - httpApi: 'POST /users/create'
  usersDelete:
    handler: users.delete
    events:
      - httpApi: 'DELETE /users/delete'
```

To create a service from a template, run `serverless` in an empty directory (see [Getting started](../../../getting-started.md#create-a-service)). A service created from a template contains `serverless.yml` and the function code, for example `handler.js`; the files depend on the template.

## serverless.yml

`serverless.yml` declares the service. It can also be written as `serverless.yaml`, `serverless.json`, `serverless.toml`, `serverless.js` (or `.cjs`, `.mjs`) or `serverless.ts`; see [Serverless Framework concepts: Services](./intro.md#services). Its main top-level keys:

- `service`: the service name, used in the stack name and in resource names.
- `provider`: the AWS settings that apply service-wide, such as `runtime`, `stage`, `region`, `profile` and defaults for every function.
- `functions`: the [Lambda functions](./functions.md) and their [events](./events.md). Events that need an AWS resource, such as an HTTP API, create it on deploy.
- `resources`: extra AWS resources in CloudFormation syntax (see [AWS infrastructure resources](./resources.md)).
- `plugins`: [plugins](../../../guides/plugins/README.md) that extend the Framework.
- `stages`: settings per stage (see [Stage-specific configuration](#stage-specific-configuration)).

Values can come from [variables](../../../guides/variables/README.md), such as `${sls:stage}` or `${env:NAME}`. [serverless.yml reference](./serverless.yml.md) lists every key.

```yaml
# serverless.yml
service: users

provider:
  name: aws
  runtime: nodejs24.x
  stage: dev # default dev
  region: us-east-1 # default us-east-1
  profile: production # AWS profile for this service
  memorySize: 512 # default 1024

functions:
  usersCreate:
    handler: users.create
    events:
      - httpApi: 'POST /users/create'

# Raw AWS CloudFormation resources
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

## Organize an application into services

A new application often starts as one service that holds all its functions, events and resources:

```text
my-service/
  serverless.yml # all functions and resources
```

As the application grows, split it into several services, for example one per workflow or data model, each with the functions and resources that change together:

```text
users/
  serverless.yml # users CRUD functions and the users table
posts/
  serverless.yml # posts CRUD functions and the posts table
comments/
  serverless.yml # comments CRUD functions and the comments table
```

Each service deploys as its own stack. To deploy several services together and pass outputs between them, use [Serverless Compose](../../../guides/compose.md).

## Stage-specific configuration

The top-level `stages` key holds settings per stage. A key under `stages` is a stage name, and `default` applies to every stage without its own entry. Each stage takes `params`, `observability` and `resolvers`.

### Stage parameters

`params` sets [parameters](../../../guides/parameters.md) per stage; `default` supplies the value for stages that don't set one:

```yaml
service: billing

stages:
  prod:
    params:
      stripeApiKey: ${env:PROD_STRIPE_API_KEY}
  default:
    params:
      stripeApiKey: ${env:DEV_STRIPE_API_KEY}

functions:
  chargeCustomer:
    handler: billing.charge
    environment:
      STRIPE_API_KEY: ${param:stripeApiKey}
```

### Stage observability

`observability` turns [Serverless Dashboard observability](../../../guides/dashboard/README.md) on or off per stage. `true` and `false` require `app` in `serverless.yml`. It also takes `axiom` or `dashboard`, or an object with `provider` (`axiom` or `dashboard`) and, for Axiom, `dataset`.

```yaml
org: myorg
app: my-app
service: billing

stages:
  prod:
    observability: true
  default:
    observability: false
```

### Stage variable resolvers

`resolvers` declares [variable resolvers](../../../guides/variables/README.md) per stage, such as the AWS credentials of a [deployment account](./credentials.md#using-resolvers-to-specify-deployment-credentials) or a [Terraform](../../../guides/variables/hashicorp/terraform.md) or [Vault](../../../guides/variables/hashicorp/vault.md) source:

```yaml
stages:
  default:
    resolvers:
      terraform:
        type: terraform
        backend: s3
        bucket: terraform-state
        key: users-table/terraform.tfstate
```

## Deploy a service

`serverless deploy`, run in the directory that holds `serverless.yml`, turns the functions, events and resources into a CloudFormation template and deploys it as one stack:

```bash
serverless deploy
```

The deploy goes to the `dev` stage in `us-east-1` unless `provider.stage` and `provider.region`, or the CLI options, say otherwise:

```bash
serverless deploy --stage prod --region us-east-1
```

See [Deploying to AWS](./deploying.md) for how a deploy works, and the [`deploy` command](../cli-reference/deploy.md) for its options.

## Remove a service

`serverless remove` deletes a deployed stage of the service from AWS:

```bash
serverless remove --stage dev
```

It deletes the service's artifacts from the deployment bucket, the CloudFormation stack with the resources in it, and the service's ECR repository if it has one. Resources with `DeletionPolicy: Retain` stay in your account, such as layer versions with `retain: true` and Infrequent Access log groups, and so does the shared deployment bucket. The local service directory isn't touched, so you can deploy it again to any stage or Region.

**Warning:** Removing a stage deletes its data stores declared in `resources`, such as DynamoDB tables, unless they set `DeletionPolicy: Retain`.

## Version pinning

The `serverless` command you install globally (for example with `npm install -g serverless`) is a launcher. In a service, it reads `frameworkVersion` from the service configuration and runs a matching Framework release, downloading it into `~/.serverless/releases/<version>` when needed. Without `frameworkVersion`, it runs the latest release and checks for a newer one every 24 hours.

Pinning makes your colleagues and your CI system deploy the service with the same Framework version, whatever version of the launcher they installed.

### Pin a version

Set `frameworkVersion` to an exact version or a [Semantic Versioning](https://semver.org/) range. With a range, the launcher uses the highest available release that matches it, and checks for newer matching releases every 24 hours. When no available release matches, the command stops with an error.

Pin to a major or minor range rather than an exact version, so the service still receives patch releases with bug and security fixes. See [Pinning to a specific version](../../../getting-started.md#pinning-to-a-specific-version) for details, including the list of flagged versions.

An exact version:

```yaml
# serverless.yml
frameworkVersion: '4.17.0'

service: users
```

A range that accepts `4.17.x` (at least 4.17.0, below 4.18.0):

```yaml
# serverless.yml
frameworkVersion: '~4.17.0'

service: users
```

To accept any `4.x` release, use `frameworkVersion: '4'`.

## Related pages

- [AWS Lambda functions](./functions.md): configure functions.
- [Deploying to AWS](./deploying.md): what a deploy does.
- [Serverless Compose](../../../guides/compose.md): deploy several services together.
- [serverless.yml reference](./serverless.yml.md): every key.
