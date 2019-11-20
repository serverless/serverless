<!--
title: Tencent Cloud - Serverless Cloud Function (SCF) Guide - Variables | Serverless Framework
menuText: Variables
menuOrder: 10
description: How to use Serverless Variables to insert dynamic configuration info into your serverless.yml
layout: Doc
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/tencent/guide/variables/)

<!-- DOCS-SITE-LINK:END -->

# Tencent-SCF Variables

Variables allow users to dynamically replace config values in `serverless.yml` config. They are especially useful when providing secrets for your service to use and when you are working with multiple stages.

The Serverless framework provides a powerful variable system which allows you to add dynamic data into your `serverless.yml`. With Serverless Variables, you'll be able to do the following:

- Reference & load variables from environment variables

**Note:** You can only use variables in `serverless.yml` property **values**, not property keys. So you can't use variables to generate dynamic logical IDs in the custom resources section for example.

## Reference variables from environment variables

To reference variables from environment variables, use the `${env:someProperty}` syntax in your `serverless.yml`.

```yml
service: new-service

provider:
  name: tencent
  runtime: Nodejs8.9
  credentials: ~/.tencent/credentials
  environment:
    variables:
      ENV_FIRST: ${env:TENCENTCLOUD_APPID}
```
