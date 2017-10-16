<!--
title: Serverless Framework Commands - Auth0 Webtasks - Create
menuText: create
menuOrder: 2
description: Creates a new Service in your current working directory
layout: Doc
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->
### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/webtasks/cli-reference/create)
<!-- DOCS-SITE-LINK:END -->

# Auth0 Webtasks - Create

Creates a new service in the current working directory based on the specified Auth0 Webtasks template.

**Create service in current working directory:**

```bash
serverless create --template webtasks-nodejs
```

**Create service in new folder:**

```bash
serverless create --template webtasks-nodejs --path my-service
```

## Options

- `--template` or `-t` The name of one of the available templates. **Required if --template-url is not present**.
- `--template-url` or `-u` The name of one of the available templates. **Required if --template is not present**.
- `--path` or `-p` The path where the service should be created.
- `--name` or `-n` the name of the service in `serverless.yml`.

## Available Templates

To see a list of available templates run `serverless create --help`

The only template available for use with the Auth0 Webtasks platform is:

- webtasks-nodejs

## Examples

### Creating a new service

```bash
serverless create --template webtasks-nodejs --name my-special-service
```

This example will generate scaffolding for a service with `webtasks` as a provider. The scaffolding will be generated in the current working directory.

### Creating a named service in a (new) directory

```bash
serverless create --template webtasks-nodejs --path my-new-service
```

This example will generate scaffolding for a service with `webtasks` as a provider. The scaffolding will be generated in the `my-new-service` directory. This directory will be created if not present. Otherwise Serverless will use the already present directory.

Additionally Serverless will rename the service according to the path you provide. In this example the service will be renamed to `my-new-service`.
