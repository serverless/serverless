<!--
title: Serverless Deploy CLI Command
description: Deploy your service to the specified provider
layout: Page
-->

# Deploy

Deploys your service.

```
serverless deploy [function]
```

## Options
- `--function` or `-f` The name of the function which should be deployed (**Note:** only available when running
`serverless deploy function`)
- `--stage` or `-s` The stage in your service that you want to deploy to.
- `--region` or `-r` The region in that stage that you want to deploy to.
- `--noDeploy` or `-n` Skips the deployment steps and leaves artifacts in the `.serverless` directory
- `--verbose` or `-v` Shows all stack events during deployment.

## Examples

### Deployment without stage and region options

```
serverless deploy
```

This is the simplest deployment usage possible. With this command Serverless will deploy your service to the defined
provider in the default stage (`dev`) to the default region (`us-east-1`).

### Deployment with stage and region options

```
serverless deploy --stage production --region eu-central-1
```

With this example we've defined that we want our service to be deployed to the `production` stage in the region
`eu-central-1`.

## Provided lifecycle events
- `deploy:cleanup`
- `deploy:initialize`
- `deploy:setupProviderConfiguration`
- `deploy:createDeploymentArtifacts`
- `deploy:compileFunctions`
- `deploy:compileEvents`
- `deploy:deploy`
- `deploy:function:deploy`
