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

# Functions

If you are using Azure Functions as a provider, all *functions* inside the service are Azure Functions.

## Configuration

All of the Azure Functions in your serverless service can be found in `serverless.yml` under the `functions` property.

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
           authLevel : anonymous
```

The `handler` property points to the file (default filename: handler.js) and module containing the code you want to run in your function.

```javascript
// handler.js
exports.handler = function(params) {}
```

You can add as many functions as you want within this property.

```yml
# serverless.yml
...

functions:
  functionOne:
    handler: handler.functionOne
    description: optional description for your Function
  functionTwo:
    handler: handler.functionTwo
  functionThree:
    handler: handler.functionThree
```
