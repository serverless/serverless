<!--
title: Serverless Framework Commands - Tencent-SCF - Install
menuText: install
menuOrder: 2
description: Install pre-written Tencent-SCF Functions, Events and Resources with the Serverless Framework
layout: Doc
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/tencent/cli-reference/install/)

<!-- DOCS-SITE-LINK:END -->

# Tencent-SCF - Install

Installs a service from a GitHub URL in the current working directory.

```bash
serverless install --url https://github.com/serverless-tencent/serverless-tencent-scf/tree/master/templates/tencent-nodejs
```

## Options

- `--url` or `-u` The services Git URL. **Required**.
- `--name` or `-n` Name for the service.

## Examples

### Installing a service from a GitHub URL

```bash
serverless install --url https://github.com/serverless-tencent/serverless-tencent-scf/tree/master/templates/tencent-nodejs
```

This example will download the .zip file of the `tencent-nodejs` service from GitHub, create a new directory with the name `tencent-nodejs` in the current working directory and unzips the files in this directory.

### Installing a service from a GitHub URL with a new service name

```bash
serverless install --url https://github.com/serverless-tencent/serverless-tencent-scf/tree/master/templates/tencent-nodejs --name my-service
```

This example will download the .zip file of the `tencent-nodejs` service from GitHub, create a new directory with the name `my-service` in the current working directory and unzips the files in this directory and renames the service to `my-service` if `serverless.yml` exists in the service root.

### Installing a service from a directory in a GitHub URL

```bash
serverless install --url https://github.com/tencentyun/scf-demo-repo/tree/master/Nodejs8.9-HexoDemo
```

This example will download the `Nodejs8.9-HexoDemo` service from GitHub.
