<!--
title: Serverless Framework Commands - Apache OpenWhisk - Install
menuText: install
menuOrder: 3
description: Install pre-written Apache OpenWhisk Functions, Events and Resources with the Serverless Framework
layout: Doc
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/openwhisk/cli-reference/install)

<!-- DOCS-SITE-LINK:END -->

# OpenWhisk - Install

Installs a service from a GitHub URL in the current working directory.

```bash
serverless install --url https://github.com/some/service
```

## Options

- `--url` or `-u` The services Git URL (can be a plain Git or a Code Hosting Platform URL). **Required**.
- `--name` or `-n` Name for the service.

## Provided lifecycle events

- `install:install`

## Supported Code Hosting Platforms

- GitHub
- GitHub Enterprise
- GitLab
- BitBucket
- BitBucket Server

## Examples

### Installing a service from a GitHub URL

```bash
serverless install --url https://github.com/jthomas/serverless-openwhisk-boilerplate
```

This example will download the .zip file of the `serverless-openwhisk-boilerplate` service from GitHub, create a new directory with the name `serverless-openwhisk-boilerplate` in the current working directory and unzips the files in this directory.

### Installing a service from a GitHub URL with a new service name

```bash
serverless install --url https://github.com/jthomas/serverless-openwhisk-boilerplate --name my-app
```

This example will download the .zip file of the `serverless-openwhisk-boilerplate` service from GitHub, create a new directory with the name `my-app` in the current working directory and unzips the files in this directory and renames the service to `my-app` if `serverless.yml` exists in the service root.

### Installing a service from a directory in a GitHub URL

```bash
serverless install --url
https://github.com/serverless/examples/tree/master/openwhisk-node-simple
```

This example will download the `openwhisk-node-simple` service from GitHub.
