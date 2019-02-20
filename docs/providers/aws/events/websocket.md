<!--
title: Serverless Framework - AWS Lambda Events - Websocket
menuText: Websocket
menuOrder: 2
description: Setting up AWS Websockets with AWS Lambda via the Serverless Framework
layout: Doc
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->
### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/aws/events/websocket)
<!-- DOCS-SITE-LINK:END -->

# Websocket

[Websockets](https://www.w3.org/TR/websockets/) make it possible to add support for a bi-directional communication channel between clients and servers. Connection channels are kept alive and are re-used to exchange messages back-and-forth.

The Serverless Framework makes it possible to setup an [API Gateway powered](https://docs.aws.amazon.com/apigateway/latest/developerguide/apigateway-websocket-api-overview.html) Websocket backend with the help of the `websocket` event.

## Simple event definition

The following code will setup a websocket with a `$connect` route key:

```yml
functions:
  connectHandler:
    handler: index.connect
    events:
      - websocket: $connect
```

## Extended event definition

This code will setup a websocket with a `$disconnect` route key:

```yml
functions:
  disonnectHandler:
    handler: index.disconnect
    events:
      - websocket:
          route: $disconnect
```
