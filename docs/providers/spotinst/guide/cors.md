<!--
title: Serverless Framework - Spotinst Functions Guide - CORS
menuText: CORS
menuOrder: 8
description: How to enable and use CORS
layout: Doc
-->

<!-- DOCS-SITE-LINK:START automatically generated -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/spotinst/guide/cors)

<!-- DOCS-SITE-LINK:END -->

# Spotinst Functions - CORS

Cross-Origin Resource Sharing is a mechanism that allows restricted resources on a web page to be requested from a domain outside of the original. CORS defines a way in which a web service and server can interact to determine whether or not it is safe to allow a cross-origin request. Enabling CORS for your function allows you to specify safe domains, and enables out-of-the-box support for preflight HTTP requests (via the OPTIONS method) that will return the needed ‘access-control-\*’ headers specified below. The actual HTTP request will return the ‘access-control-allow-origin’ method.
You can enable CORS for cross-domain HTTP requests with Spotinst Functions. Add the required fields to you serverless.yml file.

### Example CORS object:

```yml
cors:
  - enabled: true
  - origin: 'http://foo.example'
  - headers: 'Content-Type,X-PINGOTHER'
  - methods: 'PUT,POST'
```

### Parameters:

- enabled: Boolean
  - Specify if CORS is enabled for the function.
  - default: false
- origin: String
  - Specifies a domain/origin that may access the resource. A wildcard '\*' may be used to allow any origin to access the resource.
  - default: '\*'
- methods: String
  - Comma-separated list of HTTP methods that are allowed to access the resource. This is used in response to a preflight request.
  - default: 'DELETE,GET,HEAD,OPTIONS,PATCH,POST,PUT'
- headers: String
  - Comma-separated list of allowed headers.
  - default: 'Content-Type,Authorization'
