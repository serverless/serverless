<!--
title: Serverless Framework Commands - Spotinst Functions - Deploy
menuText: deploy
menuOrder: 3
description: Deploy your service to the specified provider
layout: Doc
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/spotinst/cli-reference/deploy)

<!-- DOCS-SITE-LINK:END -->

# Spotinst Functions - deploy

The `sls deploy` command deploys your entire service to Spotinst Functions via Spotinst API. Run this command when you have made service changes (i.e., you edited serverless.yml).

```bash
serverless deploy -v
```

## Options

- `--config` or `-c` Name of your configuration file, if other than `serverless.yml|.yaml|.js|.json`.
- `--package` or `-p` path to a pre-packaged directory and skip packaging step.
- `--verbose` or `-v` Shows all stack events during deployment, and display any Stack Output.
