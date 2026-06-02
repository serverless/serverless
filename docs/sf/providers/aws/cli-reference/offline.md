<!--
title: Serverless Framework Commands - AWS Lambda - Offline
description: The offline command runs your Lambda handlers locally behind the API Gateway edge (HTTP API, REST, ALB, WebSocket), fires Schedule events, and exposes a local Lambda Invoke endpoint.
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

Run your Lambda handlers locally behind the API Gateway edge (HTTP API, REST, ALB, WebSocket), fire `schedule` events, and expose a local AWS Lambda **Invoke** endpoint — exact parity with the community `serverless-offline` plugin.

```bash
serverless offline
```

## Ports

Offline binds a port per surface, matching the listening ports the community `serverless-offline` plugin uses.

- **`httpPort`** (default `3000`) — your HTTP API and REST API edge.
- **`websocketPort`** (default `3001`) — the WebSocket edge and the API Gateway Management API `@connections` endpoint used to post messages back to connected WebSocket clients. Bound only when your service declares `websocket` events.
- **`lambdaPort`** (default `3002`) — the AWS **Lambda Invoke** API endpoint. Point a Lambda SDK client at it to invoke your functions locally.
- **`albPort`** (default `3003`) — the ALB edge. Bound only when your service declares `alb` events.

Each invoked handler receives an environment that includes:

- `IS_OFFLINE=true`.
- the `AWS_LAMBDA_*` Lambda runtime variables and the region.

Offline does **not** inject `AWS_ENDPOINT_URL` and does **not** force placeholder credentials. A handler's AWS SDK calls therefore use your normal AWS credentials and go to **real AWS** for every service — exactly like `serverless-offline`. To reach the local Lambda Invoke endpoint from a handler, set the client's `endpoint` yourself, gated on `IS_OFFLINE` (see the [offline guide](../guide/offline.md#calling-another-lambda-locally)).

## Options

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `--albPort` | string | `3003` | Port for the ALB server (default 3003) |
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
| `--httpPort` | string | `3000` | Port for the HTTP API / REST server (default 3000) |
| `--httpsProtocol` | string | — | Enable HTTPS by specifying a directory containing cert.pem and key.pem |
| `--ignoreJWTSignature` | boolean | `false` | When using HTTP API JWT authorizers, skip JWT signature verification |
| `--lambdaPort` | string | `3002` | Port for the Lambda invoke endpoint (default 3002) |
| `--layersDir` | string | `<service>/.serverless-offline/layers` | Directory where downloaded Lambda layers are cached (default `<service>/.serverless-offline/layers`) |
| `--localEnvironment` | boolean | `false` | Copy local process environment variables into Lambda handlers |
| `--noAuth` | boolean | `false` | Turn off all authorizers |
| `--noPrependStageInUrl` | boolean | `false` | Do NOT prepend the deployment stage to REST API URLs |
| `--noSponsor` | boolean | — | Accepted for serverless-offline compatibility; ignored |
| `--noTimeout` | boolean | `false` | Disable handler timeout enforcement |
| `--noWatch` | boolean | `false` | Disable hot-reload of handler files |
| `--preLoadModules` | string | — | Accepted for serverless-offline compatibility; ignored |
| `--prefix` | string | — | Extra path segment to prepend after the stage in REST API URLs (e.g. `--prefix api` -> `/<stage>/api/<route>`) |
| `--reloadHandler` | boolean | `false` | Reload handlers on change, for serverless-offline compatibility (maps to `--watch`) |
| `--resourceRoutes` | boolean | — | Accepted for serverless-offline compatibility; ignored |
| `--terminateIdleLambdaTime` | string | `60` | Number of seconds an idle Lambda runner stays warm before it is terminated. Default: 60. |
| `--useDocker` | boolean | `false` | Run supported Lambda handlers in Docker containers |
| `--useInProcess` | boolean | `false` | Run Lambda handlers in the offline server process (Node.js only) instead of spawning a worker thread per concurrent invocation. Faster invocation, but handler module state and process.env mutations persist between calls. Default: false. |
| `--watch` | boolean | `false` | Enable hot-reload of handler files (defaults off) |
| `--webSocketHardTimeout` | string | `7200` | Set WebSocket hard timeout in seconds to reproduce AWS limits (default 7200) |
| `--webSocketIdleTimeout` | string | `600` | Set WebSocket idle timeout in seconds to reproduce AWS limits (default 600) |
| `--websocketPort` | string | `3001` | Port for the WebSocket server (default 3001) |

Each surface binds its own port — `--httpPort` (HTTP API + REST), `--websocketPort` (WebSocket + `@connections`), `--albPort` (ALB), and `--lambdaPort` (Lambda Invoke) — matching the community plugin's ports. The flags marked _(serverless-offline compatibility; ignored)_ — `--preLoadModules`, `--resourceRoutes`, and `--noSponsor` — are accepted so existing `serverless-offline` config and command lines keep working, but they have no effect; a one-time boot warning lists any ignored keys it detects. Hot reload defaults **off**; enable it with `--watch` or `--reloadHandler`.

## Configuration (`custom.serverless-offline`)

The same runtime knobs can be set in `serverless.yml` under `custom.serverless-offline`, using the same config home and property names as the community [`serverless-offline`](https://github.com/dherault/serverless-offline) plugin (and the same names as the CLI flags). Precedence is **CLI flags > `custom.serverless-offline` > defaults**. There is no top-level `offline:` block — adding one produces an "unrecognized configuration" warning.

This block configures the offline runtime only. Event sources are not declared here — they come from your service's `events:` definitions, exactly as they would when deployed.

```yaml
custom:
  serverless-offline:
    httpPort: 3000
    lambdaPort: 3002
    useInProcess: true
```

`customAuthenticationProvider` is a config-only key (it has no CLI flag). Set it under `custom.serverless-offline` to point at a module that provides a custom authentication provider for local authorizers.

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
