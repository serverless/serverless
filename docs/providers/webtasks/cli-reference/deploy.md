<!--
title: Serverless Framework Commands - Auth0 Webtasks - Deploy
menuText: deploy
menuOrder: 5
description: Deploy your service to the specified provider
layout: Doc
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->
### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/webtasks/cli-reference/deploy)
<!-- DOCS-SITE-LINK:END -->

# Auth0 Webtasks - deploy

The `serverless deploy` command deploys either your entire service or a single Function of your service to the Auth0 Webtasks platform.

```bash
serverless deploy
```

## Options
- `--stage` or `-s` The stage in your service that you want to deploy to. The default stage is 'dev'.
- `--profile` or `-p` The Auth0 Webtasks profile to use when deploying your service. The 'serverless' profile is used by default.

## Examples

### Deploying an entire service

```bash
serverless deploy
```

This example will deploy all of the Functions specified in the service to the Auth0 Webtasks platform. If a given function was previously deployed, it will be re-deployed with the current version of the code.

All of the Functions will be deployed with the default 'dev' stage. Functions deployed to different stages are different webtasks on the Auth0 Webtasks platform and therefore have distinct URLs.

### Deploying a single function

```bash
serverless deploy function -f main
```

This example will deploy only the 'main' function to the Auth0 Webtasks platform. If the 'main' function was previously deployed, it will be re-deployed with the current version of the code.

The 'main' Function will be deployed with the default 'dev' stage.