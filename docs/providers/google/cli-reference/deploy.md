<!--
title: Serverless Framework Commands - Google Cloud Functions - Deploy
menuText: deploy
menuOrder: 4
description: Deploy your service to the specified provider
layout: Doc
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/google/cli-reference/deploy)

<!-- DOCS-SITE-LINK:END -->

# Deploy

The `serverless deploy` command deploys your entire service via the Google Cloud API. Run this command when you have made service changes (i.e., you edited `serverless.yml`).

```bash
serverless deploy
```

## Options

- `--config` or `-c` Name of your configuration file, if other than `serverless.yml|.yaml|.js|.json`.

## Artifacts

After the `serverless deploy` command runs all created deployment artifacts are placed in the `.serverless` folder of the service.
