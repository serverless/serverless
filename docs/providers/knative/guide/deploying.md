<!--
title: Knative - Knative Guide - Deploying | Serverless Framework
menuText: Deploying
menuOrder: 8
description: How to deploy your Knative Serving services
layout: Doc
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/knative/guide/deploying/)

<!-- DOCS-SITE-LINK:END -->

# Knative - Deploying

The Serverless Framework was designed to provision your Knative functions and events safely and quickly. It does this via a couple of methods designed for different types of deployments.

Upon deployment the Serverless Framework creates an own namespace on your Kubernetes cluster which follows this naming convention: `sls-{service}-{stage}`

Creating and managing different namespaces makes it possible to deploy multiple services with multiple stages Side-by-Side.

## Deploy All

This is the main method for doing deployments with the Serverless Framework:

```bash
serverless deploy
```

Use this method when you have updated your function or event configuration in `serverless.yml` and you want to deploy that change (or multiple changes at the same time) to your Kubernetes cluster.

**Note:** You can always enforce a deployment using the `--force` option, or specify a different configuration file name with the the `--config` option.

### Tips

- Use this in your CI/CD systems, as it is the safest method of deployment.
- This method defaults to the `dev` stage. You can change the default stage in your `serverless.yml` file by setting the `stage` properties inside a `provider` object as the following example shows:

  ```yaml
  service: service-name
  provider:
    name: knative
    stage: prod
  ```

- You can also deploy to different stages by passing in flags to the command:

  ```
  serverless deploy --stage prod
  ```

Check out the [deploy command docs](../cli-reference/deploy.md) for all details and options.
