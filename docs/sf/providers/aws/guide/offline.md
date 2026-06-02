<!--
title: Serverless Framework - Offline
short_title: Offline
description: Run your AWS Lambda functions locally behind the API Gateway edge with the built-in Serverless Framework offline command
keywords:
  [
    'Serverless Framework',
    'AWS Lambda',
    'offline',
    'local development',
    'API Gateway',
    'REST',
    'ALB',
    'WebSocket',
    'Schedule',
  ]
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/aws/guide/offline)

<!-- DOCS-SITE-LINK:END -->

# Offline

The `offline` command runs your Lambda functions on your machine behind the API Gateway edge. It emulates the API Gateway edge (HTTP API and REST), ALB, WebSocket, runs your Lambdas locally (Node in-process/worker, plus Python, Ruby, Go, and Java), fires `schedule` events, and exposes a local AWS **Lambda Invoke** endpoint — so you can exercise your service without deploying anything.

It is built into the Framework. There is nothing to install, and it reads the same `serverless.yml` you deploy with: your `functions:` and their `events:`.

For the full list of flags and how to configure Offline under `custom.serverless-offline`, see the [offline CLI reference](../cli-reference/offline.md).

## Quick start

From a service directory, run:

```bash
serverless offline
```

Offline binds a port per surface, matching the community plugin:

- **`httpPort`** (default `3000`) — your HTTP API and REST API edge.
- **`websocketPort`** (default `3001`) — the WebSocket edge and the `@connections` management endpoint. Bound only when your service declares `websocket` events.
- **`lambdaPort`** (default `3002`) — the AWS **Lambda Invoke** API endpoint. Point a Lambda SDK client at it to invoke your functions locally.
- **`albPort`** (default `3003`) — the ALB edge. Bound only when your service declares `alb` events.

### Configuration

Configure Offline either in `serverless.yml` under `custom.serverless-offline` (the same config home and property names the community [`serverless-offline`](https://github.com/dherault/serverless-offline) plugin uses) or with CLI flags. There is no top-level `offline:` block — if you add one the Framework warns about unrecognized configuration.

```yaml
custom:
  serverless-offline:
    httpPort: 3000
    lambdaPort: 3002
    useInProcess: true
```

Precedence is **CLI flags > `custom.serverless-offline` > defaults**, so a flag always overrides the matching config key.

A few notes:

- **Each surface binds its own port**, matching the community plugin: `httpPort` (default `3000`) serves HTTP API and REST; `websocketPort` (default `3001`) serves WebSocket and the `@connections` management endpoint; `albPort` (default `3003`) serves ALB; `lambdaPort` (default `3002`) is the separate Lambda Invoke endpoint.
- **Hot reload defaults OFF.** Enable it with `--watch`, with `--reloadHandler`, or with `custom.serverless-offline.reloadHandler: true`. `reloadHandler` maps to the built-in file watch, so `reloadHandler: false` (or `--noWatch`) turns it off. Hot reload is also disabled automatically when a bundler plugin (the built-in esbuild support or `serverless-esbuild`) owns the build.
- **Some `serverless-offline` keys are accepted but ignored.** `preLoadModules` and `resourceRoutes` are ignored; `noSponsor` is accepted and silently ignored. A one-time boot warning lists any ignored keys it finds.

For the full flag and key reference, see the [offline CLI reference](../cli-reference/offline.md).

### Handler environment and AWS credentials

Each invoked handler receives an environment that includes:

- `IS_OFFLINE=true`
- the `AWS_LAMBDA_*` Lambda runtime variables and the region

Offline does **not** inject `AWS_ENDPOINT_URL` and does **not** force placeholder credentials. Your handler's AWS SDK calls therefore use your **normal AWS credentials and go to real AWS** for every service — S3, SQS, SNS, DynamoDB, EventBridge, and everything else — exactly like `serverless-offline`. There is no local emulation of those services.

The only thing served locally for the AWS SDK is the **Lambda Invoke** endpoint on `lambdaPort`. See [Calling another Lambda locally](#calling-another-lambda-locally) below.

### Calling another Lambda locally

Because no endpoint is injected, a handler reaches the local Lambda Invoke endpoint only by setting its client `endpoint` itself, gated on `IS_OFFLINE`:

```js
import { LambdaClient } from '@aws-sdk/client-lambda'

const lambda = new LambdaClient(
  process.env.IS_OFFLINE ? { endpoint: 'http://localhost:3002' } : {},
)
```

When deployed (`IS_OFFLINE` unset) the client uses its default AWS endpoint; locally it targets the offline Lambda Invoke endpoint. This mirrors `serverless-offline`'s documented pattern.

## What happens when you run it

When the server is ready, Offline prints a banner listing the routes it is serving (HTTP API, REST, ALB, WebSocket, and Schedule triggers), with their methods and paths.

From that point on, your HTTP/REST/ALB/WebSocket routes and `schedule` events are **live triggers** — the same wiring you declared for deployment.

Edit a handler file and the next invocation reflects your change — no restart needed. This hot reload defaults OFF; enable it with `--watch`, `--reloadHandler`, or `custom.serverless-offline.reloadHandler: true`. Even when enabled, it is automatically disabled when a bundler plugin (for example the built-in esbuild support or `serverless-esbuild`) is managing your build, since the bundler owns recompilation in that case. For non-Node runtimes, files are read fresh on each invocation.

## Event sources

You declare event sources exactly as you do for a deployment. Below is what each one looks like locally.

### HTTP API (payload format 2.0)

```yaml
functions:
  hello:
    handler: handler.hello
    events:
      - httpApi:
          method: GET
          path: /hello
```

`curl http://localhost:3000/hello` invokes the handler. The handler receives a payload-format-2.0 event: `rawPath`, `rawQueryString`, a `requestContext.http` block, and `cookies` surfaced as a separate array (the `Cookie` header is removed from `headers`, matching AWS). Return either a plain value or a `{ statusCode, headers, body }` object.

### REST API and request/response templates

```yaml
functions:
  create:
    handler: handler.create
    events:
      - http:
          method: POST
          path: items
```

REST routes are served under the stage, for example `http://localhost:3000/dev/items`. Use `--noPrependStageInUrl` to drop the stage segment, or `--prefix api` to insert a path segment after the stage.

Velocity request and response templates are evaluated locally. If you declare `request.template` mapping templates, the rendered object is what your handler receives; if you declare `response.template`, it is applied to the handler's return value before the HTTP response is sent. Lambda-proxy integration (the default) passes the raw proxy event through unchanged.

See the [`rest-crud` reference app](https://github.com/serverless/serverless/tree/main/docs/examples/offline/rest-crud) for a complete CRUD service.

### ALB

```yaml
functions:
  api:
    handler: handler.api
    events:
      - alb:
          listenerArn: arn:aws:elasticloadbalancing:us-east-1:000000000000:listener/app/my-lb/abc/def
          priority: 1
          conditions:
            path: /alb
```

ALB routes are served on `albPort` (default `3003`). The handler receives an ALB event whose request header names are **lowercased**, matching how real ALB delivers headers. Respond with `{ statusCode, statusDescription, headers, body }`.

### WebSocket

```yaml
functions:
  connect:
    handler: handler.connect
    events:
      - websocket:
          route: $connect
  message:
    handler: handler.message
    events:
      - websocket:
          route: $default
```

Connect a WebSocket client to `ws://localhost:3001`. The `$connect`, `$disconnect`, and route-selected handlers fire as clients connect, disconnect, and send frames.

To push messages back to a client, use the API Gateway Management API `@connections` endpoint — it is served on `websocketPort`. Build the client endpoint from the event's `requestContext.domainName`/`stage` (offline sets `domainName` to `localhost:<websocketPort>`, e.g. `localhost:3001`, so it resolves locally):

```js
import {
  ApiGatewayManagementApiClient,
  PostToConnectionCommand,
} from '@aws-sdk/client-apigatewaymanagementapi'

const { domainName, stage } = event.requestContext
const client = new ApiGatewayManagementApiClient({
  // The @connections endpoint lives on websocketPort at /<stage>/@connections;
  // offline sets domainName to localhost:<websocketPort> (e.g. localhost:3001),
  // so this resolves locally.
  endpoint: `http://${domainName}/${stage}`,
})
await client.send(
  new PostToConnectionCommand({
    ConnectionId: event.requestContext.connectionId,
    Data: JSON.stringify({ hello: 'world' }),
  }),
)
```

If you track connection ids in module memory rather than a datastore, run with
`--useInProcess` (or set `custom.serverless-offline.useInProcess: true`). The default per-invocation
worker threads each keep their own memory, so concurrent connections can land on
different workers and a broadcast would miss them; a single shared process avoids
that. A deployed app would store connection ids in a datastore (e.g. DynamoDB).

See the [`ws-chat` reference app](https://github.com/serverless/serverless/tree/main/docs/examples/offline/ws-chat) for a full chat service using `@connections`.

### Schedule

```yaml
functions:
  cron:
    handler: handler.cron
    events:
      - schedule: rate(1 minute)
```

Scheduled functions are invoked locally on their `rate(...)`/`cron(...)` cadence while Offline is running, so you can watch them fire without waiting for a real deployment.

### Direct Lambda invoke

Any function can be invoked directly through the AWS SDK against `lambdaPort`, with `RequestResponse` or `Event` (async) invocation types:

```js
import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda'

const lambda = new LambdaClient(
  process.env.IS_OFFLINE ? { endpoint: 'http://localhost:3002' } : {},
)
await lambda.send(
  new InvokeCommand({
    FunctionName: 'my-service-dev-worker',
    Payload: JSON.stringify({ any: 'payload' }),
  }),
)
```

This is also how one function invokes another locally — gate the `endpoint` on `IS_OFFLINE` so the same code works when deployed.

## Authorizers

Offline runs your authorizers the same way the gateway would, so you can verify both the allow and deny paths.

- **API key** — requests to a key-protected route must present a valid `x-api-key`; missing or unknown keys are rejected. If a `private` route has no key configured under `provider.apiGateway.apiKeys`, a key is generated and printed at boot (look for `API key (generated, none configured): <key>`) — send that value as `x-api-key`. This matches the community `serverless-offline` plugin and is a local-dev convenience; deployed AWS requires a usable key in the route's usage plan and otherwise denies all callers.
- **IAM** — IAM-authorized routes are accepted locally (SigV4 signatures are not re-validated).
- **Lambda authorizers (TOKEN and REQUEST)** — your authorizer function runs locally. A returned `Allow` policy lets the request through and its `context` is surfaced under `requestContext.authorizer`; a `Deny` (or a thrown error) rejects the request. REQUEST authorizers receive the full request; TOKEN authorizers receive the identity-source token.
- **JWT** (HTTP API) — the token is verified against the issuer's JWKS by default, including `exp`/`iss`/`aud` and any required scopes. Pass `--ignoreJWTSignature` to decode the token without verifying its signature, which is useful with self-minted local tokens. Claims still flow into `requestContext.authorizer.jwt`.
- **Custom authentication provider** — set `customAuthenticationProvider` under `custom.offline` (it is a config key, not a CLI flag) to point at a module that supplies your own Hapi auth provider. This key intentionally lives under `custom.offline` rather than `custom.serverless-offline` — it mirrors the location the community `serverless-offline` plugin reads, so an existing serverless-offline config works unmodified. When configured, it authenticates **every** route, overriding any per-route authorizer. The provider's authenticate function returns `credentials` as `{ principalId, context }`: for REST and HTTP API 1.0 the `context` is surfaced at the root of `requestContext.authorizer` alongside `principalId`; for HTTP API 2.0 it is surfaced as `requestContext.authorizer.lambda`.

To bypass authorizers entirely, run with `--noAuth`, or set the `AUTHORIZER` environment variable to inject a fixed authorizer context for every request. With `--noAuth`, an empty `authorizer` object is emitted so handlers that read it still see a value.

When a route has **no** authorizer, `requestContext.authorizer` is omitted from the event entirely (matching AWS), and identity fields for unauthenticated requests are `null` apart from `sourceIp` and `userAgent`.

## Runtimes and runners

### Node.js

Node handlers run by default in a worker thread per concurrent invocation, which isolates module state and `process.env` between calls. Pass `--useInProcess` to run them in the Offline process instead: invocations are faster, but handler module state and `process.env` mutations persist between calls.

### Python, Ruby, Go

These runtimes run as a subprocess using the runtime declared on the function or provider. You need that runtime installed and on your `PATH` (for example `python3`, `ruby`, `go`). Pick the runtime the same way you would for deployment — via `provider.runtime` or a per-function `runtime:`.

### Java

Java functions always run inside a Docker container (the official `public.ecr.aws/lambda/java` image), so Docker must be running — you do not need a local JVM, and this does not require the `--useDocker` flag.

The [`polyglot` reference app](https://github.com/serverless/serverless/tree/main/docs/examples/offline/polyglot) runs Node and Python functions side by side in one service.

### Docker

Pass `--useDocker` to run supported handlers inside Docker containers instead of on the host, which more closely matches the Lambda execution environment. Configure the container's view of the host with `--dockerHost` (default `host.docker.internal`), `--dockerNetwork`, and related flags.

When any function runs in a container (via `--useDocker`, or the Java runtime, which is always container-based), the `lambdaPort` server binds to `0.0.0.0` instead of `localhost`. Containers reach the host through `host.docker.internal`, which resolves to a non-loopback address from inside the container, so a `localhost`-only bind would refuse their connections to the Lambda Runtime API. The boot summary's endpoint line shows the bind host in effect; from your machine the endpoint is still reachable at `http://localhost:<lambdaPort>`.

### Lambda layers

Layers referenced by your functions are downloaded and cached under `<service>/.serverless-offline/layers` (override with `--layersDir`) and made available to the handler at runtime.

### Timeouts

Handlers are subject to their configured `timeout`. Pass `--noTimeout` to disable timeout enforcement while you debug a slow handler.

## AWS services and the handler environment

Offline emulates the API Gateway edge (HTTP/REST/ALB/WebSocket), runs your Lambdas locally (Node in-process/worker, plus Python/Ruby/Go/Java), fires `schedule` events, and exposes a local **Lambda Invoke** endpoint on `lambdaPort`. **All other AWS SDK calls from your handlers go to real AWS with your normal credentials** — exactly like `serverless-offline`. There is no local emulation of SQS, SNS, S3, or EventBridge.

This means:

- Offline injects `IS_OFFLINE=true`, the `AWS_LAMBDA_*` runtime variables, and the region. It does **not** inject `AWS_ENDPOINT_URL` and does **not** force placeholder credentials.
- A handler that calls, say, `new S3Client({})` will hit **real S3** using your developer credentials. Use a dedicated dev account or bucket/queue/table if you want to avoid touching production data.
- To invoke another function locally, set the Lambda client `endpoint` yourself, gated on `IS_OFFLINE` — see [Calling another Lambda locally](#calling-another-lambda-locally).

### Environment variable rendering

Values in `provider.environment` and a function's `environment` are rendered with the same rules as `serverless-offline`:

- `Fn::Join` and `Fn::Sub` are rendered.
- `Ref` and `Fn::GetAtt` pass through **unresolved** — there is no local resource provisioner to resolve them against, so a handler reading such a value sees the raw intrinsic rather than a deployed ARN or URL.

## Differences from the `serverless-offline` plugin

If you are coming from the community [`serverless-offline`](https://github.com/dherault/serverless-offline) plugin, the built-in command covers the same core workflow but differs in configuration and in some observable behavior.

### User-facing differences

**Configuration block.** The built-in reads from `custom.serverless-offline.*` — the same config home and property names the community plugin uses — so most existing config carries over unchanged. The keys behave as follows:

| `custom.serverless-offline.*` key | Built-in behavior |
| --- | --- |
| `httpPort` | HTTP API / REST server port (default `3000`) |
| `websocketPort` | WebSocket server port (default `3001`) |
| `lambdaPort` | The Lambda invoke endpoint (default `3002`) |
| `albPort` | ALB server port (default `3003`) |
| `reloadHandler` | Maps to the built-in file watch; hot reload defaults OFF |
| `preLoadModules` | Accepted but ignored |
| `resourceRoutes` | Accepted but ignored |
| `noSponsor` | Accepted and silently ignored |
| `host` / `httpsProtocol` | Same |
| `corsAllowHeaders` / `corsAllowOrigin` / `corsDisallowCredentials` / `corsExposedHeaders` | Same keys (defaults differ — see below) |
| `disableCookieValidation` / `enforceSecureCookies` | Same |
| `dockerHost` / `dockerHostServicePath` / `dockerNetwork` / `dockerReadOnly` | Same (`dockerHost` defaults to `host.docker.internal`) |
| `layersDir` / `localEnvironment` / `noAuth` / `noPrependStageInUrl` / `noTimeout` / `prefix` | Same |
| `ignoreJWTSignature` / `customAuthenticationProvider` | Same |
| `terminateIdleLambdaTime` / `useDocker` / `useInProcess` | Same |
| `webSocketHardTimeout` / `webSocketIdleTimeout` | Same |

A one-time boot warning lists any accepted-but-ignored keys it finds. A top-level `offline:` block is **not** supported; if present, the Framework warns about unrecognized configuration.

**CLI flags.** The flags mirror the config keys:

| Flag | Built-in behavior |
| --- | --- |
| `--httpPort` | HTTP API / REST server port (default `3000`) |
| `--websocketPort` | WebSocket server port (default `3001`) |
| `--lambdaPort` | The Lambda invoke endpoint (default `3002`) |
| `--albPort` | ALB server port (default `3003`) |
| `--watch` / `--noWatch` / `--reloadHandler` | Control hot reload; it defaults OFF |
| `--preLoadModules` / `--resourceRoutes` / `--noSponsor` | Accepted for serverless-offline compatibility; ignored |
| `--host` / `-o` | `--host` (no `-o` shortcut) |
| `--httpsProtocol` / `-H` | `--httpsProtocol` (no shortcut) |
| `--noTimeout` / `-t` | `--noTimeout` (no shortcut) |
| `--prefix` / `-p` | `--prefix` (no shortcut) |
| all `--cors*`, `--docker*`, `--ignoreJWTSignature`, `--layersDir`, `--localEnvironment`, `--noAuth`, `--noPrependStageInUrl`, `--terminateIdleLambdaTime`, `--useDocker`, `--useInProcess`, `--webSocket*` | Same names |

Note that `customAuthenticationProvider` is a config-only key under `custom.offline` (mirroring the community `serverless-offline` plugin's location); it has no CLI flag.

Other user-facing changes:

- **Same port model as the plugin.** The built-in binds `httpPort` (3000, HTTP API + REST), `websocketPort` (3001, WebSocket + `@connections`), `lambdaPort` (3002, Lambda Invoke), and `albPort` (3003, ALB) — the same listening ports the community plugin uses. ALB and WebSocket each bind their own port (3003/3001) only when your service declares those events, exactly like serverless-offline, so the earlier shared-port caveat (an ALB rule colliding with an API route) no longer applies.
- **No `start` subcommand.** Run `serverless offline`. There is no `serverless offline start`.
- **Hot reload defaults off.** Enable it with `--watch`, `--reloadHandler`, or `custom.serverless-offline.reloadHandler: true` (auto-disabled when a bundler plugin owns the build).
- **Zero install.** The command ships with the Framework; there is no plugin to add to `plugins:`.

### Functional and behavioral differences

These are intentional behaviors you can observe at runtime:

- **Curated handler environment.** Handlers receive a fixed AWS runtime block (`AWS_LAMBDA_*`, `AWS_REGION`/`AWS_DEFAULT_REGION`, `LAMBDA_TASK_ROOT`, `IS_OFFLINE`) plus your declared `provider.environment` and function `environment`. Your shell's full environment is **not** copied in unless you pass `--localEnvironment`. `AWS_ENDPOINT_URL` is **not** set and credentials are **not** overridden, so handler SDK calls use your real AWS credentials.
- **JWT verification on by default.** HTTP API JWT authorizers verify the token signature against JWKS (plus `exp`/`iss`/`aud`/scopes). Use `--ignoreJWTSignature` to skip signature verification.
- **CORS scoped to your declared config.** The built-in leaves CORS overrides unset by default, so each route's own CORS configuration applies — there is no blanket origin reflection. The community plugin ships global CORS defaults (for example `corsAllowOrigin: '*'`).
- **CLF access-log time uses `+0000`.** Request times are emitted in UTC (`dd/Mon/YYYY:HH:MM:SS +0000`).
- **ALB lowercases request headers.** The inbound ALB event's header names are lowercased, matching real ALB.
- **`requestContext.authorizer` is omitted when a route has no authorizer**, matching AWS. Under `--noAuth` an empty object is emitted so handlers that read it still see a value.
- **Null identity for unauthenticated requests.** Identity fields other than `sourceIp` and `userAgent` are `null`.
- **HTTP API v2 cookie handling.** The `Cookie` header is stripped from `headers` and surfaced as a separate `cookies` array. Offline follows AWS here: the `cookies` field is **omitted** when the request carries no cookies (the community plugin always emits an empty `cookies: []`). ALB events have no `cookies` field.

The remaining differences are places where Offline matches the AWS event/response contract more closely than the community plugin. If you have assertions written against the plugin's output, expect these to differ:

**REST API (v1).** Offline follows AWS here; the community plugin differs.

- `requestContext.path` **includes the stage** (for example `/dev/items/42`), and `requestContext.resourcePath` is **stage-less** (`/items/{id}`) — matching the AWS `$context.path` / `$context.resourcePath` values. The community plugin reverses these.
- With `cors: true`, the preflight returns `Access-Control-Allow-Origin: *` (no `Access-Control-Allow-Credentials`), lists the route method **plus** `OPTIONS` in `Access-Control-Allow-Methods`, and returns the AWS default `Access-Control-Allow-Headers` set — matching the AWS `cors: true` defaults. The community plugin echoes the request origin, sets credentials, and reflects the request's own header list.
- Lambda (non-proxy) integrations apply your `request`/`response` mapping templates and select the response status via the `statusCodes` `selectionPattern` (for example mapping a matching error to `404`). The community plugin returned the raw handler result and a generic `502` for this case.

**Application Load Balancer (ALB).** Offline follows AWS here; the community plugin differs.

- ALB targets are served at the **stage-less path** (`/single`, not `/dev/single`) and the event's `path` is stage-less, because a real ALB has no stages.
- The event carries **exactly one** of the single-value or multi-value header/query maps, governed by the target group's `multiValueHeaders` setting — never both. The community plugin always emits both.
- A real load balancer's forwarding and trace headers (`x-forwarded-for`, `x-forwarded-proto`, `x-forwarded-port`, `x-amzn-trace-id`) are synthesized onto the event.
- A bodyless request still includes `body: ""` (an ALB always sends a `body` field). Offline also marshals an ALB response that includes a `headers` object correctly; the community plugin's ALB server can crash on such a response.

**WebSocket.** Offline follows AWS here; the community plugin differs.

- `requestContext.domainName` is the real, routable `localhost:<websocketPort>` (for example `localhost:3001`) and `requestContext.stage` is your configured stage (for example `dev`). The `@connections` management route is mounted at `/<stage>/@connections/{connectionId}` on the WebSocket server — exactly the endpoint the AWS SDK's `ApiGatewayManagementApiClient` composes from `domainName` + stage. As a result, **SDK-style `@connections` fan-out works offline**: a handler that POSTs to `https://${domainName}/${stage}/@connections/${connectionId}` reaches the other connected clients. Against the community plugin (which hardcodes `domainName`/`stage` and omits the stage prefix on its `@connections` route) the same broadcast does not reach them.
- `requestContext.messageId` is present only on **message** (route) events — never on `$connect`/`$disconnect`, matching AWS.
- `$disconnect` events carry `disconnectStatusCode` and `disconnectReason` taken from the WebSocket close frame.

**Authorizers.** Offline follows AWS here; the community plugin differs.

- A rejected request returns the AWS-shaped envelope — a flat `{ "message": "Unauthorized" }` (401) or `{ "message": "Forbidden" }` (403) body plus an `x-amzn-ErrorType: UnauthorizedException` / `ForbiddenException` header. The community plugin returns a nested Boom-style `{ statusCode, error, message }` envelope.
- For an `aws_iam` route, no Lambda-authorizer context is attached: the `requestContext.authorizer` block is omitted entirely (SigV4 is not enforced locally, so the route runs unauthenticated, and Offline logs a one-time warning). The community plugin injects a placeholder `authorizer`.
- For HTTP API v2, exactly one of `requestContext.authorizer.jwt` or `requestContext.authorizer.lambda` is populated, per the route's authorizer type — Offline does not emit the empty sibling block the community plugin adds.
- A REQUEST authorizer with simple responses (`enableSimpleResponses`) that returns the `Unauthorized` literal yields **401** (the AWS sentinel for an unauthorized denial); the community plugin returns `403` here.

**Lambda invoke.** Offline follows AWS here; the community plugin differs.

- A successful synchronous (`RequestResponse`) invoke returns the `X-Amz-Executed-Version: $LATEST` header.
- A `DryRun` invoke returns `204` with no body (AWS validates parameters and returns no payload). The community plugin rejects `DryRun` with a `400 InvalidParameterValueException`.

### Scope limits

These capabilities of the community plugin are intentionally not part of the built-in command:

- **No local emulation of other AWS services.** Offline emulates the API edge (HTTP API, REST, ALB, WebSocket), runs your Lambdas, fires `schedule` events, and serves the Lambda Invoke endpoint. SQS, SNS, S3, EventBridge, DynamoDB, and every other service your handler's SDK calls go to **real AWS** with your normal credentials — there is no built-in local emulation of them.
- **Hot reload defaults off.** Enable it with `--watch`, `--reloadHandler`, or `custom.serverless-offline.reloadHandler: true`.
- **`noSponsor` is accepted and ignored** (there is no sponsor banner to suppress).
- **Layers** are mounted only for Docker-backed functions and are sourced by downloading a published layer ARN from AWS; locally-defined service layers are skipped with a boot notice.
- **Host runtimes use the interpreter on your PATH.** For Python, Ruby, and Go, the configured runtime version selects the runner, but the actual interpreter/toolchain is whatever is installed on your machine; only Docker mode pins the exact Lambda image.
- **The custom authentication provider** is read from `custom.offline.customAuthenticationProvider` — the same location the community `serverless-offline` plugin reads, so an existing serverless-offline config works unmodified. When configured it authenticates every route as the default auth strategy.
