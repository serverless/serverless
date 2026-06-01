<!--
title: Serverless Framework Commands - AWS Lambda - Offline
description: The offline command runs your Lambda handlers locally with API Gateway, ALB, WebSocket, S3, SQS, SNS, EventBridge, and Schedule event sources emulated in-process.
short_title: Commands - Offline
keywords:
  [
    'Serverless',
    'Framework',
    'AWS',
    'Lambda',
    'Offline',
    'Local Development',
    'Serverless CLI',
    'API Gateway',
    'Emulation',
  ]
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/aws/cli-reference/offline)

<!-- DOCS-SITE-LINK:END -->

# Offline

Run your Lambda handlers locally with API Gateway, ALB, WebSocket, S3, SQS, SNS, EventBridge, and Schedule event sources emulated in-process.

```bash
serverless offline
```

## Two ports

Offline listens on two ports. Together they replace the four listening ports used by the community `serverless-offline` plugin.

- **`appPort`** (default `3000`) — the HTTP server for your HTTP API, REST API, ALB, and WebSocket routes. It also hosts the API Gateway Management API `@connections` endpoint used to post messages back to connected WebSocket clients.
- **`awsApiPort`** (default `3002`) — the AWS SDK endpoint. Handlers and tools talk to it as if it were AWS, covering Lambda `Invoke`, S3, SQS, SNS, and EventBridge.

Each invoked handler receives an environment that points its AWS SDK clients at the local emulator:

- `AWS_ENDPOINT_URL=http://localhost:3002` (the configured `awsApiPort`).
- Placeholder credentials — `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY` default to `test` unless your shell already provides real values.
- `IS_OFFLINE=true`.

These values are injected into the handler's environment only. They are never written onto the long-running CLI process, so the Framework's own AWS SDK clients keep talking to real AWS.

## Options

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `--appPort` | string | `3000` | Port for the HTTP API / REST / ALB / WebSocket server (default 3000) |
| `--awsApiPort` | string | `3002` | Port for the AWS SDK endpoint (default 3002) |
| `--corsAllowHeaders` | string | — | Used to build the Access-Control-Allow-Headers header for CORS support |
| `--corsAllowOrigin` | string | — | Used to build the Access-Control-Allow-Origin header for CORS support |
| `--corsDisallowCredentials` | boolean | — | Used to override the Access-Control-Allow-Credentials default to false |
| `--corsExposedHeaders` | string | — | Used to build the Access-Control-Expose-Headers response header for CORS support |
| `--disableCookieValidation` | boolean | `false` | Disable cookie validation on the local Hapi server |
| `--dockerHost` | string | `host.docker.internal` | Host name that Docker containers use to reach the offline host (default host.docker.internal) |
| `--dockerHostServicePath` | string | — | Service path as seen by Serverless when it runs inside a Docker container |
| `--dockerNetwork` | string | — | Docker network that Lambda containers connect to |
| `--dockerReadOnly` | boolean | `true` | Mount Docker code layers read-only (default true) |
| `--enforceSecureCookies` | boolean | `false` | Enforce secure cookies in local REST responses |
| `--host` | string | `localhost` | Host the local servers bind to (default localhost) |
| `--httpsProtocol` | string | — | Enable HTTPS by specifying a directory containing cert.pem and key.pem |
| `--ignoreJWTSignature` | boolean | `false` | When using HTTP API JWT authorizers, skip JWT signature verification |
| `--layersDir` | string | `<service>/.serverless-offline/layers` | Directory where downloaded Lambda layers are cached (default `<service>/.serverless-offline/layers`) |
| `--localEnvironment` | boolean | `false` | Copy local process environment variables into Lambda handlers |
| `--noAuth` | boolean | `false` | Turn off all authorizers |
| `--noPrependStageInUrl` | boolean | `false` | Do NOT prepend the deployment stage to REST API URLs |
| `--noTimeout` | boolean | `false` | Disable handler timeout enforcement |
| `--noWatch` | boolean | `false` | Disable hot-reload of handler files |
| `--prefix` | string | — | Extra path segment to prepend after the stage in REST API URLs (e.g. `--prefix api` -> `/<stage>/api/<route>`) |
| `--terminateIdleLambdaTime` | string | `60` | Number of seconds an idle Lambda runner stays warm before it is terminated. Default: 60. |
| `--useDocker` | boolean | `false` | Run supported Lambda handlers in Docker containers |
| `--useInProcess` | boolean | `false` | Run Lambda handlers in the offline server process (Node.js only) instead of spawning a worker thread per concurrent invocation. Faster invocation, but handler module state and process.env mutations persist between calls. Default: false. |
| `--watch` | boolean | `true` | Enable hot-reload of handler files (default true) |
| `--webSocketHardTimeout` | string | `7200` | Set WebSocket hard timeout in seconds to reproduce AWS limits (default 7200) |
| `--webSocketIdleTimeout` | string | `600` | Set WebSocket idle timeout in seconds to reproduce AWS limits (default 600) |

## Configuration (`offline:` block)

The same runtime knobs can be set under a top-level `offline:` block in `serverless.yml`, using the same names as the CLI flags. When both are present, the CLI flag wins.

This block configures the offline runtime only. Resources and event sources are not declared here — they come from your service's `resources:` and `events:` definitions, exactly as they would when deployed.

```yaml
offline:
  appPort: 3000
  awsApiPort: 3002
  useInProcess: true
```

`customAuthenticationProvider` is a config-only key (it has no CLI flag). Set it under the `offline:` block to point at a module that provides a custom authentication provider for local authorizers.

## Debugging

- Start the CLI under the Node.js inspector to debug handlers:

  ```bash
  node --inspect $(which serverless) offline
  ```

  Each handler runs in a worker thread inside the same process, so breakpoints set in your handler code are hit during invocation.

- For verbose logs from the offline subsystems, set the `DEBUG` environment variable:

  ```bash
  DEBUG=sls:offline:* serverless offline
  ```
