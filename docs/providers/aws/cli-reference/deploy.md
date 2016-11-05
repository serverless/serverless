<!--
title: Serverless Framework Commands - AWS Lambda - Deploy
menuText: Deploy
menuOrder: 3
description: Deploy your service to the specified provider
layout: Doc
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->
### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/aws/cli-reference/deploy)
<!-- DOCS-SITE-LINK:END -->

# Deploy

Deploys your service. You can access all created deployment artifacts in the `.serverless` folder.

```bash
serverless deploy [function]
```

## Options
- `--function` or `-f` The name of the function which should be deployed (**Note:** only available when running
`serverless deploy function`)
- `--stage` or `-s` The stage in your service that you want to deploy to.
- `--region` or `-r` The region in that stage that you want to deploy to.
- `--noDeploy` or `-n` Skips the deployment steps and leaves artifacts in the `.serverless` directory
- `--verbose` or `-v` Shows all stack events during deployment, and display any Stack Output.

## Examples

### Deployment without stage and region options

```bash
serverless deploy
```

This is the simplest deployment usage possible. With this command Serverless will deploy your service to the defined
provider in the default stage (`dev`) to the default region (`us-east-1`).

### Deployment with stage and region options

```bash
serverless deploy --stage production --region eu-central-1
```

With this example we've defined that we want our service to be deployed to the `production` stage in the region
`eu-central-1`.

## List existing deploys

```
serverless deploy list
```

Running this command will list your recent deployments available in your S3 deployment bucket. It will use stage and region from the provider config and show the timestamp of each deployment so you can roll back if necessary.

## Provided lifecycle events
- `deploy:cleanup`
- `deploy:initialize`
- `deploy:setupProviderConfiguration`
- `deploy:createDeploymentArtifacts`
- `deploy:compileFunctions`
- `deploy:compileEvents`
- `deploy:deploy`
- `deploy:function:deploy`
