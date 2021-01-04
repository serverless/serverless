<!--
title: Serverless Framework - Azure Functions Events - Service Bus
menuText: Service Bus
menuOrder: 4
description: Setting up Service Bus Events with Azure Functions via the Serverless Framework
layout: Doc
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/azure/events/servicebus)

<!-- DOCS-SITE-LINK:END -->

# Service Bus Trigger

Azure Functions Service Bus trigger lets you listen on Azure Service Bus. Full documentation can be found on [azure.com](https://docs.microsoft.com/en-us/azure/azure-functions/functions-bindings-service-bus).

## Service Bus Events

### Service Bus Queue Trigger

This setup specifies that the `hello` function should be run when a new Service
Bus Queue item appears on the queue "hello".

Here's an example:

```yml
# serverless.yml

functions:
  example:
    handler: handler.hello
    events:
      - serviceBus:
        name: item #<string>, default - "mySbMsg", specifies which name is available on `context.bindings`
        queueName: hello #<string>, specifies the queue name to listen on
        accessRights: manage #<enum manage|listen>, specifies the permission to use when listening on the queue (manage will create queue if not exists)
        connection: ServiceBusConnection #<string>, environment variable which contains Service Bus Namespace Connection String
```

```javascript
// handler.js

'use strict';

module.exports.hello = function (context, item) {
  context.log('Received item: ${item}');
  context.done();
};
```

### Service Bus Topic Trigger

This setup specifies that the `hello` function should be run when a new Service
Bus Topic item appears on the subscription "hello".

Here's an example:

```yml
# serverless.yml

functions:
  example:
    handler: handler.hello
    events:
      - serviceBus:
        name: item #<string>, default - "mySbMsg", specifies which name it's available on `context.bindings`
        topicName: 'hello' #<string>, topic to listen on
        subscriptionName: 'hello' #<string>, subscription to listen on
        connection: ServiceBusConnection #<string>, environment variable which contains Service Bus Namespace Connection String
```

```javascript
// handler.js

'use strict';

module.exports.hello = function (context, item) {
  context.log('Received item: ${item}');
  context.done();
};
```
