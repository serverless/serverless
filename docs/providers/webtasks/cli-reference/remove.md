<!--
title: Serverless Framework Commands - Auth0 Webtasks - Remove
menuText: remove
menuOrder: 15
description: Remove a deployed Service and all of its Auth0 Webtask Functions, Events and Resources
layout: Doc
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->
### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/webtasks/cli-reference/remove)
<!-- DOCS-SITE-LINK:END -->

# Auth0 Webtasks - Remove

The `serverless remove` command will remove the deployed service, defined in your current working directory. All of the Functions deployed as webtasks on the Auth0 Webtasks platform will be removed.

```bash
serverless remove
```

## Options
- `--stage` or `-s` The stage in your service that you want to deploy to. The default stage is 'dev'.
- `--profile` or `-p` The Auth0 Webtasks profile to use when deploying your service. The 'serverless' profile is used by default.

## Provided lifecycle events
- `remove:remove`

## Examples

### Removing the default 'dev' service

```bash
serverless remove
```

This example will remove the deployed service for the default 'dev' stage. None of the endpoints for the Functions in the 'deve' stage of the service will be available afterwards.

### Removing a given default stage of the service

```bash
serverless info --stage prod
```

This example will remove the deployed service for the 'prod' stage. None of the endpoints for the Functions in the 'prod' stage of the service will be available afterwards.

Functions deployed to different stages are different webtasks on the Auth0 Webtasks platform and therefore have distinct URLs.
