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

This setup specifies that the `first` function should be run when someone accesses the Functions API endpoint. You can get the URL for the endpoint by running the `serverless info` command after deploying your service.

Here's an example:

```yml
# serverless.yml

functions:
  first:
    handler: http
    events:
      - http: foo # the value of this key is ignored. It is the presence of the http key that matters to serverless.
```

```javascript
// index.js

exports.first = (request, response) => {
  response.status(200).send('Hello World!');
};
```

### Differences from other providers

The configuration for Google Cloud Functions is a bit different than some other providers:

- Your deployed endpoint from above will accept GET, POST, and all other HTTP verbs. If you want to disallow certain verbs, [you can do that within the method body](https://cloud.google.com/functions/docs/writing/http#handling_http_methods).
- All Google Cloud Functions are deployed as just the handler name at the root of the URL pathname. In the example above, this means your function is deployed to `https://YOUR_URL/http`. As a result, you cannot configure nested routes such as `http/hello` in your `serverless.yml` file. Instead, Google passes all URLs that appear to be subdirectories of your URL to your handler function so that you can determine the appropriate behavior. The complete path is still available as `req.path` and can be parsed to provide nested routes, path/URL parameters, and more.

**Note:** See the documentation about the [function handlers](../guide/functions.md) to learn how your handler signature should look like to work with this type of event.
