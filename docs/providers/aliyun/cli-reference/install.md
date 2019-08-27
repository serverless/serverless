<!--
title: Serverless Framework Commands - Alibaba Cloud Function Compute - Install
menuText: install
menuOrder: 2
description: Install pre-written Alibaba Cloud Function Compute Functions, Events and Resources with the Serverless Framework
layout: Doc
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/aliyun/cli-reference/install)

<!-- DOCS-SITE-LINK:END -->

# Alibaba Cloud - Install

Installs a service from a GitHub URL in the current working directory.

```bash
serverless install --url https://github.com/some/service
```

## Options

- `--url` or `-u` The services GitHub URL. **Required**.
- `--name` or `-n` Name for the service.

## Examples

### Installing a service from a GitHub URL

```bash
serverless install --url https://github.com/aliyun/serverless-boilerplate-aliyun-nodejs
```

This example will download the .zip file of the `serverless-boilerplate-aliyun-nodejs` service from GitHub, create a new directory with the name `serverless-boilerplate-aliyun-nodejs` in the current working directory and unzips the files in this directory.

### Installing a service from a GitHub URL with a new service name

```bash
serverless install --url https://github.com/aliyun/serverless-boilerplate-aliyun-nodejs --name my-aliyun-service
```

This example will download the .zip file of the `serverless-boilerplate-aliyun-nodejs` service from GitHub, create a new directory with the name `my-aliyun-service` in the current working directory and unzips the files in this directory and renames the service to `my-aliyun-service` if `serverless.yml` exists in the service root.

### Installing a service from a directory in a GitHub URL

```bash
serverless install --url https://github.com/aliyun/serverless-function-compute-examples/tree/master/aliyun-nodejs
```

This example will download the `aliyun-nodejs` service from GitHub.
