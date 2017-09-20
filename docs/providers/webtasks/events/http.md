<!--
title: Serverless Framework - Auth0 Webtasks Events - API Gateway
menuText: http
menuOrder: 1
description: Setting up HTTP events with Auth0 Webtasks via the Serverless Framework
layout: Doc
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->
### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/webtasks/events/apigateway)
<!-- DOCS-SITE-LINK:END -->

# Http Event

By default Functions with Auth0 Webtasks are configured to respond to HTTP events. The URL of the webtask is determined by name of the function. Also, any HTTP method can be used to invoke the webtask. Therefore, configuring a Function when using Auth0 webtasks for an HTTP event is as simple as specifing the handler file that contains your code.

```yml
functions:
  hello:
    handler: handlerFile
```

**Note:** Auth0 Webtasks only supports a single handler per file. Therefore, you do not need to specify the `method` like with other Serverless providers.
