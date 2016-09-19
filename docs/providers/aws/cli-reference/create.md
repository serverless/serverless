<!--
title: Serverless Framework Commands - AWS Lambda - Create
menuText: Create
menuOrder: 1
description: Creates a new Service in your current working directory
layout: Doc
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->
### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/aws/cli-reference/create)
<!-- DOCS-SITE-LINK:END -->

# Create

Creates a new service in the current working directory based on the provided template.

```bash
serverless create --template aws-nodejs
```

## Options
- `--template` or `-t` The name of one of the available templates. **Required**.
- `--path` or `-p` The path where the service should be created.
- `--name` or `-n` the name of the service in `serverless.yml`.

## Provided lifecycle events
- `create:create`

## Available Templates

To see a list of available templates run `serverless create --help`

Most commonly used templates:

- aws-nodejs
- aws-python
- aws-java-maven
- aws-java-gradle
- aws-scala-sbt
- plugin

## Examples

### Creating a new service

```bash
serverless create --template aws-nodejs --name my-special-service
```

This example will generate scaffolding for a service with `AWS` as a provider and `nodejs` as runtime. The scaffolding
will be generated in the current working directory.

Your new service will have a default stage called `dev` and a default region inside that stage called `us-east-1`.
The provider which is used for deployment later on is AWS (Amazon web services).

### Creating a named service in a (new) directory

```bash
serverless create --template aws-nodejs --path my-new-service
```

This example will generate scaffolding for a service with `AWS` as a provider and `nodejs` as runtime. The scaffolding
will be generated in the `my-new-service` directory. This directory will be created if not present. Otherwise Serverless
will use the already present directory.

Additionally Serverless will rename the service according to the path you provide. In this example the service will be
renamed to `my-new-service`.

### Creating a new plugin

```
serverless create --template plugin
```

This example will generate scaffolding for a hello world plugin that demonstrates how to create a new command and how to listen to the various events available.
