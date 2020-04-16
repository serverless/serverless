<!--
title: Serverless Framework Commands - Knative - Create
menuText: create
menuOrder: 1
description: Creates a new Service in your current working directory
layout: Doc
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/knative/cli-reference/create/)

<!-- DOCS-SITE-LINK:END -->

# Knative - Create

Creates a new service in the current working directory based on the provided template.

**Create service in current working directory:**

```bash
serverless create --template knative-docker
```

**Create service in new folder:**

```bash
serverless create --template knative-docker --path myService
```

**Create service in new folder using a custom template:**

```bash
serverless create --template-url https://github.com/serverless/serverless/tree/master/lib/plugins/create/templates/knative-docker --path myService
```

## Options

- `--template` or `-t` The name of one of the available templates. **Required if --template-url and --template-path are not present**.
- `--template-url` or `-u` A URL pointing to a remotely hosted template. **Required if --template and --template-path are not present**.
- `--template-path` The local path of your template. **Required if --template and --template-url are not present**.
- `--path` or `-p` The path where the service should be created.
- `--name` or `-n` the name of the service in `serverless.yml`.

## Available templates

To see a list of available templates run `serverless create --help`

Most commonly used templates:

- knative-docker

## Examples

### Creating a new service

```bash
serverless create --template knative-docker --name my-project
```

This example will generate scaffolding for a service with `knative` as a provider. The scaffolding
will be generated in the current working directory.

Your new service will have a default stage called `dev`. The provider which is used for deployment later on is Knative.

### Creating a named service in a (new) directory

```bash
serverless create --template knative-docker --path knative-project
```

This example will generate scaffolding for a service with `knative` as a provider. The scaffolding
will be generated in the `knative-project` directory. This directory will be created if not present. Otherwise Serverless
will use the already present directory.

Additionally Serverless will rename the service according to the path you provide. In this example the service will be
renamed to `knative-project`.
