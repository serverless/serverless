<!--
title: Serverless Framework - Google Cloud Functions Guide - Quickstart
menuText: Quickstart
menuOrder: 2
description: Get started with Google Cloud Functions in 5 minutes or less
layout: Doc
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->
### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/google/guide/intro)
<!-- DOCS-SITE-LINK:END -->

# Google - Quickstart

This guide is designed to help you get started as quick as possible.

## 1. Set up boilerplate

To setup the boilerplate, follow these instructions:

1. Install the boilerplate

```bash
serverless install --url https://github.com/serverless/boilerplate-googlecloudfunctions-nodejs --name <my-service>
```

2. Install the dependencies

```bash
cd <my-service>
npm install
```

## 2. Set up the credentials

Read through [credentials doc](./credentials.md) to setup the credentials.

# 3. Deploy

Run the [deploy command](../cli-reference/deploy.md)

```bash
serverless deploy
```

# 4. Invoke

Run the [invoke command](../cli-reference/invoke.md)

```bash
serverless invoke --function first
```
