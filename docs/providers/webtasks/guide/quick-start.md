<!--
title: Serverless Framework - Auth0 Webtasks Guide - Quick Start
menuText: Quick Start
menuOrder: 2
description: Get started with Auth0 Webtasks in 5 minutes or less
layout: Doc
-->

# Auth0 Webtasks - Quick Start

This guide is designed to help you get started as quick as possible.

## 1. Create a new service

1. Create a new service with the [`webtasks-nodejs`](https://github.com/serverless/serverless/tree/master/lib/plugins/create/templates/webtasks-nodejs) template

```bash
serverless create --template webtasks-nodejs --path my-service
```

2. Install the dependencies

```bash
cd my-service
npm install
```

## 2. Set up the credentials

Run the [config crendentials command](../cli-reference/config-credentials.md) to create a local profile. You will be asked for a phone number or email. You'll immediately receive a verification code. Enter the verification code and your profile will be entirely setup and ready to use.

```bash
serverless config credentials --provider webtasks
```

## 4. Deploy

Run the [deploy command](../cli-reference/deploy.md)

```bash
serverless deploy
```

## 5. Invoke

Run the [invoke command](../cli-reference/invoke.md)

```bash
serverless invoke --function main
```
