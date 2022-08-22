<!--
title: Serverless Framework - AWS Lambda Events - Websocket
menuText: Websocket
menuOrder: 3
description: Setting up AWS Websockets with AWS Lambda via the Serverless Framework
layout: Doc
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/aws/events/websocket)

<!-- DOCS-SITE-LINK:END -->

# Websocket

[Websockets](https://www.w3.org/TR/websockets/) make it possible to add support for a bi-directional communication channel between clients and servers. Connection channels are kept alive and are re-used to exchange messages back-and-forth.

The Serverless Framework makes it possible to setup an [API Gateway powered](https://docs.aws.amazon.com/apigateway/latest/developerguide/apigateway-websocket-api-overview.html) Websocket backend with the help of the `websocket` event.

## Event Definition

### Simple

The following code will setup a websocket with a `$connect` route key:

```yml
functions:
  connectHandler:
    handler: handler.connectHandler
    events:
      - websocket: $connect
```

### Extended

This code will setup a websocket with a `$disconnect` route key:

```yml
functions:
  disconnectHandler:
    handler: handler.disconnectHandler
    events:
      - websocket:
          route: $disconnect
```

This code will setup a [RouteResponse](https://docs.aws.amazon.com/apigateway/latest/developerguide/apigateway-websocket-api-route-response.html), enabling you to respond to websocket messages by using the `body` parameter of your handler's callback response:

```yml
functions:
  helloHandler:
    handler: handler.helloHandler
    events:
      - websocket:
          route: hello
          routeResponseSelectionExpression: $default
```

## Routes

The API-Gateway provides [4 types of routes](https://docs.aws.amazon.com/apigateway/latest/developerguide/apigateway-websocket-api-overview.html) which relate to the lifecycle of a ws-client:

- `$connect` called on connect of a ws-client
- `$disconnect` called on disconnect of a ws-client (may not be called in some situations)
- `$default` called if there is no handler to use for the event
- custom routes - called if the route name is specified for a handler

### Example serverless.yaml

This Serverless yaml will specify handlers for the `$connect`, `$disconnect`, `$default` and the custom `foo` event.

```yml
service: serverless-ws-test

provider:
  name: aws
  runtime: nodejs14.x
  websocketsApiName: custom-websockets-api-name
  websocketsApiRouteSelectionExpression: $request.body.action # custom routes are selected by the value of the action property in the body
  websocketsDescription: Custom Serverless Websockets

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

## Using Authorizers

You can enable an authorizer for your connect route by specifying the `authorizer` key in the websocket event definition.

**Note:** AWS only supports authorizers for the `$connect` route.

```yml
functions:
  connectHandler:
    handler: handler.connectHandler
    events:
      - websocket:
          route: $connect
          authorizer: auth # references the auth function below
  auth:
    handler: handler.auth
```

Or, if your authorizer function is not managed by this service, you can provide an arn instead:

```yml
functions:
  connectHandler:
    handler: handler.connectHandler
    events:
      - websocket:
          route: $connect
          authorizer: arn:aws:lambda:us-east-1:1234567890:function:auth
```

By default, the `identitySource` property is set to `route.request.header.Auth`, meaning that your request must include the auth token in the `Auth` header of the request. You can overwrite this by specifying your own `identitySource` configuration:

```yml
functions:
  connectHandler:
    handler: handler.connectHandler
    events:
      - websocket:
          route: $connect
          authorizer:
            name: auth
            identitySource:
              - 'route.request.header.Auth'
              - 'route.request.querystring.Auth'

  auth:
    handler: handler.auth
```

With the above configuration, you can now must pass the auth token in both the `Auth` query string as well as the `Auth` header.

You can also supply an ARN instead of the name when using the object syntax for the authorizer:

```yml
functions:
  connectHandler:
    handler: handler.connectHandler
    events:
      - websocket:
          route: $connect
          authorizer:
            arn: arn:aws:lambda:us-east-1:1234567890:function:auth
            identitySource:
              - 'route.request.header.Auth'
              - 'route.request.querystring.Auth'

  auth:
    handler: handler.auth
```

## Send a message to a ws-client

To send a message to a ws-client the [@connection](https://docs.amazonaws.cn/en_us/apigateway/latest/developerguide/apigateway-how-to-call-websocket-api-connections.html) command is used.

It uses the URL of the websocket API and most importantly the `connectionId` of the ws-client's connection. If you want to send a message to a ws-client from another function, you need this `connectionId` to address the ws-client.

Example on how to respond with the complete `event` to the same ws-client:

```js
const sendMessageToClient = (url, connectionId, payload) =>
  new Promise((resolve, reject) => {
    const apigatewaymanagementapi = new AWS.ApiGatewayManagementApi({
      apiVersion: '2018-11-29',
      endpoint: url,
    });
    apigatewaymanagementapi.postToConnection(
      {
        ConnectionId: connectionId, // connectionId of the receiving ws-client
        Data: JSON.stringify(payload),
      },
      (err, data) => {
        if (err) {
          console.log('err is', err);
          reject(err);
        }
        resolve(data);
      }
    );
  });

module.exports.defaultHandler = async (event, context) => {
  const domain = event.requestContext.domainName;
  const stage = event.requestContext.stage;
  const connectionId = event.requestContext.connectionId;
  const callbackUrlForAWS = util.format(util.format('https://%s/%s', domain, stage)); //construct the needed url
  await sendMessageToClient(callbackUrlForAWS, connectionId, event);

  return {
    statusCode: 200,
  };
};
```

## Respond to a ws-client message

To respond to a websocket message from your handler function, [Route Responses](https://docs.aws.amazon.com/apigateway/latest/developerguide/apigateway-websocket-api-route-response.html) can be used. Set the `routeResponseSelectionExpression` option to enable this. This option allows you to respond to a websocket message using the `body` parameter.

```yml
functions:
  sayHelloHandler:
    handler: handler.sayHello
    events:
      - websocket:
          route: hello
          routeResponseSelectionExpression: $default
```

```js
module.exports.helloHandler = async (event, context) => {
  const body = JSON.parse(event.body);
  return {
    statusCode: 200,
    body: `Hello, ${body.name}`,
  };
};
```

## Logs

Use the following configuration to enable Websocket logs:

```yml
# serverless.yml
provider:
  name: aws
  logs:
    websocket: true
```

The log streams will be generated in a dedicated log group which follows the naming schema `/aws/websocket/{service}-{stage}`.

The default log level will be INFO. You can change this to error with the following:

```yml
# serverless.yml
provider:
  name: aws
  logs:
    websocket:
      level: ERROR
```

Valid values are INFO, ERROR.

You can specify your own [format for API Gateway Access Logs](https://docs.aws.amazon.com/apigateway/latest/developerguide/websocket-api-logging.html) by including your preferred string in the `format` property:

```yml
# serverless.yml
provider:
  name: aws
  logs:
    websocket:
      format: '{ "requestId":"$context.requestId",   "ip": "$context.identity.sourceIp" }'
```

The existence of the `logs` property enables both access and execution logging. If you want to disable one or both of them, you can do so with the following:

```yml
# serverless.yml
provider:
  name: aws
  logs:
    websocket:
      accessLogging: false
      executionLogging: false
```

By default, the full requests and responses data will be logged. If you want to disable like so:

```yml
# serverless.yml
provider:
  name: aws
  logs:
    websocket:
      fullExecutionData: false
```

## Tags

When using Websocket API, it is possible to tag the corresponding API Gateway resources. By setting `provider.websocket.useProviderTags` to `true`, all tags defined on `provider.tags` will be applied to API Gateway and API Gateway Stage.

```yaml
provider:
  tags:
    project: myProject
  websocket:
    useProviderTags: true
```

In the above example, the tag project: myProject will be applied to API Gateway and API Gateway Stage.
