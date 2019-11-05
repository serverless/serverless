<!--
title: Serverless Framework Commands - Tencent-SCF - Create
menuText: create
menuOrder: 1
description: Creates a new Service in your current working directory
layout: Doc
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/tencent/cli-reference/create/)

<!-- DOCS-SITE-LINK:END -->

# Tencent-SCF - Create

Creates a new service in the current working directory based on the provided template.

**Create service in current working directory:**

```bash
serverless create --template tencent-nodejs
```

**Create service in new folder:**

```bash
serverless create --template tencent-nodejs --path myService
```

**Create service in new folder using a custom template:**

```bash
serverless create --template-url https://github.com/serverless/serverless/tree/master/lib/plugins/create/templates/tencent-nodejs --path myService
```

## Options

- `--template` or `-t` The name of one of the available templates. **Required if --template-url and --template-path are not present**.
- `--template-url` or `-u` The name of one of the available templates. **Required if --template and --template-path are not present**.
- `--template-path` The local path of your template. **Required if --template and --template-url are not present**.
- `--path` or `-p` The path where the service should be created.
- `--name` or `-n` the name of the service in `serverless.yml`.

## Available Templates

To see a list of available templates run `serverless create --help`

Most commonly used templates:

- tencent-nodejs
- tencent-python
- tencent-php
- tencent-go

**Note:** The templates will deploy the latest version of runtime by default. When you want to configure specific version of runtime, like `Node.js6`, `Python2.7` or `PHP5`, you have to configure the `runtime` property in `serverless.yml`.

## Examples

### Creating a new service

```bash
serverless create --template tencent-nodejs --name my-project
```

This example will generate scaffolding for a service with `Tencent` as a provider and `nodejs8` as runtime. The scaffolding
will be generated in the current working directory.

Your new service will have a default stage called `dev` and a default region inside that stage called `ap-guangzhou`.
The provider which is used for deployment later on is Tencent Cloud.

### Creating a named service in a (new) directory

```bash
serverless create --template tencent-nodejs --path tencent-project
```

This example will generate scaffolding for a service with `Tencent` as a provider and `nodejs8` as runtime. The scaffolding
will be generated in the `tencent-project` directory. This directory will be created if not present. Otherwise Serverless
will use the already present directory.

Additionally Serverless will rename the service according to the path you provide. In this example the service will be
renamed to `tencent-project`.
