<!--
title: Serverless Framework - Azure Functions Events - HTTP
menuText: HTTP
menuOrder: 1
description: Setting up HTTP Trigger Events with Azure Functions via the Serverless Framework
layout: Doc
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/azure/events/http)

<!-- DOCS-SITE-LINK:END -->

# HTTP Trigger

Azure Functions has an API endpoint created for each Function App. This service
allows you to define public HTTP endpoints for your serverless functions.

To create HTTP endpoints as Event sources for your Azure Functions, use the
Serverless Framework's easy HTTP Events syntax.

It might be helpful to read the Azure Function
[HTTP Trigger docs](https://docs.microsoft.com/en-us/azure/azure-functions/functions-bindings-http-webhook)
to learn the full functionality.

## HTTP Trigger Events

### Simple HTTP Endpoint

This setup specifies that the `hello` function should be run when someone
accesses the Function App at `api/example/hello` via a `GET` request.

Here's an example:

```yml
# serverless.yml

functions:
  example:
    handler: handler.hello
    events:
      - http: true
        name: req #<string>, default - "req", specifies which name is available on `context.bindings`
        methods: #<array> [GET, POST, PUT, DELETE], default - all
          - get
        route: example/hello #<string>, default - <function name>
        authLevel: anonymous #<enum - anonymous|function (default)|admin>
```

URL paths for the serverless functions are prefixed with "api" by default, e.g.
`/api/some/path`. You can change this via a setting in
[host.json](https://github.com/Azure/azure-webjobs-sdk-script/wiki/host.json).

```javascript
// handler.js

'use strict';

module.exports.hello = function (context, req) {
  context.res = {
    body: 'Hello world!',
  };
  context.done();
};
```

### Request event

You can see the
[full docs for HTTP triggers](https://docs.microsoft.com/en-us/azure/azure-functions/functions-bindings-http-webhook#http-trigger-sample-in-nodejs)
to learn all the capabilities.

In Node.js, the request object looks like an express request object.

```javascript
// handler.js

'use strict';

module.exports.hello = function (context, req) {
  const query = req.query; // dictionary of query strings
  const body = req.body; // Parsed body based on content-type
  const method = req.method; // HTTP Method (GET, POST, PUT, etc.)
  const originalUrl = req.originalUrl; // Original URL of the request - https://myapp.azurewebsites.net/api/foo?code=sc8Rj2a7J
  const headers = req.headers; // dictionary of headers
  const params = req.params; // dictionary of params from URL
  const rawBody = req.rawBody; // unparsed body

  context.res = {
    headers: {
      'content-type': 'application/json',
    },
    body: {
      hello: 'world',
    },
  };
  context.done();
};
```

#### Webhook

> NOTE: Webhook is a version 1.x feature. Version 2.x runtime
> no longer include
> built-in support for webhook providers.

If you specify WebHook, you'll get passed the body as the second argument
to your Function, not the request object. You can still access the request object
on the context object (i.e. `context.req`)

### CORS Support

You can set up CORS following the instructions on
[azure.com](https://docs.microsoft.com/en-us/azure/azure-functions/functions-how-to-use-azure-function-app-settings#manage-cors).
