<!--
title: Serverless Framework - Spotinst Events - http
menuText: API Gateway
menuOrder: 1
description: Setting up http events with Spotinst via the Serverless Framework
layout: Doc
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->
### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/spotinst/events/http)
<!-- DOCS-SITE-LINK:END -->

# HTTP

Spotinst Functions can be triggered by an HTTP endpoint. To create HTTP endpoints as event sources for your Spotinst Functions, use the `http` event syntax.

This setup specifies that the `first` function should be run when someone accesses the Functions API endpoint via a `GET` request. You can get the URL for the endpoint by running the `serverless info` command after deploying your service.

Here's an example:

```yml
# serverless.yml

functions:
  first:
    handler: http
    events:
      - http: path
```
