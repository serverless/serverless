<!--
title: Serverless Framework Commands - Auth0 Webtasks - Info
menuText: info
menuOrder: 12
description: Display information about your deployed service and the Auth0 Webtasks Functions, Events.
layout: Doc
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->
### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/webtasks/cli-reference/info)
<!-- DOCS-SITE-LINK:END -->

# Auth0 Webtasks - Info

Displays information about the deployed service.

```bash
serverless info
```

## Options
- `--stage` or `-s` The stage in your service you want to display information about. The default stage is 'dev'.
- `--profile` or `-p` The Auth0 Webtasks profile to use when deploying your service. The 'serverless' profile is used by default.

## Provided lifecycle events
- `info:info`

## Examples

### Getting info on a service

```bash
serverless info
```

This example will display information about the deployed service for the default 'dev' stage. It will list the endpoints with the URL for each webtask.

### Getting info on a given stage of the service

```bash
serverless info --stage prod
```

This example will display information about the deployed service for the 'prod' stage. It will list the endpoints with the URL for each webtask.

Functions deployed to different stages are different webtasks on the Auth0 Webtasks platform and therefore have distinct URLs.