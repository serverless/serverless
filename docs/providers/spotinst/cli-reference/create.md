<!--
title: Serverless Framework Commands - Spotinst Functions - Create
menuText: create
menuOrder: 2
description: Creates a new Service in your current working directory
layout: Doc
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->
### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/spotinst/cli-reference/create)
<!-- DOCS-SITE-LINK:END -->

# Spotinst Functions - Create

Creates a new service in the current working directory based on the provided template.

**Create service in current working directory:**

```bash
serverless create -t spotinst-nodejs
```

**Create service in new folder:**

```bash
serverless create -t spotinst-nodejs -p myService
```

## Options
- `--template` or `-t` The name of one of the available templates. **Required if --template-url is not present**.
- `--template-url` or `-u` The name of one of the available templates. **Required if --template is not present**.
- `--path` or `-p` The path where the service should be created.
- `--name` or `-n` the name of the service in `serverless.yml`.

## Available Templates

To see a list of available templates run `serverless create --help`

Most commonly used templates:

- spotinst-nodejs
- spotinst-python
- spotinst-ruby
- spotinst-java
- plugin

<!--
- spotinst-java
- plugin
-->

## Examples

### Creating a new service

```bash
serverless create -t spotinst-nodejs -n my-special-service
```

This example will generate scaffolding for a service with `Spotinst` as a provider and `nodejs` as runtime. The scaffolding
will be generated in the current working directory.


### Creating a named service in a (new) directory

```bash
serverless create -t spotinst-nodejs -p my-new-service
```

This example will generate scaffolding for a service with `Spotinst` as a provider and `ruby` as runtime. The scaffolding
will be generated in the `my-new-service` directory. This directory will be created if not present. Otherwise Serverless
will use the already present directory.
