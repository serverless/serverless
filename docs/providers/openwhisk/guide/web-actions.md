<!--
title: Serverless Framework - Apache OpenWhisk Guide - Web Actions
menuText: Web Actions
menuOrder: 6
description: Configuring Apache OpenWhisk Web Actions in the Serverless Framework
layout: Doc
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->
### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/openwhisk/guide/web-actions)
<!-- DOCS-SITE-LINK:END -->

# OpenWhisk - Web Actions

Functions can be turned into ["*web actions*"](http://bit.ly/2xSRbOQ) which return HTTP content without use of an API Gateway. This feature is enabled by setting an annotation (`web-export`) in the configuration file.

```
functions:
  my_function:
    handler: index.main
    annotations:
      web-export: true
```

Functions with this annotation can be invoked through a URL template with the following parameters.

```
https://{APIHOST}/api/v1/experimental/web/{USER_NAMESPACE}/{PACKAGE}/{ACTION_NAME}.{TYPE}

```

- *APIHOST* - platform endpoint e.g. *openwhisk.ng.bluemix.net.*
- *USER_NAMESPACE* - this must be an explicit namespace and cannot use the default namespace (_).
- *PACKAGE* - action package or `default`.
- *ACTION_NAME* - default form `${servicename}-${space}-${name}`.
- *TYPE* - `.json`, `.html`, `.text` or `.http`.

Return values from the function are used to construct the HTTP response. The following parameters are supported.

1. `headers`: a JSON object where the keys are header-names and the values are string values for those headers (default is no headers).
2. `code`: a valid HTTP status code (default is 200 OK).
3. `body`: a string which is either plain text or a base64 encoded string (for binary data).

Here is an example of returning HTML content:

```javascript
function main(args) {
    var msg = "you didn&#39;t tell me who you are."
    if (args.name) {
        msg = `hello ${args.name}!`
    }
    return {body:
       `<html><body><h3><center>${msg}</center></h3></body></html>`}
}
```

Here is an example of returning binary data:

```javascript
function main() {
   let png = <base 64 encoded string>
   return {
      headers: { "Content-Type": "image/png" },
      body: png };
}
```

Functions can access request parameters using the following environment variables.

1. `**__ow_meta_verb:**` the HTTP method of the request.
2. `**__ow_meta_headers:**` the request headers.
3. `**__ow_meta_path:**` the unmatched path of the request.

Full details on this new feature are available in this [blog post](https://medium.com/openwhisk/serverless-http-handlers-with-openwhisk-90a986cc7cdd#.2x09176m8).

**\*IMPORTANT: [Web Actions](http://bit.ly/2xSRbOQ) is currently experimental and may be subject to breaking changes.***
