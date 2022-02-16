<!--
title: Serverless Framework Commands - Fn - Deploy
menuText: deploy
menuOrder: 2
description: Deploy your service to the specified provider
layout: Doc
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/fn/cli-reference/deploy)

<!-- DOCS-SITE-LINK:END -->

# Fn - Deploy

The `sls deploy` command deploys your entire service via the Fn API. Run this command when you have made service changes (i.e., you edited `serverless.yml`).

Use `serverless deploy function -f my-function` when you have made code changes and you want to quickly upload your updated code to your Fn server or cluster.

```bash
serverless deploy
```

This is the simplest deployment usage possible. With this command Serverless will deploy your service to the configured Fn server.

## Options

- `--config` or `-c` Name of your configuration file, if other than `serverless.yml|.yaml|.js|.json`.
- `--verbose` Shows all stack events during deployment, and display any Stack Output.
- `--function` or `-f` Invoke `deploy function` (see above). Convenience shortcut

## Provided lifecycle events

- `deploy:deploy`
- `deploy:function:deploy`
