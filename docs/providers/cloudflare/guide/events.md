<!--
title: Serverless Framework - Clouldflare Workers Guide - Events
menuText: Events
menuOrder: 6
description: Configuring Cloudflare Workers Events in the Serverless Framework
layout: Doc
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/cloudflare/guide/events)

<!-- DOCS-SITE-LINK:END -->

# Cloudflare Workers - Events

Simply put, events are the things that trigger your functions to run.

If you are using Cloudflare Workers as your provider, all `events` in the service are HTTP Events, because that is the only event that Cloudflare Workers currently support.

```yml
# serverless.yml
…

functions:
  helloWorld:
    # What the script will be called on Cloudflare (this property value must match the function name one line above)
    name: helloWorld
    # The name of the script on your machine, omitting the .js file extension
    script: helloWorld
    # If you would like to develop using multiple scripts or libraries, you can automatically bundle with a simple predefined configuration.
    webpack: true
    events:
      - http:
          url: example.com/hello/user
          # Defines the method used by serverless when the `invoke` command is used. Cloudflare Workers only support GET requests for now
          method: GET
          headers:
            greeting: hi
```

Then [`serverless invoke -f helloWorld`](../cli-reference/invoke.md) will make a GET request to `example.com/hello/user` with a header called `greeting` that has a value of `hi`.

## Webpack

The webpack option under functions will automatically bundle the function if set to "true". This allows you to easily use multiple scripts or libraries and not worry about a complicated build pipeline.

For example

```
addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request))
});

import hello from './includeMe';

async function handleRequest(request) {
  return new Response(hello.hello())
}
```

If your handler script looks like the above, the includeMe script will be packed into the final script on deployment.

[View the Cloudflare Workers events section for more information on HTTP events](../events).
