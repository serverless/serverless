<!--
title: Tencent Cloud - Serverless Cloud Function (SCF) Guide - Deploying | Serverless Framework
menuText: Deploying
menuOrder: 8
description: How to deploy your Tencent Cloud's Serverless Cloud functions and their required infrastructure
layout: Doc
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/tencent/guide/deploying/)

<!-- DOCS-SITE-LINK:END -->

# Tencent-SCF - Deploying

The Serverless Framework was designed to provision your Serverless Cloud Functions, Events and infrastructure Resources safely and quickly. It does this via a couple of methods designed for different types of deployments.

## Deploy All

This is the main method for doing deployments with the Serverless Framework:

```bash
serverless deploy
```

Use this method when you have updated your Function, Event or Resource configuration in `serverless.yml` and you want to deploy that change (or multiple changes at the same time) to Tencent Cloud.

**Note:** You can always enforce a deployment using the `--force` option, or specify a different configuration file name with the the `--config` option.

### Tips

- Use this in your CI/CD systems, as it is the safest method of deployment.
- You can print the progress during the deployment if you use `verbose` mode, like this:
  ```
  serverless deploy --verbose
  ```
- This method defaults to `dev` stage and `ap-guangzhou` region. You can change the default stage and region in your `serverless.yml` file by setting the `stage` and `region` properties inside a `provider` object as the following example shows:

  ```yml
  # serverless.yml

  service: service-name
  provider:
    name: tencent
    stage: production
    region: ap-beijing
  ```

- You can also deploy to different stages and regions by passing in flags to the command:

  ```
  serverless deploy --stage production --region ap-beijing
  ```

- You can specify your own COS bucket which should be used to store all the deployment artifacts.
  The `cosBucket` config which is nested under `provider` lets you e.g. set the `name` for this bucket. If you don't provide your own bucket, Serverless will create a bucket which by default.

## Deploy Function

This deployment method simply overwrites the zip file of the current function on Tencent Cloud.

```bash
serverless deploy function --function myFunction
```

### Tips

- Use this when you are developing and want to test because it's much faster.
- During development, people will often run this command several times, as opposed to `serverless deploy` which is only run when larger infrastructure provisioning is required.

Check out the [deploy command docs](../cli-reference/deploy.md) for all details and options.
