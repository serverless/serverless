<!--
title: Serverless Framework - Azure Functions Events - Other Bindings
menuText: Other Bindings
menuOrder: 7
description: Setting up Other Bindings Events with Azure Functions via the Serverless Framework
layout: Doc
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->
### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/azure/events/other)
<!-- DOCS-SITE-LINK:END -->

## Other Bindings

The Azure Functions plugin also supports additional input and output bindings.
These work by setting the direction explicitly. The properties go under the
`x-azure-settings` property and match the same properties expected in the
`function.json`, with the exception of "type" which is the first property's key.

You can learn about all the bindings Azure has to offer here on the
[official documentation](https://docs.microsoft.com/en-us/azure/azure-functions/functions-triggers-bindings).

## Example

This is an example of outputting data to Document DB.

```yml
# serverless.yml

functions:
  example:
    handler: handler.hello
    events:
      - queue: hello
        x-azure-settings:
            name: item #<string>, default - "myQueueItem", specifies which name it's available on `context.bindings`
            connection: AzureWebJobsStorage #<string>, default - "AzureWebJobsStorage", environment variable which contains Storage Account Connection String
      - documentDB:
        x-azure-settings:
            name: record # Name of input parameter in function signature>",
            databaseName: myDocs # "<Name of the DocumentDB database>",
            collectionName: todo # "<Name of the DocumentDB collection>",
            createIfNotExists: true
            connection: docDBAppSetting # "<Name of app setting with connection string - see below>",
            direction: out
```

```javascript
// handler.js

'use strict';

module.exports.hello = function(context, item) {
  context.log("Received item: ${item}");
  context.bindings.record = {
      hello: "world"
  }
  context.done();
};
```
