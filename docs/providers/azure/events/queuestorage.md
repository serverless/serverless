<!--
title: Serverless Framework - Azure Functions Events - Queue Storage
menuText: Queue Storage
menuOrder: 3
description: Setting up Queue Storage Events with Azure Functions via the Serverless Framework
layout: Doc
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/azure/events/queuestorage)

<!-- DOCS-SITE-LINK:END -->

# Queue Storage Trigger

Azure Functions queue storage trigger lets you listen on Azure Queue Storage.
Full documentation can be found on
[azure.com](https://docs.microsoft.com/en-us/azure/azure-functions/functions-bindings-storage-queue).

## Queue Storage Events

### Queue Storage Trigger

This setup specifies that the `hello` function should be run when a new queue
storage item appears on the queue "hello".

Here's an example:

```yml
# serverless.yml

functions:
  example:
    handler: handler.hello
    events:
      - queue: hello
        name: item #<string>, default - "myQueueItem", specifies which name is available on `context.bindings`
        connection: AzureWebJobsStorage #<string>, default - "AzureWebJobsStorage", environment variable which contains Storage Account Connection String
```

```javascript
// handler.js

'use strict';

module.exports.hello = function (context, item) {
  context.log('Received item: ${item}');
  context.done();
};
```
