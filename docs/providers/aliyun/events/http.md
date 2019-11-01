<!--
title: Serverless Framework - Alibaba Cloud Function Compute Events - HTTP
menuText: HTTP
menuOrder: 1
description: Setting up HTTP events with Alibaba Cloud Function Compute via the Serverless Framework
layout: Doc
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/aliyun/events/http)

<!-- DOCS-SITE-LINK:END -->

# HTTP

Alibaba Cloud Function Compute can create function based API endpoints.

To create HTTP endpoints as event sources for your Alibaba Cloud Function Compute, use the `http` event syntax.

## HTTP events

### HTTP endpoint

This setup specifies that the `first` function should be run when someone accesses the Functions API endpoint via a `GET` request. You can get the URL for the endpoint by running the `serverless info` command after deploying your service.

Here's an example:

```yml
# serverless.yml

functions:
  hello:
    handler: index.hello
    events:
      - http:
          path: /foo
          method: get
```

```javascript
// index.js

exports.hello = (event, context, callback) => {
  const response = {
    statusCode: 200,
    body: JSON.stringify({ message: 'Hello!' }),
  };

  callback(null, response);
};
```

**Note:** See the documentation about the [function handlers](../guide/functions.md) to learn how your handler signature should look like to work with this type of event.
