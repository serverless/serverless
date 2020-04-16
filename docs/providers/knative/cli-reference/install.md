<!--
title: Serverless Framework Commands - Knative - Install
menuText: install
menuOrder: 2
description: Install pre-written Knative Serving services and Knative Eventing events with the Serverless Framework
layout: Doc
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/knative/cli-reference/install/)

<!-- DOCS-SITE-LINK:END -->

# Knative - Install

Installs a service from a GitHub URL in the current working directory.

```bash
serverless install --url https://github.com/pmuens/serverless-knative-example
```

## Options

- `--url` or `-u` The services Git URL. **Required**.
- `--name` or `-n` Name for the service.

## Examples

### Installing a service from a GitHub URL

```bash
serverless install --url https://github.com/pmuens/serverless-knative-example
```

This example will download the .zip file of the `servlerless-knative-example` service from GitHub, create a new directory with the name `serverless-knative-example` in the current working directory and unzips the files in this directory.

### Installing a service from a GitHub URL with a new service name

```bash
serverless install --url https://github.com/pmuens/serverless-knative-example --name my-service
```

This example will download the .zip file of the `serverless-knative-example` service from GitHub, create a new directory with the name `my-service` in the current working directory and unzips the files in this directory and renames the service to `my-service` if `serverless.yml` exists in the service root.
