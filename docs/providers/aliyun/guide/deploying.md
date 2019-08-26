<!--
title: Serverless Framework - Alibaba Cloud Function Compute Guide - Deploying
menuText: Deploying
menuOrder: 8
description: How to deploy your Alibaba Cloud Function Compute functions and their required infrastructure
layout: Doc
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/aliyun/guide/deploying)

<!-- DOCS-SITE-LINK:END -->

# Alibaba Cloud - Deploying

The Serverless Framework was designed to provision your Alibaba Cloud Function Compute Functions, Events and Resources safely and quickly.

## Deploy All

This is the main method for doing deployments with the Serverless Framework:

```bash
serverless deploy
```

Use this method when you have updated your Function, Events or Resource configuration in `serverless.yml` and you want to deploy that change (or multiple changes at the same time) to Alibaba Cloud.

### How It Works

The Serverless Framework translates all syntax in `serverless.yml` to a Alibaba Cloud Deployment Manager configuration template.

- The provider plugin parses `serverless.yml` configuration and translates it to Alibaba Cloud resources
- The code of your Functions is then packaged into a directory, zipped and uploaded to the deployment bucket
- Resources are deployed

### Tips

- Use this in your CI/CD systems, as it is the safest method of deployment.

Check out the [deploy command docs](../cli-reference/deploy.md) for all details and options.
