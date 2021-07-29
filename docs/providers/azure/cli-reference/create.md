<!--
title: Serverless Framework Commands - Azure Functions - Create
menuText: create
menuOrder: 1
description: Creates a new Service in your current working directory
layout: Doc
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/azure/cli-reference/create)

<!-- DOCS-SITE-LINK:END -->

# Azure - Create

Creates a new Service in the current working directory based on the specified
template.

**Create Service in current working directory:**

```bash
serverless create --template azure-nodejs
```

**Create Service in new folder:**

```bash
serverless create --template azure-nodejs --path myFunctionApp
```

## Options

- `--template` or `-t` The name of one of the available templates. **Required if --template-url and --template-path are not present**.
- `--template-url` or `-u` A URL pointing to a remotely hosted template. **Required if --template and --template-path are not present**.
- `--template-path` The local path of your template. **Required if --template and --template-url are not present**.
- `--path` or `-p` The path where the Service should be created.
- `--name` or `-n` the name of the Service in `serverless.yml`.

## Provided lifecycle events

- `create:create`

## Available Templates

To see a list of available templates run `serverless create --help`

Most commonly used templates:

- [azure-nodejs](https://github.com/serverless/serverless/tree/master/lib/plugins/create/templates/azure-nodejs)
- [azure-python](https://github.com/serverless/serverless/tree/master/lib/plugins/create/templates/azure-python)

## Examples

### Creating a new Service

```bash
serverless create --template azure-nodejs --name my-service
```

This example will generate scaffolding for a Service with `Azure` as a provider
and `nodejs` as runtime. The scaffolding will be generated in the current working
directory.

### Creating a named Service in a (new) directory

```bash
serverless create --template azure-nodejs --path my-service
```

This example will generate scaffolding for a Service with `Azure` as a provider
and `nodejs` as runtime. The scaffolding will be generated in the `my-service` directory. This directory will be created if not present. Otherwise
Serverless will use the already present directory.

Additionally Serverless will rename the Service according to the path you
provide. In this example the Service will be renamed to `my-service`.

### Creating a new Service using a local template

```bash
serverless create --template-path path/to/my/template/folder --path path/to/my/app --name my-service
```

This will copy the `path/to/my/template/folder` folder into `path/to/my/app` and rename the Service to `my-service`.

### Create Service in new folder using a custom template

```bash
serverless create --template-url https://github.com/serverless/serverless/tree/master/lib/plugins/create/templates/azure-nodejs --path myService
```
