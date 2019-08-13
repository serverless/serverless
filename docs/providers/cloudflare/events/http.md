<!--
title: Serverless Framework - Cloudflare Workers Events - HTTP Events
menuText: HTTP Events
menuOrder: 1
description: HTTP Events in Cloudflare Workers
layout: Doc
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/cloudflare/events/http)

<!-- DOCS-SITE-LINK:END -->

# Cloudflare Workers - HTTP Events

## Serverless Yml

When creating a service your serverless yml will define which endpoint is used for your function and when you run the [`serverless invoke`](../cli-reference/invoke.md) command.

```yml
# serverless.yml
---
functions:
  helloWorld:
    # What the script will be called on Cloudflare (this property value must match the function name one line above)
    name: helloWorld
    # The name of the script on your machine, omitting the .js file extension
    script: helloWorld
    events:
      - http:
          url: example.com/hello/user
          method: GET
          headers:
            greeting: hi
```

The events section in the yml above makes it so that the Function helloWorld will be used for request to the `example.com/hello/user` endpoint. This configuration would send a GET request with a header called `greeting` that has a value of `hi` to the `example.com/hello/user` endpoint when you run `serverless invoke -f helloWorld`.
