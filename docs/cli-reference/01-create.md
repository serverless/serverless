<!--
title: Serverless Create CLI Command
description: Create a new service in your current working directory
layout: Page
-->

# Create

Creates a new service in the current working directory based on the provided template.

```
serverless create --template aws-nodejs
```

## Options
- `--template` or `-t` The name of your new service. **Required**.
- `--path` or `-p` The path where the service should be created.

## Provided lifecycle events
- `create:create`

## Available Templates

To see a list of available templates run `serverless create --help`

Most commonly used templates:

- aws-nodejs
- aws-python
- aws-java-maven
- aws-java-gradle

## Examples

### Creating a new service

```
serverless create --template aws-nodejs
```

This example will generate scaffolding for a service with `AWS` as a provider and `nodejs` as runtime. The scaffolding
will be generated in the current working directory.

Your new service will have a default stage called `dev` and a default region inside that stage called `us-east-1`.
The provider which is used for deployment later on is AWS (Amazon web services).

### Creating a named service in a (new) directory

```
serverless create --template aws-nodejs --path my-new-service
```

This example will generate scaffolding for a service with `AWS` as a provider and `nodejs` as runtime. The scaffolding
will be generated in the `my-new-service` directory. This directory will be created if not present. Otherwise Serverless
will use the already present directory.

Additionally Serverless will rename the service according to the path you provide. In this example the service will be
renamed to `my-new-service`.
