<!--
title: Serverless Framework - Cloudflare Workers Guide - Debugging
menuText: Debugging
menuOrder: 8
description: Recommendations and best practices for debugging Cloudflare Workers with the Serverless Framework
layout: Doc
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/cloudflare/guide/debugging)

<!-- DOCS-SITE-LINK:END -->

# Cloudflare Workers - Debugging

How can we debug errors in our Cloudflare Workers functions?

Let's imagine that we have deployed the following code as a Cloudflare Worker function using Serverless:

```javascript
addEventListener('fetch', (event) => {
  event.respondWith(handleRequest(event.request));
});
async function handleRequest(request) {
  const answer = request.headers.get('greeting') || 'hello';
  return new Response(answer + ' world');
}
```

And its corresponding Serverless yml file:

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
          # Defines the method used by serverless when the `invoke` command is used. Cloudflare Workers only support GET requests for now
          method: GET
          headers:
            greeting: hi
```

Let's invoke correctly that function

```bash
serverless invoke --function helloWorld

# Output
hi world
```

If we were to call the above function without any headers, you would get `hello world` back instead of `hi world`, so we know that our worker is properly reading the greeting header.

## Cloudflare Workers Playground

Cloudflare Workers also have a [Playground](https://cloudflareworkers.com/#) you can use to modify a Cloudflare Worker and see the results live on the same screen. The Cloudflare Workers Playground is another great way to debug your worker.
