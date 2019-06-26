<!--
title: Serverless Framework - Fn Events - HTTP Events
menuText: HTTP Events
menuOrder: 1
description: HTTP Events in Fn
layout: Doc
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/fn/events/http)

<!-- DOCS-SITE-LINK:END -->

# Fn HTTP Events

The first type of events that you can create in Fn are HTTP events.

When creating HTTP events you just call the endpoints you have made with http.

## Serverless Yaml

When creating a service your serverless yaml will define which endpoint is used for your functions.

```yaml
service: hello-world

functions: # Your "Functions"
  hello:
    name: hi
    version: 0.0.1
    runtime: go
    events:
      - http:
          path: /hello
```

The events section in the yaml above makes it so that the Function hi will be
used for request to the `FN_API_URL/r/hello-world/hello`
