<!--
title: Serverless Framework Commands - Cloudflare Workers - Deploy
menuText: deploy
menuOrder: 2
description: Deploy your service to the specified provider
layout: Doc
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/cloudflare/cli-reference/deploy)

<!-- DOCS-SITE-LINK:END -->

# Cloudflare Workers - Deploy

In order to be able to deploy any Cloudflare Workers, You will need to set your Global API key from Cloudflare as an environmental variable named `CLOUDFLARE_AUTH_KEY`, and your Cloudflare account email as an environmental variable named `CLOUDFLARE_AUTH_EMAIL`. You can get your Global API key from your [Cloudflare profile](https://dash.cloudflare.com/profile) page. You will also need to set `accountId` and `zoneId` in `serverless.yml` under `service.config`. The first part of the path when you open [Cloudflare dashboard](https://dash.cloudflare.com/) as a logged in user is your `accountId`, e.g. `dash.cloudflare.com/{accountId}`. And the `zoneId` can be found from the overview tab after selecting the desired zone from the [Cloudflare dashboard](https://dash.cloudflare.com/).

Environmental variables are variables that live inside your terminal.

For Mac and Linux users, you can set environmental variables like this:

```bash
export CLOUDFLARE_AUTH_KEY=YOUR_API_KEY_HERE
export CLOUDFLARE_AUTH_EMAIL=YOUR_CLOUDFLARE_EMAIL
```

And for Windows (CMD) users, you can set environmental variables like this:

```bash
set CLOUDFLARE_AUTH_KEY=YOUR_API_KEY_HERE
set CLOUDFLARE_AUTH_EMAIL=YOUR_CLOUDFLARE_EMAIL
```

You’ll need to redefine your environmental variables after each time you close your terminal.

The `serverless deploy` command deploys your entire service via the Cloudflare Workers API. Run this command when you have made service changes (i.e., you edited `serverless.yml`).
Use `serverless deploy -f my-function` when you have made code changes and you want to quickly upload your updated code to Cloudflare.

```bash
serverless deploy
```

This is the simplest deployment usage possible. With this command, Serverless will deploy your service to Cloudflare.

## Options

- `--config` or `-c` Name of your configuration file, if other than `serverless.yml|.yaml|.js|.json`.
- `--verbose` or `-v`: Shows all stack events during deployment, and display any Stack Output.
- `--function` or `-f`: Invokes `deploy function` (see above). Convenience shortcut

## Provided lifecycle events

- `deploy:deploy`
- `deploy:function:deploy`
