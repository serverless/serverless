<!--
title: Serverless Framework Commands - Knative - Deploy
menuText: deploy
menuOrder: 3
description: Deploy your service to the specified provider
layout: Doc
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/knative/cli-reference/deploy/)

<!-- DOCS-SITE-LINK:END -->

# Knative - deploy

The `serverless deploy` command deploys your entire service.

```bash
serverless deploy
```

## Options

- `--config` or `-c` Name of your configuration file, if other than `serverless.yml|.yaml|.js|.json`.
- `--stage` or `-s` The stage in your service that you want to deploy to.

## Artifacts

After the `serverless deploy` command runs, the Framework runs `serverless package` in the background first then deploys the service. During the deployment, the Framework creates a Kubernetes namespace (called `sls-{service}-{stage}`) which is used to host all your Kubernetes / Knative resources.

## Examples

### Deployment without stage options

```bash
serverless deploy
```

This is the simplest deployment usage possible. With this command Serverless will deploy your service to the defined
provider in the default stage (`dev`).

### Deployment with stage option

```bash
serverless deploy --stage prod
```

With this example we've defined that we want our service to be deployed to the `prod` stage.
