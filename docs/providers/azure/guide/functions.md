<!--
title: Serverless Framework - Azure Functions Guide - Functions
menuText: Functions
menuOrder: 5
description: How to configure Azure Functions in the Serverless Framework
layout: Doc
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/azure/guide/functions)

<!-- DOCS-SITE-LINK:END -->

# Azure - Functions

If you are using Azure Functions as a provider, all _functions_ inside the service are Azure Functions.

## Configuration

All of the Azure Functions in your serverless service can be found in
`serverless.yml` under the `functions` property.

```yml
# serverless.yml
service: azfx-node-http

provider:
  name: azure
  location: West US

plugins:
  - serverless-azure-functions

functions:
  hello:
    handler: templates/handler.hello
    events:
      - http: true
        x-azure-settings:
          authLevel: anonymous
```

The `handler` property points to the file (default filename: handler.js) and
module containing the code you want to run in your function.

```javascript
// handler.js
exports.handler = function(params) {};
```

You can add as many functions as you want within this property.

```yml
# serverless.yml
---
functions:
  functionOne:
    handler: handler.functionOne
    description: optional description for your Function
  functionTwo:
    handler: handler.functionTwo
  functionThree:
    handler: handler.functionThree
```

You can specify an array of functions, which is useful if you separate your functions in to different files:

```yml
# serverless.yml
---
functions:
  - ${file(./foo-functions.yml)}
  - ${file(./bar-functions.yml)}
```

```yml
# foo-functions.yml
getFoo:
  handler: handler.foo
deleteFoo:
  handler: handler.foo
```
