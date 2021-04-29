<!--
title: Serverless Framework Commands - Kubeless - Deploy
menuText: deploy
menuOrder: 2
description: Deploy your service to the specified provider
layout: Doc
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/kubeless/cli-reference/deploy)

<!-- DOCS-SITE-LINK:END -->

# Kubeless - Deploy

The `sls deploy` command deploys your entire service via the Kubeless API. Run this command when you have made service changes (i.e., you edited `serverless.yml`).

Use `serverless deploy function -f my-function` when you have made code changes and you want to quickly upload your updated code to your Kubernetes cluster.

```bash
serverless deploy
```

This is the simplest deployment usage possible. With this command Serverless will deploy your service to the default Kubernetes cluster in your kubeconfig file.

## Options

- `--config` or `-c` Name of your configuration file, if other than `serverless.yml|.yaml|.js|.json`.
- `--verbose` or `-v` Shows all stack events during deployment, and display any Stack Output.
- `--package` or `-p` The path of a previously packaged deployment to get deployed (skips packaging step).
- `--function` or `-f` Invoke `deploy function` (see above). Convenience shortcut - cannot be used with `--package`.

## Artifacts

After the `serverless deploy` command runs all created deployment artifacts are placed in the `.serverless` folder of the service.

## Provided lifecycle events

- `deploy:cleanup`
- `deploy:initialize`
- `deploy:setupProviderConfiguration`
- `deploy:createDeploymentArtifacts`
- `deploy:compileFunctions`
- `deploy:compileEvents`
- `deploy:deploy`
- `deploy:function:deploy`
