<!--
title: Serverless Framework - Alibaba Cloud Function Compute Guide - Quick Start
menuText: Quick Start
menuOrder: 2
description: Get started with Alibaba Cloud Function Compute in 5 minutes or less
layout: Doc
-->

# Alibaba Cloud - Quick Start

This guide is designed to help you get started as quick as possible.

## 1. Create a new service

1. Create a new service with the `aliyun-nodejs` template

```bash
serverless create --template aliyun-nodejs --path my-service
```

2. Install the dependencies

```bash
cd my-service
npm install
```

## 2. Set up the credentials

Read through [credentials doc](./credentials.md) to setup the credentials.

## 3. Update `serverless.yml`

Update the `project` and `credentials` in your projects `serverless.yml`

## 4. Deploy

Make sure that you have activated Function Compute and any other dependent services such as RAM, Log Service, API Gateway and OSS before attempting to deploy your function.

Run the [deploy command](../cli-reference/deploy.md)

```bash
serverless deploy
```

## 5. Invoke

Run the [invoke command](../cli-reference/invoke.md)

```bash
serverless invoke --function first
```
