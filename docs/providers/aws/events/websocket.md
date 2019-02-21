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


## Routes

The API-Gateway provides [4 types of routes](https://docs.aws.amazon.com/apigateway/latest/developerguide/apigateway-websocket-api-overview.html) which relate to the lifecycle of a ws-client:
* `$connect` called on connect of a ws-client
* `$disconnect` called on disconnect of a ws-client (may not be called in some situations)
* `$default` called if there is no handler to use for the event
* custom routes - called if the route name is specified for a handler

### Example serverless.yaml

This Serverless yaml will specify handlers for the `$connect`, `$disconnect`, `$default` and the custom `foo` event.

```yml
service: serverless-ws-test

provider:
  name: aws
  runtime: nodejs8.10
  websocketApiRouteSelectionExpression: $request.body.action # custom routes are selected by the value of the action property in the body

functions:
  connectionHandler:
    handler: handler.connectionHandler
    events:
      - websocket:
          route: $connect
      - websocket:
          route: $disconnect
  defaultHandler:
    handler: handler.defaultHandler
    events:
      - websocket: $default #simple event definition without extra route property
  customFooHandler:
    handler: handler.fooHandler
    events:
      - websocket:
          route: foo # will trigger if $request.body.action === "foo"
```

## Protect your Websocket backend
To protect your websocket connection use an authorizer function on the `$connect`-route handler. It is only possible to use an authorizer function on this route, as this is the only point in time, where it is possible to prevent the ws-client to connect to our backend at all. As the client is not able to connect, the client can also not use the other websocket routes.

It is also possible to return a "500" in the connection handler, to prevent the ws-client from connecting.

See this example:

```js
module.exports.connectionHandler = async (event, context) => {

  if(event.requestContext.routeKey === '$connect'){
    console.log("NEW CONNECTION INCOMMING");
    if (event.headers.token !== 'abc') {
      console.log('Connection blocked');
      return {
        statusCode: 500
      };
    }
  }

  console.log('Connection ok');
  return {
    statusCode: 200
  };
}
```

## Send a message to a ws-client
To send a message to a ws-client the [@connection](https://docs.amazonaws.cn/en_us/apigateway/latest/developerguide/apigateway-how-to-call-websocket-api-connections.html) command is used.

It uses the URL of the websocket API and most importantly the `connectionId` of the ws-client's connection. If you want to send a message to a ws-client from another function, you need this `connectionId` to address the ws-client.

Example on how to respond with the complete `event` to the same ws-client:

```js
const sendMessageToClient = (url, connectionId, payload) => new Promise((resolve, reject) => {
  const apigatewaymanagementapi = new AWS.ApiGatewayManagementApi({apiVersion: '2018-11-29', endpoint: url});
  apigatewaymanagementapi.postToConnection({
    ConnectionId: connectionId, // connectionId of the receiving ws-client
    Data: JSON.stringify(payload),
  }, (err, data) => {
    if (err) {
      console.log('err is', err);
      reject(err);
    }
    resolve(data);
  });
});

module.exports.defaultHandler = async (event, context) => {
  const domain = event.requestContext.domainName;
  const stage = event.requestContext.stage;
  const connectionId = event.requestContext.connectionId; 
  const callbackUrlForAWS = util.format(util.format('https://%s/%s', domain, stage)); //construct the needed url
  await sendMessageToClient(callbackUrlForAWS, connectionId, event);

  return {
    statusCode: 200
  };
}
```