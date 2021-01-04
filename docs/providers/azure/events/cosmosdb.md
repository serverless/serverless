<!--
title: Serverless Framework - Azure Functions Events - Cosmos DB
menuText: Cosmos DB
menuOrder: 7
description: Setting up Cosmos DB Events with Azure Functions via the Serverless Framework
layout: Doc
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/azure/events/cosmosdb)

<!-- DOCS-SITE-LINK:END -->

# CosmosDB Trigger

The Azure Cosmos DB Trigger uses the Azure Cosmos DB Change Feed to listen for inserts and updates across partitions. The change feed publishes inserts and updates, not deletions.

Full documentation can be found on
[azure.com](https://docs.microsoft.com/en-us/azure/azure-functions/functions-bindings-cosmosdb-v2).

# Events

This setup describe how to write the data received, when someone
accesses the Function App at `api/cosmos` via a `POST` request
, to [Cosmos DB](https://docs.microsoft.com/en-us/azure/azure-functions/functions-bindings-cosmosdb-v2#output---javascript-examples)

## Serverless.yml

```yml
# serverless.yml

functions:
  cosmos:
    handler: src/handlers/cosmos.write
    events:
      - http: true
        methods:
          - POST
        authLevel: anonymous
      - cosmosDB:
        direction: out
        name: record # name of input parameter in function signature
        databaseName: sampleDB
        collectionName: sampleCollection
        connectionStringSetting: COSMOS_DB_CONNECTION # name of appsetting with the connection string
        createIfNotExists: true # A boolean value to indicate whether the collection is created when it doesn't exist.
```

## Sample post data

```json
{
  "name": "John Henry",
  "employeeId": "123456",
  "address": "A town nearby"
}
```

## Handler

```javascript
// src/handlers/cosmos.js

'use strict';
const uuidv4 = require('uuid/v4');

module.exports.write = async function (context, req) {
  context.log('JavaScript HTTP trigger function processed a request.');

  const input = req.body;

  const timestamp = Date.now();
  const uuid = uuidv4(); //

  const output = JSON.stringify({
    id: uuid,
    name: input.name,
    employeeId: input.employeeId,
    address: input.address,
    timestamp: timestamp,
  });

  context.bindings.record = output;

  context.log('Finish writing to CosmosDB');
};
```
