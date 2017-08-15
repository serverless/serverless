<!--
title: Serverless Framework - Google Cloud Functions Events - HTTP
menuText: HTTP
menuOrder: 1
description: Setting up HTTP events with Google Cloud Functions via the Serverless Framework
layout: Doc
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->
### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/google/events/http)
<!-- DOCS-SITE-LINK:END -->

# HTTP

Google Cloud Functions can create function based API endpoints.

To create HTTP endpoints as event sources for your Google Cloud Functions, use the `http` event syntax.

It might be helpful to read the Google Cloud Functions [HTTP docs](https://cloud.google.com/functions/docs/writing/http) to learn the full functionality.

## HTTP events

### HTTP endpoint

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

```javascript
// index.js


exports.first = (request, response) => {
  response.status(200).send('Hello World!');
};
```

**Note:** See the documentation about the [function handlers](../guide/functions.md) to learn how your handler signature should look like to work with this type of event.
