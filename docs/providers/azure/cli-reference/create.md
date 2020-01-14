<!--
title: Serverless Framework Commands - Azure Functions - Create
menuText: create
menuOrder: 1
description: Creates a new Function App in your current working directory
layout: Doc
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/azure/cli-reference/create)

<!-- DOCS-SITE-LINK:END -->

# Azure - Create

Creates a new Function App in the current working directory based on the specified
template.

**Create Function App in current working directory:**

```bash
serverless create --template azure-nodejs
```

**Create Function App in new folder:**

```bash
serverless create --template azure-nodejs --path myFunctionApp
```

## Options

- `--template` or `-t` The name of one of the available templates. **Required if --template-url and --template-path are not present**.
- `--template-url` or `-u` A URL pointing to a remotely hosted template. **Required if --template and --template-path are not present**.
- `--template-path` The local path of your template. **Required if --template and --template-url are not present**.
- `--path` or `-p` The path where the Function App should be created.
- `--name` or `-n` the name of the Function App in `serverless.yml`.

## Provided lifecycle events

- `create:create`

## Available Templates

To see a list of available templates run `serverless create --help`

Most commonly used templates:

- [azure-nodejs](https://github.com/serverless/serverless/tree/master/lib/plugins/create/templates/azure-nodejs)
- [azure-python](https://github.com/serverless/serverless/tree/master/lib/plugins/create/templates/azure-python)

## Examples

### Creating a new Function App

```bash
serverless create --template azure-nodejs --name my-function-app
```

This example will generate scaffolding for a Function App with `Azure` as a provider
and `nodejs` as runtime. The scaffolding will be generated in the current working
directory.

### Creating a named Function App in a (new) directory

```bash
serverless create --template azure-nodejs --path my-function-app
```

This example will generate scaffolding for a Function App with `Azure` as a provider
and `nodejs` as runtime. The scaffolding will be generated in the `my-function-app` directory. This directory will be created if not present. Otherwise
Serverless will use the already present directory.

Additionally Serverless will rename the Function App according to the path you
provide. In this example the Function App will be renamed to `my-function-app`.

### Creating a new Function App using a local template

```bash
serverless create --template-path path/to/my/template/folder --path path/to/my/app --name my-function-app
```

This will copy the `path/to/my/template/folder` folder into `path/to/my/app` and rename the Function App to `my-function-app`.

### Create Function App in new folder using a custom template

```bash
serverless create --template-url https://github.com/serverless/serverless/tree/master/lib/plugins/create/templates/azure-nodejs --path myFunction App
```
