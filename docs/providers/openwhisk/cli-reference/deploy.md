<!--
title: Serverless Framework Commands - Apache OpenWhisk - Deploy
menuText: deploy
menuOrder: 4
description: Deploy your service to the specified provider
layout: Doc
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/openwhisk/cli-reference/deploy)

<!-- DOCS-SITE-LINK:END -->

# OpenWhisk - Deploy

The `sls deploy` command deploys your entire service via the Apache OpenWhisk platform API. Run this command when you have made service changes (i.e., you edited `serverless.yml`). Use `serverless deploy function -f myFunction` when you have made code changes and you want to quickly upload your updated code to Apache OpenWhisk.

```bash
serverless deploy
```

## Options

- `--config` or `-c` Name of your configuration file, if other than `serverless.yml|.yaml|.js|.json`.
- `--noDeploy` or `-n` Skips the deployment steps and leaves artifacts in the `.serverless` directory
- `--verbose` Shows all stack events during deployment, and display any Stack Output.
- `--function` or `-f` Invoke `deploy function` (see above). Convenience shortcut - cannot be used with `--package`.

## Artifacts

After the `serverless deploy` command runs all created deployment artifacts are placed in the `.serverless` folder of the service.

## Examples

### Deployment without stage and region options

```bash
serverless deploy
```

This is the simplest deployment usage possible. With this command Serverless will deploy your service to the defined
OpenWhisk platform endpoints.

## Provided lifecycle events

- `deploy:cleanup`
- `deploy:initialize`
- `deploy:setupProviderConfiguration`
- `deploy:createDeploymentArtifacts`
- `deploy:compileFunctions`
- `deploy:compileEvents`
- `deploy:deploy`
- `deploy:function:deploy`
