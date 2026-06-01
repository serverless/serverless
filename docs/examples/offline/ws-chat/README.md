# WebSocket chat example for `serverless offline`

A minimal WebSocket chat runnable entirely locally with `serverless offline`.
Every route (`$connect`, `$disconnect`, `broadcast`) is handled by a single
Lambda function that keeps the connection registry in module memory.

Because the registry must be shared across every invocation, this example sets
`offline.useInProcess: true` in `serverless.yml` so the handler runs in the
offline process (one shared module instance). With the default per-invocation
worker threads, concurrent connections can land on different workers, each with
its own empty registry, and a broadcast would reach no one. A deployed app would
persist connection ids in a real datastore (e.g. DynamoDB) and would not rely on
process memory at all.

## Requirements

The handler uses the AWS SDK for JavaScript v3 to push messages back to clients,
so install that client in this project first:

```bash
npm install @aws-sdk/client-apigatewaymanagementapi
```

(On AWS, the Lambda Node.js runtime bundles the SDK; locally you install it.)

## Run

```bash
serverless offline
```

This boots the local app server (default app port `3000`). With the default
`dev` stage the WebSocket endpoint is reachable at `ws://localhost:3000/dev`.

## Try it

Open two clients with [`wscat`](https://github.com/websockets/wscat) in separate
terminals:

```bash
# Terminal 1 — client A
wscat -c ws://localhost:3000/dev

# Terminal 2 — client B
wscat -c ws://localhost:3000/dev
```

From client A, send a broadcast:

```json
{"action":"broadcast","msg":"hi"}
```

The `action` field is the route selection key — offline uses the default
`$request.body.action` to map the message to the `broadcast` route. The `msg`
field is your chat payload.

## What you should see

Both clients receive the broadcast. Each connected client (including the sender)
gets the fanned-out message:

```json
{"msg":"hi"}
```

The handler fans out to every entry in the shared connection registry via the
`@connections` management API, which offline mounts on the same app port.
