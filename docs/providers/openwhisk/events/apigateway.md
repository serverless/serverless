<!--
title: Serverless Framework - Apache OpenWhisk Events - API Gateway
menuText: API Gateway
menuOrder: 1
description: Setting up API Gateway Events with Apache OpenWhisk via the Serverless Framework
layout: Doc
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/openwhisk/events/apigateway)

<!-- DOCS-SITE-LINK:END -->

# API Gateway

Apache OpenWhisk has an [API gateway](http://bit.ly/2xf9G2D) included within the platform. This service
allows you to define public HTTP endpoints for your serverless functions.

To create HTTP endpoints as Event sources for your Apache OpenWhisk Functions, use the Serverless Framework's easy API Gateway Events syntax.

## API Gateway Events

### Simple HTTP Endpoint

This setup specifies that the `hello` function should be run when someone accesses the API gateway at `example/hello` via
a `GET` request.

Here's an example:

```yml
# serverless.yml

functions:
  example:
    handler: handler.hello
    events:
      - http: GET hello
```

URL paths for the serverless functions are prefixed with the function name, e.g.
`/function_name/some/path`.

```javascript
// handler.js

'use strict';

module.exports.hello = function (params) {
  // Your function handler
  return { payload: 'Hello world!' };
};
```

When this service is deployed, the base API Gateway url will be
printed to the console. Combine this with your custom HTTP path to create
the full HTTP endpoint exposing your serverless function.

```
$ serverless deploy
...
Serverless: Configured API endpoint: https://xxx-yyy-gws.api-gw.mybluemix.net/example

$ http get https://xxx-yyy-gws.api-gw.mybluemix.net/example/hello
{
    "payload": "Hello, World!"
}
```

### HTTP Endpoint with Parameters

Here we've defined an POST endpoint for the path `posts/create`.

```yml
# serverless.yml

functions:
  greeting:
    handler: greeting.handler
    events:
      - http: POST greeting/generate
```

```javascript
// posts.js

'use strict';

module.exports.handler = function (params) {
  const name = params.name || 'stranger';
  // Your function handler
  return { payload: `Hello ${name}!` };
};
```

The body of the incoming request is parsed as JSON and passed as the
`params` argument to the function handler.

The returned JavaScript object will be serialized as JSON and returned in the
HTTP response body.

### HTTP Endpoint with Extended Options

Here we've defined an POST endpoint for the path `posts/create`.

```yml
# serverless.yml

functions:
  create:
    handler: posts.create
    events:
      - http:
          path: posts/create
          method: post
          resp: json
```

HTTP event configuration supports the following parameters.

- `method` - HTTP method (mandatory).
- `path` - URI path for API gateway (mandatory).
- `resp` - controls [web action content type](https://github.com/apache/incubator-openwhisk/blob/master/docs/webactions.md#additional-features), values include: `json`, `html`, `http`, `svg`or `text` (optional, defaults to `json`).

### CORS Support

**Note:** All HTTP endpoints defined in this manner have cross-site requests
enabled for all source domains.

### URL Path Parameters

The API Gateway service [supports path parameters](https://github.com/apache/openwhisk/blob/master/docs/apigateway.md#exposing-multiple-web-actions) in user-defined HTTP paths. This allows functions to handle URL paths which include templated values, like resource identifiers.

Path parameters are identified using the `{param_name}` format in the URL path. The API Gateway sends the full matched path value in the `__ow_path` field of the event parameters.

```yaml
functions:
  retrieve_users:
    handler: users.get
    events:
      - http:
          method: GET
          path: /users/{id}
          resp: http
```

This feature comes with the following restrictions:

- _Path parameters are only supported when `resp` is configured as`http`._
- _Individual path parameter values are not included as separate event parameters. Users have to manually parse values from the full `__ow_path` value._

### Security

Functions exposed through the API Gateway service are automatically converted
into Web Actions during deployment. The framework [secures Web Actions for HTTP endpoints](https://github.com/apache/openwhisk/blob/master/docs/webactions.md#securing-web-actions) using the `require-whisk-auth` annotation. If the `require-whisk-auth`
annotation is manually configured, the existing annotation value is used, otherwise a random token is automatically generated.
