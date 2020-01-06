<!--
title: Serverless Framework Commands - Kubeless - Create
menuText: create
menuOrder: 1
description: Creates a new Service in your current working directory
layout: Doc
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/kubeless/cli-reference/create)

<!-- DOCS-SITE-LINK:END -->

# Kubeless - Create

Creates a new Serverless service in the current working directory based on the provided template.

**Create service in current working directory:**

```bash
serverless create --template kubeless-python
```

```bash
serverless create --template kubeless-nodejs
```

**Create service in new folder:**

```bash
serverless create --template kubeless-python --path my-service
```

```bash
serverless create --template kubeless-nodejs --path my-service
```

## Options

- `--template` or `-t` The name of one of the available templates. **Required if --template-url and --template-path are not present**.
- `--template-url` or `-u` A URL pointing to a remotely hosted template. **Required if --template and --template-path are not present**.
- `--template-path` The local path of your template. **Required if --template and --template-url are not present**.
- `--path` or `-p` The path where the service should be created.
- `--name` or `-n` the name of the service in `serverless.yml`.

## Provided lifecycle events

- `create:create`

## Available Templates for Kubeless

To see a list of available templates run `serverless create --help`

These are the current available templates for Kubeless:

- kubeless-nodejs
- kubeless-python

## Examples

### Creating a new Serverless service

```bash
serverless create --template kubeless-python --name my-special-service
```

This example will generate scaffolding for a service with `kubeless` as a provider and `python2.7` as runtime. The scaffolding will be generated in the current working directory.

The provider which is used for deployment later on is Kubeless.

### Creating a named service in a (new) directory

```bash
serverless create --template kubeless-python --path my-new-service
```

This example will generate scaffolding for a service with `kubeless` as a provider and `python2.7` as runtime. The scaffolding will be generated in the `my-new-service` directory. This directory will be created if not present. Otherwise Serverless will use the already present directory.

Additionally Serverless will rename the service according to the path you provide. In this example the service will be renamed to `my-new-service`.

### Creating a new service using a local template

```bash
serverless create --template-path path/to/my/template/folder --path path/to/my/service --name my-new-service
```

This will copy the `path/to/my/template/folder` folder into `path/to/my/service` and rename the service to `my-new-service`.
