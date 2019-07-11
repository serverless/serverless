<!--
title: Hello World Python Example
menuText: Hello World Python Example
description: Create a Python Hello World Google Cloud Functions function
layout: Doc
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/google/examples/hello-world/python/)

<!-- DOCS-SITE-LINK:END -->

# Hello World Python Example

Make sure [`serverless` is installed](../../../guide/installation.md) and you have [setup your credentials](../../../guide/credentials.md).

## 1. Create a service

`serverless create --template google-python --path my-service`

## 2. Install Provider Plugin

`npm install` in the service directory.

## 3. Update the `provider` property

Update the `credentials` and your `project` property in the `serverless.yml` file.

## 4. Deploy

`serverless deploy`

## 5. Invoke deployed function

`serverless invoke --function first`

In your terminal window you should see a response from the Google Cloud

Congrats you have deployed and ran your Hello World function!
