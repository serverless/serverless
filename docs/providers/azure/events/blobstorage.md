<!--
title: Serverless Framework - Azure Functions Events - Blob Storage
menuText: Blob Storage
menuOrder: 6
description: Setting up Blob Storage Events with Azure Functions via the Serverless Framework
layout: Doc
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/azure/events/blobstorage)

<!-- DOCS-SITE-LINK:END -->

# Blob Storage Trigger

Azure Functions Blob Storage trigger lets you listen on Azure Blob Storage. Full
documentation can be found on
[azure.com](https://docs.microsoft.com/en-us/azure/azure-functions/functions-bindings-storage-blob).

## Blob Storage Events

### Blob Storage Trigger

This setup specifies that the `hello` function should be run when a new Blob
Storage item appears on the blob container "hello/{name}", where `{name}` is the
name of the blob uploaded..

Here's an example:

```yml
# serverless.yml

functions:
  example:
    handler: handler.hello
    events:
      - blob:
        name: item #<string>, default - "myBlob", specifies which name is available on `context.bindings`
        path: hello/{name}
        connection: AzureWebJobsStorage #<string>, default - "AzureWebJobsStorage", App Setting/environment variable which contains Storage Account Connection String
```

```javascript
// handler.js

'use strict';

module.exports.hello = function (context, item) {
  context.log('Received item: ${item}');
  context.done();
};
```
