<!--
title: WebSocket API Events
description: 'Run AWS Lambda functions on Amazon API Gateway WebSocket API routes with the websocket event: authorizers, messages to clients, logs and tags.'
short_title: WebSocket API
keywords:
  [
    'Serverless Framework',
    'AWS Lambda WebSocket',
    'API Gateway WebSocket API',
    'websocket event',
    'postToConnection',
    'WebSocket $connect authorizer',
  ]
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/aws/events/websocket)

<!-- DOCS-SITE-LINK:END -->

# WebSocket API Events

The `websocket` event connects a Lambda function to a route of an [Amazon API Gateway WebSocket API](https://docs.aws.amazon.com/apigateway/latest/developerguide/apigateway-websocket-api-overview.html). Clients keep a connection open and exchange messages in both directions; API Gateway invokes the function for each route. The Framework creates one WebSocket API per service, with a stage named after the service stage, unless you attach the routes to an [existing WebSocket API](#use-an-existing-websocket-api).

This `serverless.yml` handles connects, disconnects and every message:

```yaml
# serverless.yml
service: my-service

provider:
  name: aws
  runtime: nodejs24.x

functions:
  connectionHandler:
    handler: handler.connectionHandler
    events:
      - websocket: $connect
      - websocket: $disconnect
  defaultHandler:
    handler: handler.defaultHandler
    events:
      - websocket: $default
```

The handlers return a status code; `event.requestContext.connectionId` identifies the client:

```javascript
// handler.mjs
export const connectionHandler = async (event) => {
  console.log(event.requestContext.eventType, event.requestContext.connectionId)
  return { statusCode: 200 }
}

export const defaultHandler = async (event) => {
  console.log(event.requestContext.connectionId, event.body)
  return { statusCode: 200 }
}
```

After `serverless deploy`, the `ServiceEndpointWebsocket` stack output holds the URL clients connect to, `wss://<api-id>.execute-api.<region>.amazonaws.com/<stage>`. `serverless info --verbose` prints it.

## Routes

A `websocket` event takes a route key, as a string (`websocket: $connect`) or as `route` in an object (`websocket: { route: $connect }`). API Gateway has three predefined routes and any number of custom routes:

- `$connect`: a client opens a connection.
- `$disconnect`: the connection closed. API Gateway invokes it on a best-effort basis.
- `$default`: a message matched no other route.
- A custom route, such as `foo`: a message whose route selection value is `foo`.

The route selection expression decides which value of a message selects the route. It defaults to `$request.body.action`, so this function receives messages like `{"action": "foo"}`:

```yaml
functions:
  customFooHandler:
    handler: handler.fooHandler
    events:
      - websocket:
          route: foo
```

## WebSocket API settings

These `provider` keys configure the WebSocket API the Framework creates:

| Key                                     | Default                        | Description                                                                                                                       |
| --------------------------------------- | ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------- |
| `websocketsApiName`                     | `<stage>-<service>-websockets` | The API's name.                                                                                                                   |
| `websocketsApiRouteSelectionExpression` | `$request.body.action`         | The [route selection expression](https://docs.aws.amazon.com/apigateway/latest/developerguide/websocket-api-develop-routes.html). |
| `websocketsDescription`                 | `Serverless Websockets`        | The description of the API, its stage and its deployments.                                                                        |

```yaml
provider:
  name: aws
  websocketsApiName: custom-websockets-api-name
  websocketsApiRouteSelectionExpression: $request.body.route
  websocketsDescription: Custom Serverless Websockets
```

## Respond to a ws-client message

To send the function's response back to the client that sent the message, set the `websocket` event's `routeResponseSelectionExpression` to `$default`, the only value it accepts. The Framework then creates a [route response](https://docs.aws.amazon.com/apigateway/latest/developerguide/apigateway-websocket-api-route-response.html), and API Gateway sends the `body` of the function's return value to the client:

```yaml
functions:
  sayHelloHandler:
    handler: handler.sayHello
    events:
      - websocket:
          route: hello
          routeResponseSelectionExpression: $default
```

```javascript
// handler.mjs
export const sayHello = async (event) => {
  const body = JSON.parse(event.body)
  return {
    statusCode: 200,
    body: `Hello, ${body.name}`,
  }
}
```

## Send a message to a ws-client

To send a message to a client at any time, call the [`@connections` API](https://docs.aws.amazon.com/apigateway/latest/developerguide/apigateway-how-to-call-websocket-api-connections.html) with the client's `connectionId`. A function that sends messages to other clients needs their `connectionId`, so store it, for example in DynamoDB from the `$connect` handler.

This handler sends the received event back to the client that sent it, with the AWS SDK for JavaScript v3:

```javascript
// handler.mjs
import {
  ApiGatewayManagementApiClient,
  PostToConnectionCommand,
} from '@aws-sdk/client-apigatewaymanagementapi'

export const defaultHandler = async (event) => {
  const { domainName, stage, connectionId } = event.requestContext
  const client = new ApiGatewayManagementApiClient({
    endpoint: `https://${domainName}/${stage}`,
  })

  await client.send(
    new PostToConnectionCommand({
      ConnectionId: connectionId,
      Data: JSON.stringify(event),
    }),
  )

  return { statusCode: 200 }
}
```

When clients connect through a [custom domain name](../guide/domains.md), `domainName` is that domain, and the endpoint has no stage: use `https://${domainName}`.

Calling the `@connections` API needs `execute-api:ManageConnections`. The Framework adds that permission, on `arn:<partition>:execute-api:*:*:*/@connections/*`, in these cases:

- When the Framework creates the WebSocket API, it adds the permission to the IAM role it generates for the service, which every function without its own role uses.
- A function with a role the Framework generates for it alone (per-function IAM roles) gets the permission when the function has a `websocket` event, also with an existing WebSocket API.

The Framework adds nothing to a role you provide with `provider.iam.role` or a function's `role`, and nothing to the service role when the routes go to an existing WebSocket API. In those cases, and for a function without a `websocket` event of its own, add the permission to the function's role. See [IAM permissions for functions](../guide/iam.md).

## Using authorizers

To authorize clients when they connect, set `authorizer` on the `websocket` event of the `$connect` route. API Gateway supports authorizers only on `$connect`; the Framework doesn't check the route, so set it there.

The `authorizer` takes the name of a function in the service:

```yaml
functions:
  connectHandler:
    handler: handler.connectHandler
    events:
      - websocket:
          route: $connect
          authorizer: auth
  auth:
    handler: handler.auth
```

For a function that isn't in the service, give its ARN instead:

```yaml
functions:
  connectHandler:
    handler: handler.connectHandler
    events:
      - websocket:
          route: $connect
          authorizer: arn:aws:lambda:us-east-1:123456789012:function:auth
```

The Framework creates a Lambda `REQUEST` authorizer and the permission that lets API Gateway invoke the authorizer function, for both forms. The authorizer reads the `Auth` header (`route.request.header.Auth`) by default; a connection request without it gets HTTP 401 without invoking the function.

To read other values, use the object form with `name` or `arn` and `identitySource`. API Gateway invokes the authorizer only when every identity source is present, so this example needs both the `Auth` header and the `Auth` query string parameter:

```yaml
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

With a string `arn`, the authorizer's name is the last part of the ARN, also when `name` is set. When `arn` is a CloudFormation intrinsic function instead of a string, `name` is required; without it the deploy stops with `Websocket Authorizer: Non-string "arn" needs to be accompanied with "name"`.

```yaml
functions:
  connectHandler:
    handler: handler.connectHandler
    events:
      - websocket:
          route: $connect
          authorizer:
            arn: arn:aws:lambda:us-east-1:123456789012:function:auth
            identitySource:
              - 'route.request.header.Auth'
              - 'route.request.querystring.Auth'
```

## Use an existing WebSocket API

To attach the routes to a WebSocket API that another service or stack manages, set `provider.apiGateway.websocketApiId` to its ID, or to a CloudFormation intrinsic function such as `Fn::ImportValue`:

```yaml
provider:
  name: aws
  apiGateway:
    websocketApiId: a1b2c3d4e5
```

The Framework then creates the routes, integrations and a deployment, but not the API or a stage. The deployment goes to the stage named after the service stage (for example `dev`), which must already exist on the API. `provider.logs.websocket` and `provider.websocket.useProviderTags` have no effect, and the service role doesn't get `execute-api:ManageConnections` (see [Send a message to a ws-client](#send-a-message-to-a-ws-client)).

## Logs

To turn on logging for the WebSocket API's stage, set `provider.logs.websocket` to `true`:

```yaml
provider:
  name: aws
  logs:
    websocket: true
```

Without `logs.websocket`, the stage has no logging. With it, the Framework turns on both access logs and execution logs. Access logs go to the log group `/aws/websocket/<service>-<stage>`, which keeps logs for `provider.logRetentionInDays` days when that is set.

The object form changes these settings:

```yaml
provider:
  name: aws
  logs:
    websocket:
      level: ERROR
      format: '{ "requestId":"$context.requestId", "ip": "$context.identity.sourceIp" }'
      accessLogging: true
      executionLogging: true
      fullExecutionData: false
```

| Key                 | Default                | Description                                                                                                       |
| ------------------- | ---------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `level`             | `INFO`                 | Execution log level, `INFO` or `ERROR`. With `executionLogging: false`, the level is `OFF`.                       |
| `format`            | The Framework's format | The [access log format](https://docs.aws.amazon.com/apigateway/latest/developerguide/websocket-api-logging.html). |
| `accessLogging`     | `true`                 | Writes access logs to the log group.                                                                              |
| `executionLogging`  | `true`                 | Writes execution logs.                                                                                            |
| `fullExecutionData` | `true`                 | Logs full request and response data in execution logs.                                                            |

Any other `level` stops the deploy with `provider.logs.websocket.level is set to an invalid value`.

API Gateway writes logs only with a CloudWatch Logs role set for the account in the Region. With `logs.websocket` set, the Framework sets up that role with a custom resource, as it does for REST API logs. `logs.websocket` has no `role` or `roleManagedExternally` keys: `provider.logs.restApi.role` and `provider.logs.restApi.roleManagedExternally` control the setup for both (see [REST API logs](./apigateway.md#logs)).

## Tags

To apply `provider.tags` to the WebSocket API, set `provider.websocket.useProviderTags` to `true`:

```yaml
provider:
  name: aws
  tags:
    project: myProject
  websocket:
    useProviderTags: true
```

The tags go to the WebSocket API (`AWS::ApiGatewayV2::Api`); the stage isn't tagged. Without `useProviderTags`, the WebSocket API gets no tags, and when `provider.tags` is set the Framework prints a deprecation notice (`AWS_WEBSOCKET_API_USE_PROVIDER_TAGS`) suggesting `useProviderTags: true`.

## Related

- [WebSocket settings in the `serverless.yml` reference](../guide/serverless.yml.md#websocket-api)
- [Custom domains](../guide/domains.md): serve the WebSocket API on your own domain name.
- [HTTP API events](./http-api.md): request-response HTTP endpoints.
