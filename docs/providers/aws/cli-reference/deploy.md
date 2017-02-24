<!--
title: Serverless Framework Commands - AWS Lambda - Deploy
menuText: Deploy
menuOrder: 4
description: Deploy your service to the specified provider
layout: Doc
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->
### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/aws/cli-reference/deploy)
<!-- DOCS-SITE-LINK:END -->

# AWS - deploy

The `sls deploy` command deploys your entire service via CloudFormation.  Run this command when you have made infrastructure changes (i.e., you edited `serverless.yml`).  Use `serverless deploy function -f myFunction` when you have made code changes and you want to quickly upload your updated code to AWS Lambda.

```bash
serverless deploy
```

## Options
- `--stage` or `-s` The stage in your service that you want to deploy to.
- `--region` or `-r` The region in that stage that you want to deploy to.
- `--noDeploy` or `-n` Skips the deployment steps and leaves artifacts in the `.serverless` directory
- `--verbose` or `-v` Shows all stack events during deployment, and display any Stack Output.

## Artifacts

After the `serverless deploy` command runs all created deployment artifacts are placed in the `.serverless` folder of the service.

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

## Provided lifecycle events
- `deploy:cleanup`
- `deploy:initialize`
- `deploy:setupProviderConfiguration`
- `deploy:createDeploymentArtifacts`
- `deploy:compileFunctions`
- `deploy:compileEvents`
- `deploy:deploy`
- `deploy:function:deploy`
