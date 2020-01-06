<!--
title: Google Cloud Functions Serverless install command
menuText: install
menuOrder: 2
description: Install pre-written Google Cloud Functions Functions, Events and Resources with the Serverless Framework
layout: Doc
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/google/cli-reference/install)

<!-- DOCS-SITE-LINK:END -->

# Google - Install

Installs a service from a GitHub URL in the current working directory.

```bash
serverless install --url https://github.com/some/service
```

## Options

- `--url` or `-u` The services Git URL (can be a plain Git or a Code Hosting Platform URL). **Required**.
- `--name` or `-n` Name for the service.

## Supported Code Hosting Platforms

- GitHub
- GitHub Enterprise
- GitLab
- BitBucket
- BitBucket Server

## Examples

### Installing a service from a GitHub URL

```bash
serverless install --url https://github.com/serverless/boilerplate-googlecloudfunctions-nodejs
```

This example will download the .zip file of the `boilerplate-googlecloudfunctions-nodejs` service from GitHub, create a new directory with the name `boilerplate-googlecloudfunctions-nodejs` in the current working directory and unzips the files in this directory.

### Installing a service from a GitHub URL with a new service name

```bash
serverless install --url https://github.com/serverless/boilerplate-googlecloudfunctions-nodejs --name my-gcloud-service
```

This example will download the .zip file of the `boilerplate-googlecloudfunctions-nodejs` service from GitHub, create a new directory with the name `my-gcloud-service` in the current working directory and unzips the files in this directory and renames the service to `my-gcloud-service` if `serverless.yml` exists in the service root.

### Installing a service from a directory in a GitHub URL

```bash
serverless install --url https://github.com/serverless/examples/tree/master/google-node-simple-http-endpoint
```

This example will download the `google-node-simple-http-endpoint` service from GitHub.
