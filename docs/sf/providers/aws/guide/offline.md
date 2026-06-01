<!--
title: Serverless Framework - Offline
short_title: Offline
description: Run your AWS Lambda functions and their event sources locally with the built-in Serverless Framework offline command
keywords:
  [
    'Serverless Framework',
    'AWS Lambda',
    'offline',
    'local development',
    'API Gateway',
    'WebSocket',
    'SQS',
    'SNS',
    'S3',
    'EventBridge',
  ]
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/aws/guide/offline)

<!-- DOCS-SITE-LINK:END -->

# Offline

The `offline` command runs your Lambda functions and their event sources on your machine. API Gateway (HTTP API and REST), ALB, WebSocket, and Schedule triggers are served locally, and SQS, SNS, S3, and EventBridge are emulated in-process — so you can exercise an event-driven service end to end without deploying anything.

It is built into the Framework. There is nothing to install, and it reads the same `serverless.yml` you deploy with: your `functions:`, their `events:`, and your `resources:`.

For the full list of flags and the `offline:` configuration block, see the [offline CLI reference](../cli-reference/offline.md).

## Quick start

From a service directory, run:

```bash
serverless offline
```

Offline binds two ports:

- **`appPort`** (default `3000`) — your application edge. HTTP API, REST API, ALB, and WebSocket routes are served here.
- **`awsApiPort`** (default `3002`) — the AWS SDK endpoint. Point any AWS SDK client at it and S3, SQS, SNS, EventBridge, and Lambda `Invoke` calls are handled locally.

Your handlers are launched with their AWS SDK clients already pointed at the local emulator. Each handler's environment includes:

- `AWS_ENDPOINT_URL=http://localhost:3002`
- `IS_OFFLINE=true`
- placeholder credentials (so the SDK has something to sign with)

So inside a handler you usually do not need to configure anything — `new S3Client({})` already talks to the local emulator.

If you call the emulator from your own scripts or tests, point the client at `awsApiPort` explicitly. For the AWS SDK for JavaScript v3:

```js
import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs'

const sqs = new SQSClient({
  endpoint: 'http://localhost:3002',
  region: 'us-east-1',
  credentials: { accessKeyId: 'test', secretAccessKey: 'test' },
})

const queueUrl = 'http://localhost:3002/000000000000/my-queue'
await sqs.send(
  new SendMessageCommand({ QueueUrl: queueUrl, MessageBody: 'hello' }),
)
```

You can also set `AWS_ENDPOINT_URL=http://localhost:3002` in your shell instead of passing `endpoint` to each client.

For S3, both addressing styles work. The emulator reads the bucket name from a virtual-hosted-style `Host` header, so `forcePathStyle` is **not** required — though it remains supported if you prefer path-style addressing.

## What happens when you run it

When the server is ready, Offline prints a banner listing what it stood up:

- the routes it is serving (HTTP API, REST, ALB, WebSocket, and Schedule triggers), with their methods and paths
- the local resources it provisioned from your `resources:` and `events:` (queues, topics, buckets, buses)

From that point on, your `events:` are **live triggers**. Putting an object in a bucket, sending a message to a queue, publishing to a topic, or putting an event on a bus invokes the function wired to it — the same wiring you declared for deployment.

Edit a handler file and the next invocation reflects your change — no restart needed. This hot reload is on by default. It is automatically disabled when a bundler plugin (for example the built-in esbuild support or `serverless-esbuild`) is managing your build, since the bundler owns recompilation in that case. For non-Node runtimes, files are read fresh on each invocation.

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

ALB routes are served on `appPort`. The handler receives an ALB event whose request header names are **lowercased**, matching how real ALB delivers headers. Respond with `{ statusCode, statusDescription, headers, body }`.

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

Connect a WebSocket client to `ws://localhost:3000`. The `$connect`, `$disconnect`, and route-selected handlers fire as clients connect, disconnect, and send frames.

To push messages back to a client, use the API Gateway Management API `@connections` endpoint — it is served on `appPort` and your handler's SDK client is already pointed at it:

```js
import {
  ApiGatewayManagementApiClient,
  PostToConnectionCommand,
} from '@aws-sdk/client-apigatewaymanagementapi'

const { domainName, stage } = event.requestContext
const client = new ApiGatewayManagementApiClient({
  // The @connections endpoint lives on appPort at /<stage>/@connections;
  // offline sets domainName to localhost:3000, so this resolves locally.
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
`--useInProcess` (or set `offline.useInProcess: true`). The default per-invocation
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

Any function can be invoked directly through the AWS SDK against `awsApiPort`, with `RequestResponse` or `Event` (async) invocation types:

```js
import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda'

const lambda = new LambdaClient({ endpoint: 'http://localhost:3002' })
await lambda.send(
  new InvokeCommand({
    FunctionName: 'my-service-dev-worker',
    Payload: JSON.stringify({ any: 'payload' }),
  }),
)
```

This is also how one function invokes another locally.

## Authorizers

Offline runs your authorizers the same way the gateway would, so you can verify both the allow and deny paths.

- **API key** — requests to a key-protected route must present a valid `x-api-key`; missing or unknown keys are rejected.
- **IAM** — IAM-authorized routes are accepted locally (SigV4 signatures are not re-validated).
- **Lambda authorizers (TOKEN and REQUEST)** — your authorizer function runs locally. A returned `Allow` policy lets the request through and its `context` is surfaced under `requestContext.authorizer`; a `Deny` (or a thrown error) rejects the request. REQUEST authorizers receive the full request; TOKEN authorizers receive the identity-source token.
- **JWT** (HTTP API) — the token is verified against the issuer's JWKS by default, including `exp`/`iss`/`aud` and any required scopes. Pass `--ignoreJWTSignature` to decode the token without verifying its signature, which is useful with self-minted local tokens. Claims still flow into `requestContext.authorizer.jwt`.
- **Custom authentication provider** — set `customAuthenticationProvider` in the `offline:` block (it is a config key, not a CLI flag) to point at a module that supplies your own provider for local authorizers.

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

### Lambda layers

Layers referenced by your functions are downloaded and cached under `<service>/.serverless-offline/layers` (override with `--layersDir`) and made available to the handler at runtime.

### Timeouts

Handlers are subject to their configured `timeout`. Pass `--noTimeout` to disable timeout enforcement while you debug a slow handler.

## Local AWS resources

Queues, topics, buckets, and buses declared in your `resources:` — or implied by your `events:` — exist locally the moment Offline boots. You do not create them by hand; they are listed in the ready banner.

Because they exist at boot, intrinsic functions in your `environment:` resolve to working local values. `!Ref` on a queue yields its local queue URL, `!GetAtt` on a topic yields its local ARN, and `!Sub` strings are interpolated — so the URL or ARN your handler reads from `process.env` actually points at the live local resource.

Local ARNs are realistic in shape: account `000000000000`, region `us-east-1`, for example `arn:aws:sqs:us-east-1:000000000000:my-queue`. References that cannot be resolved locally — such as a cross-stack `Fn::ImportValue` to a stack that is not part of this service — are reported at boot so you know which values will be missing.

## SQS, SNS, S3, and EventBridge

These four services are emulated in-process and reachable through the AWS SDK at `awsApiPort`. You send/publish/put using the normal SDK calls, and the consumers you declared in `events:` fire automatically.

The [`s3-sqs-sns-chain` reference app](https://github.com/serverless/serverless/tree/main/docs/examples/offline/s3-sqs-sns-chain) wires all of these together: drop an object → S3 event → Lambda → SQS → consumer → SNS.

### SQS

Send a message with `SendMessage`/`SendMessageBatch` and the function with an `sqs:` event on that queue is invoked with a normal SQS records event. Visible knobs:

- **FIFO queues** — `.fifo` queues enforce `MessageGroupId` and deduplication.
- **Dead-letter queues** — declare a `RedrivePolicy` with a `maxReceiveCount`. After a message fails that many times, it is moved to the configured DLQ, exactly as on AWS.
- **Visibility** — an in-flight message is hidden for its visibility timeout and reappears if not deleted; `ChangeMessageVisibility` adjusts it.

### SNS

Publish with `Publish`/`PublishBatch` and every matching subscription is delivered. Subscriptions can be other Lambda functions or SQS queues (fan-out). Visible knobs:

- **Filter policies** — a subscription's filter policy is evaluated against the message attributes (and, where configured, the body), so only matching messages are delivered.

### S3

Put an object with the SDK, or drop a file into the bucket's local folder, and the matching `s3:` event (for example `s3:ObjectCreated:*`) invokes your function with a standard S3 records event. Each bucket is mirrored on disk under `.serverless-offline/buckets/<bucketName>`, so dropping a file there is equivalent to a `PutObject`. Visible knobs:

- **Prefix / suffix rules** — the `rules:` (prefix/suffix) on your `s3:` event are honored, so only objects matching the filter trigger the function.

### EventBridge

Put an event with `PutEvents` and any rule whose pattern matches is triggered. Visible knobs:

- **Event patterns** — a rule's `pattern` is matched against the event; non-matching events are ignored.
- **Input transformers** — a target's `InputTransformer` (input paths plus a template, including reserved variables such as `<aws.events.event.json>`) shapes the payload your target receives.

### Lambda destinations

For asynchronous invocations (invocation type `Event`, including SQS/SNS/S3/EventBridge-driven invocations), a function's `destinations` are honored. On success the result is routed to the `onSuccess` target; on failure to the `onFailure` target. Targets can be an SQS queue, SNS topic, another Lambda function, or an EventBridge bus.

## Supported AWS API operations

The emulators implement the operations below. Operations not listed return a `NotImplemented`-style error.

### SQS

| Operation | Supported |
| --- | --- |
| `SendMessage` | Yes |
| `SendMessageBatch` | Yes |
| `ReceiveMessage` | Yes |
| `DeleteMessage` | Yes |
| `DeleteMessageBatch` | Yes |
| `ChangeMessageVisibility` | Yes |
| `ChangeMessageVisibilityBatch` | Yes |
| `GetQueueAttributes` | Yes |
| `SetQueueAttributes` | Yes |
| `GetQueueUrl` | Yes |
| `CreateQueue` | Yes |
| `DeleteQueue` | Yes |
| `ListQueues` | Yes |
| `PurgeQueue` | Yes |

### SNS

| Operation | Supported |
| --- | --- |
| `Publish` | Yes |
| `PublishBatch` | Yes |
| `CreateTopic` | Yes |
| `DeleteTopic` | Yes |
| `ListTopics` | Yes |
| `Subscribe` | Yes |
| `Unsubscribe` | Yes |
| `ListSubscriptions` | Yes |
| `ListSubscriptionsByTopic` | Yes |
| `ConfirmSubscription` | Yes |
| `GetTopicAttributes` | Yes |
| `SetTopicAttributes` | Yes |
| `GetSubscriptionAttributes` | Yes |
| `SetSubscriptionAttributes` | Yes |

### S3

| Operation | Supported |
| --- | --- |
| `PutObject` | Yes |
| `GetObject` | Yes |
| `HeadObject` | Yes |
| `CopyObject` | Yes |
| `DeleteObject` | Yes |
| `DeleteObjects` | Yes |
| `ListObjectsV2` | Yes |
| `ListObjects` | Yes |
| `CreateBucket` | Yes |
| `DeleteBucket` | Yes |
| `ListBuckets` | Yes |
| `GetBucketLocation` | Yes |
| `CreateMultipartUpload` | Yes |
| `UploadPart` | Yes |
| `UploadPartCopy` | Yes |
| `CompleteMultipartUpload` | Yes |
| `AbortMultipartUpload` | Yes |
| `ListMultipartUploads` | Yes |
| `ListParts` | Yes |

Both path-style and virtual-hosted-style addressing are accepted, so `forcePathStyle` is optional.

### EventBridge

| Operation | Supported |
| --- | --- |
| `PutEvents` | Yes |
| `PutRule` | Yes |
| `DeleteRule` | Yes |
| `EnableRule` | Yes |
| `DisableRule` | Yes |
| `DescribeRule` | Yes |
| `ListRules` | Yes |
| `PutTargets` | Yes |
| `RemoveTargets` | Yes |
| `ListTargetsByRule` | Yes |
| `CreateEventBus` | Yes |
| `DeleteEventBus` | Yes |
| `ListEventBuses` | Yes |
| `TestEventPattern` | Yes |

### Lambda

| Operation | Supported |
| --- | --- |
| `Invoke` (`RequestResponse` and `Event`) | Yes |

## Differences from the `serverless-offline` plugin

If you are coming from the community [`serverless-offline`](https://github.com/dherault/serverless-offline) plugin, the built-in command covers the same core workflow but differs in configuration and in some observable behavior.

### User-facing differences

**Configuration block.** The built-in reads from a top-level `offline:` block, not from `custom.serverless-offline.*`. The keys map as follows:

| `custom.serverless-offline.*` | `offline.*` | Notes |
| --- | --- | --- |
| `httpPort` | `appPort` | One port now serves HTTP API, REST, ALB, and WebSocket |
| `lambdaPort` | `awsApiPort` | The AWS SDK endpoint |
| `albPort` | _removed_ | ALB shares `appPort` |
| `websocketPort` | _removed_ | WebSocket shares `appPort` |
| `reloadHandler` | _removed_ | Hot reload is on by default; toggle with `watch`/`noWatch` |
| `host` / `httpsProtocol` | `host` / `httpsProtocol` | Same |
| `corsAllowHeaders` / `corsAllowOrigin` / `corsDisallowCredentials` / `corsExposedHeaders` | same names | Same keys (defaults differ — see below) |
| `disableCookieValidation` / `enforceSecureCookies` | same names | Same |
| `dockerHost` / `dockerHostServicePath` / `dockerNetwork` / `dockerReadOnly` | same names | Same (`dockerHost` defaults to `host.docker.internal`) |
| `layersDir` / `localEnvironment` / `noAuth` / `noPrependStageInUrl` / `noTimeout` / `prefix` | same names | Same |
| `ignoreJWTSignature` / `customAuthenticationProvider` | same names | Same |
| `terminateIdleLambdaTime` / `useDocker` / `useInProcess` | same names | Same |
| `webSocketHardTimeout` / `webSocketIdleTimeout` | same names | Same |
| `noSponsor` | n/a | No banner to suppress |
| `preLoadModules` | _removed_ | No equivalent |
| `resourceRoutes` | _removed_ | No equivalent |

**CLI flags.** The flag names follow the same mapping:

| Community flag | Built-in flag | Notes |
| --- | --- | --- |
| `--httpPort` | `--appPort` | Renamed |
| `--lambdaPort` | `--awsApiPort` | Renamed |
| `--albPort` / `--websocketPort` | _removed_ | Both share `--appPort` |
| `--reloadHandler` | `--watch` / `--noWatch` | Hot reload defaults on; disable with `--noWatch` |
| `--host` / `-o` | `--host` | No `-o` shortcut |
| `--httpsProtocol` / `-H` | `--httpsProtocol` | No shortcut |
| `--noTimeout` / `-t` | `--noTimeout` | No shortcut |
| `--prefix` / `-p` | `--prefix` | No shortcut |
| `--noSponsor` / `--preLoadModules` / `--resourceRoutes` | _removed_ | No equivalents |
| all `--cors*`, `--docker*`, `--ignoreJWTSignature`, `--layersDir`, `--localEnvironment`, `--noAuth`, `--noPrependStageInUrl`, `--terminateIdleLambdaTime`, `--useDocker`, `--useInProcess`, `--webSocket*` | same names | Same |

Note that `customAuthenticationProvider` is a config-only key under `offline:`; it has no CLI flag.

Other user-facing changes:

- **Two ports, not four.** The built-in binds `appPort` (3000) and `awsApiPort` (3002). The community plugin binds up to four listening ports (`httpPort`, `websocketPort`, `lambdaPort`, `albPort`).
- **No `start` subcommand.** Run `serverless offline`. There is no `serverless offline start`.
- **Hot reload by default.** Handler changes are picked up automatically (auto-disabled when a bundler plugin owns the build); the community plugin requires `reloadHandler`.
- **Drop-folder paths are auto-derived.** S3 buckets are mirrored under `.serverless-offline/buckets/<bucketName>` with no config knob.
- **Zero install.** The command ships with the Framework; there is no plugin to add to `plugins:`.
- **Bigger event-source floor.** SQS, SNS, S3, and EventBridge are emulated in-process. The community plugin emulates only HTTP, ALB, WebSocket, and Schedule.

### Functional and behavioral differences

These are intentional behaviors you can observe at runtime:

- **Realistic ARNs and identifiers.** Local resources synthesize real-shaped ARNs using account `000000000000` and region `us-east-1` (for example `arn:aws:sqs:us-east-1:000000000000:my-queue`).
- **Curated handler environment.** Handlers receive a fixed AWS runtime block (`AWS_LAMBDA_*`, `AWS_REGION`/`AWS_DEFAULT_REGION`, `LAMBDA_TASK_ROOT`, the local endpoint and credentials, `IS_OFFLINE`) plus your declared `provider.environment` and function `environment`. Your shell's full environment is **not** copied in unless you pass `--localEnvironment`.
- **JWT verification on by default.** HTTP API JWT authorizers verify the token signature against JWKS (plus `exp`/`iss`/`aud`/scopes). Use `--ignoreJWTSignature` to skip signature verification.
- **CORS scoped to your declared config.** The built-in leaves CORS overrides unset by default, so each route's own CORS configuration applies — there is no blanket origin reflection. The community plugin ships global CORS defaults (for example `corsAllowOrigin: '*'`).
- **CLF access-log time uses `+0000`.** Request times are emitted in UTC (`dd/Mon/YYYY:HH:MM:SS +0000`).
- **ALB lowercases request headers.** The inbound ALB event's header names are lowercased, matching real ALB.
- **`requestContext.authorizer` is omitted when a route has no authorizer**, matching AWS. Under `--noAuth` an empty object is emitted so handlers that read it still see a value.
- **Null identity for unauthenticated requests.** Identity fields other than `sourceIp` and `userAgent` are `null`.
- **HTTP API v2 cookie handling.** The `Cookie` header is stripped from `headers` and surfaced as a separate `cookies` array (omitted when there are none); ALB events have no `cookies` field.

Net-new capabilities the community plugin does not provide:

- A resource provisioner that lifts SQS/SNS/S3/EventBridge out of your `resources:`/`events:` and resolves `!Ref`/`!GetAtt`/`!Sub` in `environment:` to working local URLs and ARNs.
- In-process SQS (FIFO, DLQ via `RedrivePolicy`), SNS filter policies, S3 prefix/suffix rules with a drop folder, and EventBridge patterns with input transformers.
- Lambda async destinations (`onSuccess`/`onFailure`) routing to SQS, SNS, Lambda, or EventBridge.
