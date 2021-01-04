<!--
title: Serverless Framework - Cloudflare Workers Guide - Functions
menuText: Functions
menuOrder: 5
description: How to configure Cloudflare Workers functions in the Serverless Framework
layout: Doc
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/cloudflare/guide/functions)

<!-- DOCS-SITE-LINK:END -->

# Cloudflare Workers - Functions

If you are using Cloudflare as a provider, all _functions_ inside the service are Cloudflare Workers.

## Configuration

All of the Cloudflare Workers in your serverless service can be found in `serverless.yml` under the `functions` property.

```yml
# serverless.yml

service:
  name: hello-world

provider:
  name: cloudflare
  config:
    accountId: CLOUDFLARE_ACCOUNT_ID
    zoneId: CLOUDFLARE_ZONE_ID

plugins:
  - serverless-cloudflare-workers

functions:
  helloWorld:
    # What the script will be called on Cloudflare (this property value must match the function name one line above)
    name: helloWorld
    # The name of the script on your machine, omitting the .js file extension
    script: helloWorld
    # Events are only relevant to the `serverless invoke` command and don’t affect deployment in any way
    events:
      - http:
          url: example.com/hello/*
          method: GET
          headers:
            someKey: someValue
```

The `script` property points to the file containing your Cloudflare Worker.

```javascript
// helloWorld.js

addEventListener('fetch', (event) => {
  event.respondWith(handleRequest(event.request));
});

async function handleRequest(request) {
  return new Response('Hello world');
}
```

If you have an Enterprise Cloudflare account, you can add multiple Cloudflare Workers to your project.

```yml
# serverless.yml

service:
  name: hello-world

provider:
  name: cloudflare
  config:
    accountId: CLOUDFLARE_ACCOUNT_ID
    zoneId: CLOUDFLARE_ZONE_ID

plugins:
  - serverless-cloudflare-workers

functions:
  helloWorld:
    # What the script will be called on Cloudflare (this property value must match the function name one line above)
    name: helloWorld
    # The name of the script on your machine, omitting the .js file extension
    script: helloWorld
    # Events are only relevant to the `serverless invoke` command and don’t affect deployment in any way
    events:
      - http:
          url: example.com/hello/*
          method: GET
          headers:
            someKey: someValue

  # Only Enterprise accounts would be allowed to add this second function and its corresponding route above
  foo:
    name: foo
    script: bar
    events:
      - http:
          url: example.com/foo/*
          method: GET
```

The `script` property is what the Cloudflare Worker will be called on Cloudflare’s data centers.
