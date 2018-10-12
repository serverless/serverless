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
The only type of event that is supported in Cloudflare Workers is HTTP events, so defining events in your `serverless.yml` is optional. Defined events in your `serverless.yml` are only used by the `serverless invoke` command, which can be useful for testing your Functions.
 
## Serverless Yml
When creating a service your serverless yml will define which endpoint is used for your function when you run the [`serverless invoke`](../cli-reference/invoke.md) command.
 
```yml
# serverless.yml
...
functions:
  helloWorld:
    # What the script will be called on Cloudflare
    worker: hello
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