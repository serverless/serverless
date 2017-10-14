<!--
title: Serverless Framework Commands - Apache OpenWhisk - Create
menuText: create
menuOrder: 2
description: Creates a new Service in your current working directory
layout: Doc
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->
### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/openwhisk/cli-reference/create)
<!-- DOCS-SITE-LINK:END -->

# OpenWhisk - Create

Creates a new service in the current working directory based on the provided template.

**Create service in current working directory:**

```bash
serverless create --template openwhisk-nodejs
```

**Create service in new folder:**

```bash
serverless create --template openwhisk-nodejs --path myService
```

## Options
- `--template` or `-t` The name of one of the available templates. **Required if --template-url is not present**.
- `--template-url` or `-u` The name of one of the available templates. **Required if --template is not present**.
- `--path` or `-p` The path where the service should be created.
- `--name` or `-n` the name of the service in `serverless.yml`.

## Provided lifecycle events
- `create:create`

## Available Templates

To see a list of available templates run `serverless create --help`

Most commonly used templates:

- openwhisk-nodejs
- openwhisk-python
- openwhisk-php
- openwhisk-swift
- plugin

## Examples

### Creating a new service

```bash
serverless create --template openwhisk-nodejs --name my-special-service
```

This example will generate scaffolding for a service with `openwhisk` as a provider and `nodejs:6` as runtime. The scaffolding will be generated in the current working directory.

The provider which is used for deployment later on is Apache OpenWhisk.

### Creating a named service in a (new) directory

```bash
serverless create --template openwhisk-nodejs --path my-new-service
```

This example will generate scaffolding for a service with `openwhisk` as a provider and `nodejs` as runtime. The scaffolding will be generated in the `my-new-service` directory. This directory will be created if not present. Otherwise Serverless will use the already present directory.

Additionally Serverless will rename the service according to the path you provide. In this example the service will be renamed to `my-new-service`.

### Create service in new folder using a custom template

```bash
serverless create --template-url https://github.com/serverless/serverless/tree/master/lib/plugins/create/templates/openwhisk-nodejs --path myService
```

### Creating a new plugin

```
serverless create --template plugin
```

This example will generate scaffolding for a hello world plugin that demonstrates how to create a new command and how to listen to the various events available.
