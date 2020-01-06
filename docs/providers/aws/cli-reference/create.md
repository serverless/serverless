<!--
title: Serverless Framework Commands - AWS Lambda - Create
menuText: create
menuOrder: 2
description: Creates a new Service in your current working directory
layout: Doc
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/aws/cli-reference/create)

<!-- DOCS-SITE-LINK:END -->

# AWS - Create

Creates a new service in the current working directory based on the provided template.

**Create service in current working directory:**

```bash
serverless create --template aws-nodejs
```

**Create service in new folder:**

```bash
serverless create --template aws-nodejs --path myService
```

**Create service in new folder using a custom template:**

```bash
serverless create --template-url https://github.com/serverless/serverless/tree/master/lib/plugins/create/templates/aws-nodejs --path myService
```

## Options

- `--template` or `-t` The name of one of the available templates. **Required if --template-url and --template-path are not present**.
- `--template-url` or `-u` A URL pointing to a remotely hosted template. **Required if --template and --template-path are not present**.
- `--template-path` The local path of your template. **Required if --template and --template-url are not present**.
- `--path` or `-p` The path where the service should be created.
- `--name` or `-n` the name of the service in `serverless.yml`.

## Provided lifecycle events

- `create:create`

## Available Templates

To see a list of available templates run `serverless create --help`

Most commonly used templates:

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
- aws-kotlin-jvm-gradle
- aws-kotlin-nodejs-gradle
- aws-groovy-gradle
- aws-java-maven
- aws-java-gradle
- aws-scala-sbt
- aws-csharp
- aws-fsharp
- aws-go
- aws-go-dep
- aws-go-mod
- plugin

## Examples

### Creating a new service

```bash
serverless create --template aws-nodejs --name my-special-service
```

This example will generate scaffolding for a service with `AWS` as a provider and `nodejs` as runtime. The scaffolding
will be generated in the current working directory.

Your new service will have a default stage called `dev` and a default region inside that stage called `us-east-1`.
The provider which is used for deployment later on is AWS (Amazon Web Services).

### Creating a named service in a (new) directory

```bash
serverless create --template aws-nodejs --path my-new-service
```

This example will generate scaffolding for a service with `AWS` as a provider and `nodejs` as runtime. The scaffolding
will be generated in the `my-new-service` directory. This directory will be created if not present. Otherwise Serverless
will use the already present directory.

Additionally Serverless will rename the service according to the path you provide. In this example the service will be
renamed to `my-new-service`.

### Creating a new service using a local template

```bash
serverless create --template-path path/to/my/template/folder --path path/to/my/service --name my-new-service
```

This will copy the `path/to/my/template/folder` folder into `path/to/my/service` and rename the service to `my-new-service`.

### Creating a new plugin

```
serverless create --template plugin
```

This example will generate scaffolding for a hello world plugin that demonstrates how to create a new command and how to listen to the various events available.
