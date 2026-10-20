<!--
title: Serverless Framework - Web Apps (AWS Lambda Web Functions)
description: How to deploy HTTP servers such as Express, Fastify, Hono and Next.js as AWS Lambda Web Functions with the Serverless Framework
short_title: Web Apps
keywords:
  [
    'Serverless Framework',
    'AWS Lambda',
    'Lambda Web Functions',
    'Web Functions',
    'Web Apps',
    'Express',
    'Next.js',
  ]
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/aws/guide/web-apps)

<!-- DOCS-SITE-LINK:END -->

# Web Apps (AWS Lambda Web Functions)

A web app is an HTTP server, written with Express, Fastify, Hono, Next.js or plain `node:http`, that runs on [AWS Lambda Web Functions](https://docs.aws.amazon.com/lambda/latest/dg/web-functions.html). Your code starts a server and listens on a port, as it does on a laptop or in a container; there is no handler to export and no adapter to install. Lambda gives each web app its own HTTPS endpoint, sends many concurrent requests to each execution environment, and scales the environments with traffic.

The Serverless Framework deploys web apps from the top-level `webApps` block in `serverless.yml`. For each web app, `serverless deploy` packages the code (bundling TypeScript with esbuild), uploads it, creates the web function and its endpoint, and prints the endpoint URL. A web app can also serve a custom domain such as `shop.example.com` through Amazon CloudFront, and several web apps can share one domain by path.

`webApps` sits next to `functions` and `sandboxes` in the same service, and uses the same `provider` settings for environment variables, IAM, VPC and tags.

---

## Web apps or functions?

AWS Lambda offers Event Functions, the functions you define under `functions`, and Web Functions, which you define under `webApps`. Both run your code without servers to manage; they differ in what your code looks like and how it is billed.

|                          | Functions (`functions`)                                                  | Web apps (`webApps`)                                                                                       |
| ------------------------ | ------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------- |
| Your code                | An exported handler, `(event, context)`                                  | A plain HTTP server that listens on a port                                                                 |
| Triggers                 | HTTP (API Gateway, function URL, ALB) and every `events` source          | HTTP requests to the web app's endpoint only                                                               |
| Requests per environment | One at a time, or several on [Managed Instances](./managed-instances.md) | Many at once: up to 128, 64 by default, adjusted by Lambda                                                 |
| Size                     | 128 to 10,240 MB of memory, x86_64 or arm64                              | 2 GB of memory and 2 vCPUs, arm64                                                                          |
| Runtimes                 | Many                                                                     | Node.js 24 (`nodejs24.x`) and newer                                                                        |
| Billing                  | Requests, plus configured memory for each request's duration             | Requests, plus the CPU time your code actively uses and the memory each environment consumes while it runs |
| Timeout                  | 6 seconds by default in the Framework, up to 900                         | 30 seconds by default, up to 900                                                                           |

Choose a web app when you already have, or want to write, a standard Node.js web server, or when requests spend most of their time waiting on databases and other APIs: one environment serves many of them at once, and you pay for the CPU time your code actually uses. Choose functions for event processing (queues, streams, schedules, S3 events), for runtimes other than Node.js, and for short requests at very high volume or CPU-heavy work, which the per-request pricing of functions favors. See [Costs](#costs).

For containers with OS-level isolation, per-session instances or suspend and resume, see [Sandboxes](./sandboxes.md).

---

## Quick start

**1. Write `serverless.yml`:**

```yml
service: my-web-app
frameworkVersion: '4'

provider:
  name: aws
  region: us-east-1

webApps:
  api:
    entry: src/server.js
```

**2. Write the server** in `src/server.js`. Listen on `process.env.PORT`; the Framework sets it to the address Lambda expects:

```js
import express from 'express'

const app = express()

app.get('/', (req, res) => res.json({ message: 'Hello from a web app' }))
app.get('/health', (req, res) => res.json({ ok: true }))

app.listen(process.env.PORT ?? 3000)
```

Install Express with `npm install express`, and set `"type": "module"` in `package.json` for the `import` syntax.

**3. Deploy:**

```bash
serverless deploy
```

The deploy prints the web app's endpoint:

```text
Deploying "my-web-app" to stage "dev" (us-east-1)
✔ Service deployed to stack my-web-app-dev (52s)
endpoint: https://abc123example.lambda-web.us-east-1.on.aws
```

**4. Send a request**, with `curl` or with the Framework:

```bash
serverless invoke --web-app api --path /health
```

The command prints the response's status line, headers and body; see [Invoking a web app](#invoking-a-web-app) for a sample.

Deploying again without changes prints `No changes to deploy` and skips the deploy. A code change creates a new version of the web app behind the same URL.

---

## Writing the server

Lambda tells your server where to listen in one environment variable, `AWS_LAMBDA_HTTP_ENDPOINT`, as a `host:port` pair. The Framework adds a small start file, `__sls_web_bootstrap.mjs`, at the root of each web app's package. It sets `PORT` and `HOSTNAME` from that address and then starts your `entry` as the main script, so `process.argv[1]` is the entry and, for CommonJS, `require.main === module` is true (except with a [prebuilt zip](#prebuilt-zip), which Lambda loads directly). So the code you run locally runs unchanged on Lambda:

- Servers that read `process.env.PORT` (Express, Fastify, Hono's Node server, most others) listen on the right port.
- Next.js standalone output reads `PORT` and `HOSTNAME`, and needs no changes at all. See [Next.js](#nextjs).

`PORT`, `HOSTNAME` and `AWS_LAMBDA_NODEJS_ENTRYPOINT` are set by the Framework, so they can't be set in a web app's `environment`. Lambda runs the file that `AWS_LAMBDA_NODEJS_ENTRYPOINT` names (`index.js` at the package root without it; see [Web Function deployment package](https://docs.aws.amazon.com/lambda/latest/dg/web-functions-configuration-deployment-package.html)), and the Framework sets it to the start file, or to `entry` for a prebuilt zip.

A few platform behaviors to keep in mind when writing the server (see the [Lambda Web Functions runtime guide](https://docs.aws.amazon.com/lambda/latest/dg/web-functions-runtimes.html) for details):

- One process serves many requests at once. Keep per-request state in the request, not in module-level variables.
- The server must start listening within 10 seconds of starting ([environment lifecycle](https://docs.aws.amazon.com/lambda/latest/dg/web-functions-env-lifecycle.html)). Do slow initialization lazily, or after `listen`.
- The endpoint speaks HTTP/1.1 and streams responses. WebSocket upgrades are not supported; server-sent events work.
- Lambda doesn't add CORS headers. Handle CORS in your app, for example with the `cors` package for Express.
- The 2 GB of memory is shared by the Node.js heap, buffers and all concurrent requests. The default heap is 1,024 MB ([memory guidance](https://docs.aws.amazon.com/lambda/latest/dg/web-functions-runtimes.html#web-functions-runtimes-memory)).

---

## Packaging

`entry` is the file that starts your server. The Framework packages each web app into its own zip, whatever `package.individually` says, following the same rules as functions.

### TypeScript and esbuild

A TypeScript `entry` (`.ts`, `.mts`, `.cts`, `.tsx`) is bundled with esbuild, exactly like a TypeScript handler:

```yml
webApps:
  api:
    entry: src/server.ts
```

The service-level `build.esbuild` settings (`external`, `minify`, `format`, `sourcemap` and the rest) apply to web apps as they do to functions; see [Building](./building.md). A JavaScript `entry` is bundled too when the web app sets `build: esbuild` or the service sets `build.esbuild`. `build: false` on a web app skips esbuild for that web app.

### JavaScript without bundling

A JavaScript `entry` that isn't bundled is zipped together with the service directory, as an unbundled function is: production dependencies from `node_modules` are included and devDependencies are left out. Service-level `package.patterns` apply first, then the web app's own:

```yml
webApps:
  api:
    entry: src/server.js
    package:
      patterns:
        - '!tests/**'
```

### Prebuilt output

A server that another tool has already built, such as Next.js standalone output, is selected with `package.patterns` and shipped as it is with `build: false`:

```yml
webApps:
  site:
    entry: .next/standalone/server.js
    build: false
    package:
      patterns:
        - '!**'
        - '.next/standalone/**'
```

`build: false` matters when the service also sets `build.esbuild` for its TypeScript functions, which would otherwise bundle the prebuilt server again.

### Prebuilt zip

`package.artifact` deploys a zip you built yourself:

```yml
webApps:
  api:
    entry: dist/index.js # the start file's path inside the zip
    package:
      artifact: build/api.zip
```

The zip is deployed exactly as supplied: the Framework doesn't add its start file, so `PORT` and `HOSTNAME` are not set. Your server reads the listen address from `AWS_LAMBDA_HTTP_ENDPOINT` itself:

```js
const [host, port] = (
  process.env.AWS_LAMBDA_HTTP_ENDPOINT ?? 'localhost:3000'
).split(':')
app.listen(Number(port), host)
```

`entry` is checked against the zip's contents when you package.

`artifact` can also be an S3 URI such as `s3://my-bucket/builds/api.zip`: the Framework downloads the object when you package and then handles it like a local zip, including the `entry` check and the upload to the deployment bucket. The identity you package with needs `s3:GetObject` on that object.

### Native modules

Web apps run on Linux on arm64 (Graviton). Dependencies with native code, such as `sharp` or `bcrypt`, must be installed or built for `linux-arm64`, for example in an arm64 Linux container or CI runner, or with your package manager's platform options.

### Source maps

Web apps built by esbuild get mapped stack traces by default. Source maps are on when `build.esbuild.sourcemap` is not set (esbuild then emits maps), with `sourcemap: true`, and with a `sourcemap` object that sets `setNodeOptions: true`. They are off with `sourcemap: false`, with a `sourcemap` object without `setNodeOptions: true`, when an esbuild `configFile` returns `sourcemap: false`, and for web apps esbuild doesn't build, such as ones with `build: false`. These are the same cases in which functions get `NODE_OPTIONS=--enable-source-maps`. For web apps the Framework's start file turns source maps on instead of `NODE_OPTIONS`, because a `NODE_OPTIONS` value replaces the runtime's default heap settings.

---

## Configuration reference

All web apps are defined under the top-level `webApps` key. Each key is the web app's name: letters, digits, `-` and `_`, ending in a letter or digit. A name can't also be used under `functions`, because both would be deployed under the same Lambda name, and for the same reason a web app's Lambda name (its `name`, or the default) can't match a function's.

<!-- prettier-ignore -->
```yml
webApps:
  <name>:
    entry: src/server.ts           # required: the file that starts the HTTP server
    runtime: nodejs24.x            # optional; Node.js 24 or newer (nodejsNN.x); default provider.runtime when nodejs24.x or newer, else nodejs24.x
    name: my-custom-name           # optional; default <service>-<stage>-<name>
    description: Storefront        # optional
    timeout: 60                    # optional, seconds, 3-900; default provider.timeout, else 30
    maxConcurrency: 64             # optional, 1-128: concurrent requests per environment
    environment:                   # optional, merged over provider.environment
      LOG_LEVEL: info
    logs:                          # optional, log levels (case-insensitive); default the provider.logs.lambda levels
      applicationLogLevel: info    # trace | debug | info | warn | error | fatal
      systemLogLevel: info         # debug | info | warn
    logRetentionInDays: 14         # optional; default provider.logRetentionInDays
    logDataProtectionPolicy:       # optional; default provider.logDataProtectionPolicy (see Logs)
      Name: mask-email-addresses
      Version: '2021-06-01'
      Statement: []
    role: arn:aws:iam::123456789012:role/my-role # optional; default the service's execution role
    iam:                           # optional: a role of the web app's own; doesn't apply with role (see IAM)
      inheritStatements: true      # optional; add provider.iam.role.statements (default: false, true in perFunction mode)
      role:
        statements: []             # IAM policy statements for this web app
        managedPolicies: []        # managed policy ARNs attached to its role
        name: my-api-role          # optional; default <service>-<stage>-<name>-<region>-lambdaRole
        path: /web/                # optional
        permissionsBoundary: arn:aws:iam::123456789012:policy/boundary # optional
        tags:                      # optional, merged over provider.iam.role.tags
          team: web
    vpc:                           # optional; default provider.vpc
      subnetIds: [subnet-0a1b2c3d4e5f60718, subnet-0f1e2d3c4b5a69788]
      securityGroupIds: [sg-0123456789abcdef0]
    kmsKeyArn: arn:aws:kms:us-east-1:123456789012:key/1234abcd-12ab-34cd-56ef-1234567890ab # optional
    tags:                          # optional, merged over provider.tags
      team: web
    build: false                   # optional: false skips esbuild; esbuild bundles any entry
    package:
      patterns: ['!tests/**']      # optional, added after the service-level patterns
      artifact: build/api.zip      # optional: deploy a prebuilt zip as it is
    url:                           # optional; true (the default) or settings
      authorizer: aws_iam          # optional: callers sign requests with IAM credentials
      maxEnvironments: 50          # optional, 2 to 10000: execution environments
      rateLimit: 2000              # optional: requests per second
```

| Property                  | Default                              | Description                                                                                                                                                                                                                                                                                                                                                                                 |
| ------------------------- | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `entry`                   | **required**                         | The file that starts your HTTP server, relative to the service directory, or its path inside the zip when `package.artifact` is set. Absolute paths and `..` segments are not accepted. Sets Lambda's `AWS_LAMBDA_NODEJS_ENTRYPOINT`.                                                                                                                                                       |
| `runtime`                 | `provider.runtime` or `nodejs24.x`   | Node.js 24 or newer, written `nodejsNN.x`. Without it, web apps use `provider.runtime` when that is `nodejs24.x` or newer, else `nodejs24.x`. A newer version works as soon as Lambda supports it; until then, the deploy fails with Lambda's error.                                                                                                                                        |
| `name`                    | `<service>-<stage>-<name>`           | The web function's name in AWS: letters, digits, `-` and `_`, up to 64 characters. A default name longer than 64 characters is shortened and ends in a hash.                                                                                                                                                                                                                                |
| `description`             | none                                 | Up to 256 characters.                                                                                                                                                                                                                                                                                                                                                                       |
| `timeout`                 | `provider.timeout` when set, else 30 | The longest a request may run, in seconds (3 to 900). See [Provider settings web apps inherit](#provider-settings-web-apps-inherit), and [Custom domains](#custom-domains) for the limit behind CloudFront.                                                                                                                                                                                 |
| `maxConcurrency`          | Lambda's default, 64                 | The most requests one execution environment serves at once (1 to 128). Lambda adjusts the actual number dynamically below this bound.                                                                                                                                                                                                                                                       |
| `environment`             | none                                 | Environment variables, merged over `provider.environment`. Values can be CloudFormation references. See [Environment variables](#environment-variables).                                                                                                                                                                                                                                    |
| `logs`                    | `provider.logs.lambda` levels        | `applicationLogLevel` and `systemLogLevel`, each over the same level in `provider.logs.lambda`; without either, Lambda's default, `info`. See [Logs](#logs).                                                                                                                                                                                                                                |
| `logRetentionInDays`      | `provider.logRetentionInDays`        | Retention for the web app's log groups.                                                                                                                                                                                                                                                                                                                                                     |
| `logDataProtectionPolicy` | `provider.logDataProtectionPolicy`   | A CloudWatch Logs data protection policy for both log groups. See [Logs](#logs).                                                                                                                                                                                                                                                                                                            |
| `role`                    | the service's execution role         | An IAM role ARN, a role name, or a CloudFormation reference. See [IAM](#iam).                                                                                                                                                                                                                                                                                                               |
| `iam`                     | none                                 | A role of the web app's own: `iam.role.statements`, `managedPolicies`, `name`, `path`, `permissionsBoundary`, `tags`, and `iam.inheritStatements`. See [IAM](#iam).                                                                                                                                                                                                                         |
| `vpc`                     | `provider.vpc`                       | `subnetIds` and `securityGroupIds` for outbound access to your VPC. See [VPC](#vpc).                                                                                                                                                                                                                                                                                                        |
| `kmsKeyArn`               | `provider.kmsKeyArn`                 | The KMS key that encrypts the web app's environment variables.                                                                                                                                                                                                                                                                                                                              |
| `tags`                    | none                                 | Tags for the web function, merged over `provider.tags`. Values can be CloudFormation references.                                                                                                                                                                                                                                                                                            |
| `build`                   | esbuild for a TypeScript `entry`     | `false` skips esbuild for this web app; `esbuild` bundles any `entry`. See [Packaging](#packaging).                                                                                                                                                                                                                                                                                         |
| `package.patterns`        | none                                 | Include and exclude patterns, applied after the service-level `package.patterns`.                                                                                                                                                                                                                                                                                                           |
| `package.artifact`        | none                                 | A zip to deploy as it is. See [Prebuilt zip](#prebuilt-zip).                                                                                                                                                                                                                                                                                                                                |
| `url`                     | `true`                               | The web app's endpoint. Every web app has one, so `false` is not accepted. See [Endpoint and access](#endpoint-and-access).                                                                                                                                                                                                                                                                 |
| `url.authorizer`          | none (public)                        | `aws_iam` requires callers to sign requests with IAM credentials.                                                                                                                                                                                                                                                                                                                           |
| `url.maxEnvironments`     | none                                 | The most execution environments the endpoint scales to, 2 to 10000.                                                                                                                                                                                                                                                                                                                         |
| `url.rateLimit`           | none                                 | The most requests per second the endpoint accepts. Lambda accepts `0`, 100 to 1,000 in steps of 100, and 2,000 to 10,000 in steps of 1,000; `0` blocks all traffic, and requests then get HTTP 503 with `lambda-web-error-type: Platform.EndpointDisabled`. See [scaling settings](https://docs.aws.amazon.com/lambda/latest/dg/web-functions-scaling.html#web-functions-scaling-settings). |

---

## Endpoint and access

Every web app gets one HTTPS endpoint, and `serverless deploy` and `serverless info` print its URL. The endpoint is public by default, like a function URL with `url: true`; your app decides who may do what.

To require AWS credentials instead, set `authorizer: aws_iam`. Callers then sign each request with Signature Version 4 for the `lambda` service, including the `X-Amz-Content-SHA256` header, and need `lambda:InvokeWebFunctionEndpoint` permission on the web app ([signing requests](https://docs.aws.amazon.com/lambda/latest/dg/web-functions-endpoint-access-control.html#web-functions-endpoint-access-control-signing)). `serverless invoke --web-app` signs its requests for you.

```yml
webApps:
  admin:
    entry: src/admin.ts
    url:
      authorizer: aws_iam
```

`url.maxEnvironments` and `url.rateLimit` cap how far the endpoint scales and how many requests per second it accepts. Requests above the limits get HTTP 429.

Behind a [custom domain](#custom-domains), the endpoint requires signed requests: CloudFront signs the ones it forwards, and unsigned requests sent to the endpoint directly get HTTP 403.

---

## Provider settings web apps inherit

Web apps take these `provider` settings, the same way functions do; a value on the web app wins:

- `environment`, merged under the web app's `environment`.
- `iam`: the service's execution role and its statements, managed policies, permissions boundary and `mode: perFunction`. See [IAM](#iam).
- `vpc`. See [VPC](#vpc).
- `tags`, merged under the web app's `tags`, and `stackTags`.
- `kmsKeyArn`, `logRetentionInDays` and `logDataProtectionPolicy`.
- `logs.lambda.applicationLogLevel` and `logs.lambda.systemLogLevel`, under the web app's `logs`. A web app always logs JSON, so they apply whatever `logs.lambda.logFormat` says; functions take them only with `logFormat: JSON`.
- `timeout`, when you set it.
- `runtime`, when it is `nodejs24.x` or newer. Any other `provider.runtime`, such as `nodejs22.x` or `python3.12`, stays with the functions, and web apps run on `nodejs24.x`.

Web Functions currently support `nodejs24.x`, so with a newer `provider.runtime`, set `runtime: nodejs24.x` on the web app until Lambda supports the newer version.

The Framework's function defaults don't apply: web apps don't take `memorySize` or `architecture`.

These settings apply to functions only: `provider.logs.lambda.logFormat`, `logGroup` and `logGroupClass`, `provider.tracing.lambda`, `provider.layers`, `provider.runtimeManagement` and `provider.versionFunctions`, and the alarms and dashboards from [`custom.alerts`](./alerts.md).

**Timeout.** A web app's timeout is its own `timeout`, else `provider.timeout` when you set one, else Lambda's default of 30 seconds. A service with `provider.timeout: 6` for its functions therefore gives its web apps 6 seconds too. Set `timeout` on the web app when it needs longer:

```yml
provider:
  name: aws
  timeout: 6 # functions

webApps:
  api:
    entry: src/server.ts
    timeout: 30 # this web app
```

### VPC

A web app reaches resources in your VPC (databases, internal APIs) through a network connector that the Framework creates for it. The connector handles outbound traffic only; requests still arrive through the web app's endpoint.

- A web app without its own `vpc` uses `provider.vpc` when it is set. All web apps that use `provider.vpc` share one connector. `provider.vpc.ipv6AllowedForDualStack: true` makes it dual-stack, as for functions.
- A web app with its own `vpc` gets its own connector.
- Creating a connector takes about 4 minutes, once, on the first deploy that adds it. A service that already sets `provider.vpc` for its functions pays this the first time it adds a web app.
- Right after the first deploy that creates a VPC connector, connections from the web app into the VPC can time out for up to about a minute. Later deploys reuse the connector and aren't affected.
- Use at least two subnets in different Availability Zones. Traffic leaves through those subnets, so they need a route to a NAT gateway to reach the internet, including AWS service endpoints you don't reach through VPC endpoints ([VPC networking](https://docs.aws.amazon.com/lambda/latest/dg/web-functions-networking.html#web-functions-networking-vpc)).
- A web app can't opt out of an inherited `provider.vpc`; give it its own `vpc` instead, or define it in a service without `provider.vpc`.

```yml
webApps:
  api:
    entry: src/server.ts
    vpc:
      subnetIds:
        - subnet-0a1b2c3d4e5f60718
        - subnet-0f1e2d3c4b5a69788
      securityGroupIds:
        - sg-0123456789abcdef0
```

### Environment variables

A web app's environment is `provider.environment` merged with its own `environment`. Values can be strings or CloudFormation references (`!Ref`, `!GetAtt`, `!ImportValue`, `!Sub`) resolved when the stack deploys.

Names that Lambda sets itself, such as `AWS_REGION` and `AWS_LAMBDA_HTTP_ENDPOINT`, can't be set, and neither can `PORT`, `HOSTNAME` and `AWS_LAMBDA_NODEJS_ENTRYPOINT`, which the Framework sets. When `provider.environment` sets one of the Framework's three, the web app gets the Framework's value. The exception is a web app with a [prebuilt zip](#prebuilt-zip): the Framework adds no start file to the zip, so `PORT` and `HOSTNAME` from `provider.environment` reach the app unchanged. Each value can be up to 4,096 characters and all of them together up to 32 KB; the Framework checks literal values when you package.

### IAM

Web apps use the service's execution role, so `provider.iam.role.statements` grant permissions to functions and web apps alike, and the role gets write access to the web apps' log groups. With `provider.iam.role.mode: perFunction`, each web app gets a role of its own, as each function does. A web app that needs a different role sets `role` to an ARN, a role name or a CloudFormation reference. That role must trust `lambda.amazonaws.com` and allow writing to the web app's two log groups ([execution role](https://docs.aws.amazon.com/lambda/latest/dg/web-functions-permissions.html#web-functions-permissions-execution-role-create)).

```yml
provider:
  name: aws
  iam:
    role:
      statements:
        - Effect: Allow
          Action: [dynamodb:GetItem, dynamodb:PutItem]
          Resource: !GetAtt OrdersTable.Arn

webApps:
  api:
    entry: src/server.ts # can read and write OrdersTable
```

A web app that needs permissions the rest of the service doesn't sets `iam.role`, as a function does ([Per-Function IAM Roles](./iam.md#per-function-iam-roles)). With `iam.role.statements` or `iam.role.managedPolicies`, the web app gets a role of its own, named `<service>-<stage>-<name>-<region>-lambdaRole` unless you set `iam.role.name`. The role gets write access to the web app's log groups, decrypt access to its `kmsKeyArn`, and the statements and managed policies you list. `provider.iam.role.statements` are added to it with `iam.inheritStatements: true`; with `provider.iam.role.mode: perFunction` they are added unless `iam.inheritStatements: false`. `iam.role` also takes `path`, `permissionsBoundary` and `tags`. `role` can't be combined with `iam.role.statements` or `iam.role.managedPolicies`; with `role` set, the other `iam` settings don't apply. When `provider.iam.role` names an existing role, the web app's `iam` settings don't apply.

```yml
webApps:
  uploads:
    entry: src/uploads.ts
    iam:
      role:
        statements:
          - Effect: Allow
            Action: [s3:PutObject]
            Resource: arn:aws:s3:::uploads-${sls:stage}/*
```

---

## Custom domains

A web app can serve your own hostname. Add an entry with `webApp` to `provider.domain` or `provider.domains`, the same keys that configure [custom domains](./domains.md) for API Gateway:

```yml
provider:
  name: aws
  domains:
    - name: shop.example.com
      webApp: web # everything else
    - name: shop.example.com
      basePath: api # /api and /api/*
      webApp: api

webApps:
  web:
    entry: .next/standalone/server.js
    build: false
    package:
      patterns: ['!**', '.next/standalone/**']
  api:
    entry: src/server.ts
```

For each hostname, the Framework puts an Amazon CloudFront distribution in front of the web apps. It uses an ACM certificate for the hostname from us-east-1 (CloudFront's certificate Region, whatever Region the service deploys to): an existing one that covers the hostname, such as a wildcard certificate for `*.example.com`, or, when the hostname's zone is in Route 53, one it requests and validates through DNS. It then points A and AAAA alias records in that zone at the distribution. `serverless deploy` and `serverless info` list each hostname next to the web app's own endpoint. Hostnames are case-insensitive: `Shop.Example.com` and `shop.example.com` name the same hostname, and the Framework uses the lowercase form.

The first deploy with a new hostname takes several minutes, mostly waiting for the certificate and the distribution. Later deploys update the distribution in place. `serverless remove` deletes the distribution and the A and AAAA records, which also takes a few minutes. The certificate and its DNS validation record stay, as they do for API Gateway custom domains, so a later deploy reuses the certificate.

Each web app served on a domain adds one CloudFront origin access control, which signs CloudFront's requests to the web app's endpoint. An AWS account can have 100 origin access controls; a higher quota is requested through AWS Support ([CloudFront quotas](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/cloudfront-limits.html#limits-web-distributions)). A deploy that would go over the quota rolls back with `Limit exceeded for resource of type 'AWS::CloudFront::OriginAccessControl'`.

### Routing by `basePath`

Several entries for one hostname route by path to web apps of the same service:

- The entry without `basePath` receives every path no other entry matches. Each hostname needs exactly one.
- An entry with `basePath: api` receives `/api` and every path under `/api/`.
- The longest matching `basePath` wins: with entries for `api` and `api/v2`, a request for `/api/v2/orders` reaches the `api/v2` web app and `/api/users` reaches the `api` one.
- The path reaches the web app unchanged: a request for `/api/users` arrives as `/api/users`, so the `api` app defines its routes under `/api`.

API Gateway entries strip the base path instead. The two behaviors side by side:

| Request                              | `basePath: api`, `webApp: api` | `basePath: api`, `apiType: http` |
| ------------------------------------ | ------------------------------ | -------------------------------- |
| `https://shop.example.com/api/users` | the web app sees `/api/users`  | the API sees `/users`            |

A hostname serves either web apps or API Gateway APIs. A hostname that already exists as an API Gateway custom domain in the account stops the deploy before anything changes.

### What the web app sees behind CloudFront

- Every request reaches the web app: responses aren't cached, all HTTP methods are allowed, and headers (other than `Host`), cookies and query strings are forwarded, including `Authorization`. HTTP requests are redirected to HTTPS.
- `Host` is the web app's endpoint domain. The public hostname arrives in `X-Forwarded-Host`, which CloudFront sets and viewers can't override; use it to build absolute URLs and redirects.
- The endpoint requires signed requests, so anonymous callers can't bypass the domain: CloudFront signs the requests it forwards, and an unsigned request to the endpoint gets HTTP 403. IAM identities in your account that are allowed to invoke the web app can still call the endpoint directly, which is how `serverless invoke --web-app` reaches it.
- A web app behind a domain can't set `url.authorizer`. Authenticate users in your app, for example with a session cookie or a bearer token.

### Response time limit

Behind a custom domain, CloudFront waits a limited time for a response to start, and between parts of a streamed response ([response timeout](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/DownloadDistValuesOrigin.html#DownloadDistValuesOriginResponseTimeout)). The Framework sets that wait to the web app's timeout plus 5 seconds, so for an ordinary response the web app's own timeout answers first. CloudFront allows at most 120 seconds:

- A response must start within `timeout` + 5 seconds, and a streamed response must not pause longer than that between chunks. Neither wait can exceed 120 seconds.
- When CloudFront stops waiting, it returns its own `504`. That response has no `lambda-web-*` headers, which tells it apart from a web app's own timeout.
- For a `GET` or `HEAD` request, CloudFront tries again before it returns the `504`, up to 3 attempts in all ([connection attempts](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/DownloadDistValuesOrigin.html#origin-connection-attempts)). Each attempt runs in your web app to completion and is billed. `POST`, `PUT`, `PATCH`, `DELETE` and `OPTIONS` requests are not retried.
- A web app with a timeout above 115 seconds behind a domain gets a warning at `serverless package` and `serverless deploy`. Through the domain, CloudFront waits at most 120 seconds for a response to start and between response bytes, so longer requests work only on the web app's own endpoint.

### Certificate and DNS settings

Set certificate and DNS settings (`certificateArn`, `certificateName`, `createRoute53Record`, `createRoute53IPv6Record`, `hostedZoneId`, `hostedZonePrivate`, `splitHorizonDns`, `route53Profile`, `route53Region`, `route53Params`) on the hostname's entry without `basePath`; they apply to the whole hostname. Entries with `basePath` leave them out or repeat the same values; a different value on an entry with `basePath` stops the deploy with a message naming the key.

For a hostname whose DNS is not in Route 53, set `createRoute53Record: false`. Outside Route 53 the Framework can't request a certificate for you, so create or import an ACM certificate in us-east-1 that covers the hostname. The deploy finds it by hostname, or you can name it in `certificateArn`:

```yml
provider:
  domains:
    - name: shop.example.com
      webApp: web
      createRoute53Record: false
      certificateArn: arn:aws:acm:us-east-1:123456789012:certificate/12345678-1234-1234-1234-123456789012
```

After the deploy, create a CNAME record for the hostname at your DNS provider that points to the distribution's domain name. `serverless info --verbose` prints it as the stack output `<Hostname>CloudFrontDistributionDomainName`, where `<Hostname>` is the lowercase hostname with each `.` written as `Dot` and each `-` as `Dash`, starting with a capital letter. For example, `shop.example.com` gives `ShopDotexampleDotcomCloudFrontDistributionDomainName`, and `my-shop.example.com` gives `MyDashshopDotexampleDotcomCloudFrontDistributionDomainName`.

When the hostname's zone is in Route 53, `createRoute53Record: false` only skips the alias records: the deploy still finds the certificate, or requests one and validates it through the zone.

Entries with `webApp` take the hostname-wide keys above plus `name`, `basePath`, `webApp` and `enabled`. The API Gateway keys (`apiType`, `endpointType`, `securityPolicy`, `accessMode`, `allowPathMatching`, `preserveExternalPathMappings`, `autoDomain`, `autoDomainWaitFor`, `tlsTruststoreUri`, `tlsTruststoreVersion`, `rest`, `http` and `websocket`) are not accepted on them.

---

## Next.js

Next.js runs as a web app from its [standalone output](https://nextjs.org/docs/app/api-reference/config/next-config-js/output), the self-contained server `next build` writes with `output: 'standalone'`. The Framework's start file sets the `PORT` and `HOSTNAME` that `server.js` reads, so the build needs no Lambda-specific code.

Set these options in `next.config.mjs`, next to any options your project already has:

```js
import { fileURLToPath } from 'node:url'

const projectRoot = fileURLToPath(new URL('.', import.meta.url))

const nextConfig = {
  output: 'standalone',
  outputFileTracingRoot: projectRoot,
  turbopack: {
    root: projectRoot,
  },
}

export default nextConfig
```

When a parent directory holds another lockfile, Next.js can pick that directory as the project root and write `server.js` to a nested path under `.next/standalone/`. Setting `outputFileTracingRoot` and `turbopack.root` to the project directory keeps it at `.next/standalone/server.js`.

`next build` doesn't copy `public/` and `.next/static/` into the standalone directory, so the build script copies them:

```json
{
  "scripts": {
    "build": "next build && cp -r public .next/standalone/ && cp -r .next/static .next/standalone/.next/"
  }
}
```

`serverless.yml` deploys the standalone directory as it is:

```yml
webApps:
  site:
    entry: .next/standalone/server.js
    build: false
    package:
      patterns:
        - '!**'
        - '.next/standalone/**'
```

Run `npm run build`, then `serverless deploy`. The [Next.js example](https://github.com/serverless/examples/tree/v4/aws-node-nextjs-web-app) is a complete, deployable app.

---

## Deploying

`serverless deploy` uploads each web app's zip to the [deployment bucket](../../../guides/deployment-bucket.md) under a name derived from its content, and uploads it only when that content is new. Identical code gives an identical zip and an identical deployment, so a service whose code and configuration are unchanged gets `No changes to deploy`. Services without functions, such as one with only web apps, sandboxes, agents or `resources`, skip an unchanged deploy the same way, as long as their stack holds the last deploy: after a deploy that failed or rolled back, the next deploy runs even when nothing changed. These uploads sit outside the per-deploy directories, so cleanup of old deployments and `serverless prune` leave them in place; `serverless remove` deletes them.

Lambda reads web app code straight from the deployment bucket, which therefore has to be versioned and readable by Lambda, the same requirements as [`codeStorageMode: reference`](../../../guides/deployment-bucket.md#code-storage-mode-self-managed-lambda-code-storage). The Framework-managed bucket meets them automatically. A bucket you name in `provider.deploymentBucket.name` is checked at deploy and never modified: the deploy stops when the bucket isn't versioned, or has no bucket policy (the message includes the statement to add), and warns when the policy doesn't appear to grant Lambda read access. A service whose deployment bucket lives in its own stack (services first deployed before v4, or with `provider.enableLegacyDeploymentBucket`) needs `provider.deploymentBucket.versioning: true`.

Each deploy that changes a web app's code or configuration creates a new revision of the web function, and the endpoint moves all traffic to it once it is ready; the URL stays the same.

- `serverless rollback --timestamp <timestamp>` restores an earlier deployment, including its web app code.
- `serverless remove` deletes the web apps, their endpoints, log groups and uploaded code.
- `serverless deploy function` deploys functions only. For a web app it prints `"<name>" is a web app. Deploy it with serverless deploy.`

### Permissions

The identity that runs `serverless deploy` needs these permissions for web apps, in addition to what every deploy needs:

- The Web Function API: `lambda:CreateWebFunction`, `lambda:GetWebFunction`, `lambda:DeleteWebFunction`, `lambda:ListWebFunctions`, `lambda:CreateWebFunctionRevision`, `lambda:GetWebFunctionRevision`, `lambda:DeleteWebFunctionRevision`, `lambda:ListWebFunctionRevisions`, `lambda:CreateWebFunctionEndpoint`, `lambda:GetWebFunctionEndpoint`, `lambda:UpdateWebFunctionEndpoint`, `lambda:DeleteWebFunctionEndpoint`, `lambda:ListWebFunctionEndpoints`, `lambda:TagResource`, `lambda:UntagResource` and `lambda:ListTags`.
- `iam:PassRole` for the web apps' execution roles.
- On the deployment bucket's objects: `s3:GetObject` and `s3:GetObjectVersion` (the check whether a zip is already uploaded uses `s3:GetObject`) and `s3:PutObject`. `s3:ListBucket` is optional: without it, S3 answers that check for a zip that isn't uploaded yet with access denied instead of not found, and the deploy uploads the zip either way.
- On the deployment bucket itself: `s3:GetBucketPolicy` and `s3:PutBucketPolicy` for the Framework-managed bucket, or `s3:GetBucketVersioning` for a bucket you name in `provider.deploymentBucket.name`. With `s3:GetBucketPolicy` too, the deploy also checks that the bucket policy lets Lambda read your code; without it, that check is skipped.
- With a `package.artifact` S3 URI: `s3:GetObject` on that object, which the Framework downloads when it packages. When the object is missing, S3 reports access denied instead of not found unless the identity also has `s3:ListBucket` on its bucket.
- With `kmsKeyArn`: `kms:CreateGrant`, `kms:Decrypt`, `kms:DescribeKey` and `kms:GenerateDataKey`.
- With `vpc`, the web app's own or the inherited `provider.vpc`: `lambda:CreateNetworkConnector`, `lambda:GetNetworkConnector`, `lambda:UpdateNetworkConnector`, `lambda:DeleteNetworkConnector`, `lambda:ListNetworkConnectors`, `lambda:PassNetworkConnector`, `ec2:DescribeSubnets`, `ec2:DescribeSecurityGroups` and `iam:CreateServiceLinkedRole`.
- With a [custom domain](#custom-domains):
  - the CloudFront distribution and origin access control permissions CloudFormation needs, for example `cloudfront:CreateDistribution`, `cloudfront:GetDistribution`, `cloudfront:UpdateDistribution`, `cloudfront:DeleteDistribution`, `cloudfront:TagResource`, `cloudfront:CreateOriginAccessControl`, `cloudfront:GetOriginAccessControl`, `cloudfront:UpdateOriginAccessControl` and `cloudfront:DeleteOriginAccessControl`;
  - `lambda:PutResourcePolicy`, `lambda:GetResourcePolicy` and `lambda:DeleteResourcePolicy`, for the policy that lets CloudFront call the web app;
  - `acm:ListCertificates`, `acm:DescribeCertificate` and `acm:RequestCertificate` in us-east-1, to find or request the certificate;
  - `route53:ListHostedZones` and `route53:ChangeResourceRecordSets`, for the certificate's validation record and the alias records;
  - `apigateway:GET`, to check that the hostname isn't already an API Gateway custom domain.

`serverless remove` also needs `cloudformation:DescribeStackResource` on the service's stack and `logs:DeleteLogGroup` on each web app's two log groups, `/aws/lambda/web/<function-name>` and `/aws/lambda/web/<function-name>.local`. Before deleting the stack, `remove` looks up which of these log groups the stack holds, and after the stack is deleted, it deletes those log groups again, because Lambda can recreate a log group, without a retention period, from log lines that arrive late. A log group the stack doesn't hold, such as one that belongs to another service's web app with the same `name`, is left alone. Without either permission, `remove` still completes and prints a warning for each log group, and a log group Lambda recreates stays in place.

`serverless invoke --web-app` and `serverless logs --web-app` need the permissions listed in [Invoking a web app](#invoking-a-web-app) and [Logs](#logs).

---

## When a deploy succeeds but requests return errors

`serverless deploy` finishes when the web app's new version is in place; it doesn't send a request to the app. A server that throws while starting therefore deploys successfully, and every request then gets HTTP `502` with the response header `lambda-web-error-type: Application.InitCodeError`. The exception is a CommonJS entry with an `--import` or `--loader` preload in `NODE_OPTIONS`: a throw while the entry loads gives `lambda-web-error-type: Runtime.ExitError`, and the logs show Node's raw stack trace.

After a deploy, check the app with a request, and when something is off, read its logs:

```bash
serverless invoke --web-app api --path /health
serverless logs --web-app api --startTime 10m
```

The `lambda-web-error-type` header names platform errors such as initialization failures, timeouts and throttling ([error types](https://docs.aws.amazon.com/lambda/latest/dg/web-functions-troubleshooting.html#web-functions-troubleshooting-error-types)); a response without it came from your app. To go back to the last working version while you fix the code, list the deployments and roll back:

```bash
serverless deploy list
serverless rollback --timestamp <timestamp>
```

### The server never starts listening

Every request gets HTTP `502` with `lambda-web-error-type: Application.TimeoutListenError`, and the logs show `nothing was listening on 0.0.0.0:3000 within 9000ms`. Common causes:

- **The server starts only behind `import.meta.main`.** Lambda loads your entry as a module, not as the main script, so `import.meta.main` is `false`. Start the server unconditionally. The `require.main === module` and `process.argv[1]` checks work, except in a [prebuilt zip](#prebuilt-zip), which Lambda loads directly.
- **The server listens on `127.0.0.1` or `localhost`.** Lambda sends requests to `0.0.0.0`. Listen on `process.env.HOSTNAME` (in a prebuilt zip, the host from `AWS_LAMBDA_HTTP_ENDPOINT`), or leave the host out.
- **Start-up work before `listen` takes longer than about 9 seconds.** Do slow initialization lazily, or after `listen`.

---

## Invoking a web app

```bash
serverless invoke --web-app <name> [--path <path>] [--method <method>] [--header 'Name: value'] [--data '<body>'] [--log]
```

`serverless invoke --web-app` sends one HTTP request to the web app's endpoint and prints the response. Requests to an `aws_iam` endpoint, or to a web app behind a custom domain, are signed with your AWS credentials.

```text
$ serverless invoke --web-app api --path /health

HTTP 200 OK
content-length: 11
content-type: application/json; charset=utf-8
date: Thu, 15 Oct 2026 08:03:43 GMT
etag: W/"b-Ai2R8hgEarLmHKwesT1qcY913ys"
lambda-web-logstream: 2026/10/15/my-web-app-dev-api[rev-t8yf1]cc269a07c59a48d19d554992708bda83
lambda-web-request-id: DFWK6UW3VJPQRADPSKLN2OULWA
x-powered-by: Express

{"ok":true}
```

- The status line and headers go to standard error, and the body goes to standard output as it arrives, so piping the command to `jq` or a file passes the body alone.
- A redirect is printed with its `location` header, not followed.
- A status of 400 or above prints the whole response, then exits with code 1 and the error `✖ Web app "api" returned HTTP 404.`, so the command also works as a health check in CI.

| Flag                     | Default      | Description                                                                         |
| ------------------------ | ------------ | ----------------------------------------------------------------------------------- |
| `--web-app <name>`       | **required** | The web app's name under `webApps`.                                                 |
| `--path <path>`          | `/`          | Request path, with a query string if needed.                                        |
| `--method <method>`      | `GET`        | HTTP method.                                                                        |
| `--header 'Name: value'` | none         | A request header. Repeat the flag for more headers.                                 |
| `--data '<body>'`        | none         | Request body. It is not sent with `GET` or `HEAD`, so set `--method` along with it. |
| `--log`                  | off          | Print this request's log lines after the response.                                  |

A request to an `aws_iam` or custom-domain web app is signed over its `--header` headers too. The Framework sets `Host` on every request, and `Authorization`, `X-Amz-Date`, `X-Amz-Security-Token` and `X-Amz-Content-Sha256` on a signed one, so `--header` cannot set those: the command stops with an error such as `✖ --header cannot set Authorization: the Framework sets it to sign the request.` A public web app can get its own `Authorization` header. A value that is not in the form `Name: value`, or that has characters other than printable ASCII, stops the command too.

The options for invoking a function, an agent or a sandbox, such as `--qualifier`, `--raw` or `--port`, stop the command with an error, for example `✖ --qualifier is not available with --web-app.`

```bash
# GET /
serverless invoke --web-app api

# POST a JSON body
serverless invoke --web-app api --path /orders --method POST --header 'Content-Type: application/json' --data '{"sku":"A-1"}'

# Show the request's log lines too
serverless invoke --web-app api --path /health --log
```

Without a `Content-Type` header, `--data` is sent as `text/plain`, which a JSON body parser such as `express.json()` skips. To send JSON, set the header:

```bash
serverless invoke --web-app api --method POST --header 'Content-Type: application/json' --data '{"a":1}'
```

With `--log`, the command waits for the request's log lines, which usually arrive within about 10 seconds, and prints them after the body:

```text
{"timestamp":"2026-10-15T08:12:09.756Z","level":"INFO","message":"GET / served v1","requestId":"OJAKUSPFGG6SUUVAQAPSSH5IX4","endpointName":"main","region":"us-east-1"}
```

It shows lines written with `console.*` while handling the request; lines from startup code, timers or `process.stdout.write` carry no request ID and appear only in `serverless logs --web-app`. When no lines arrive within 30 seconds, the command still succeeds and prints:

```text
No log lines for this request arrived within 30 seconds. Run "serverless logs --web-app api" to see the web app's logs.
```

The caller needs `cloudformation:DescribeStacks` on the service's stack, to read the web app's endpoint, `lambda:InvokeWebFunctionEndpoint` for an `aws_iam` or custom-domain web app, and `logs:FilterLogEvents` on the web app's `.local` log group (see [Logs](#logs)) for `--log`.

---

## Logs

Lambda writes everything your server prints to standard output and standard error to CloudWatch Logs, together with its own system log lines. `console.*` output is written as JSON with the request ID.

Each web app has two log groups, both created by the deploy with the web app's retention and removed by `serverless remove` ([log groups](https://docs.aws.amazon.com/lambda/latest/dg/web-functions-logging.html#web-functions-logging-log-groups)):

- `/aws/lambda/web/<function-name>.local`, where lines arrive first, within seconds.
- `/aws/lambda/web/<function-name>`, which collects them a little later.

`<function-name>` is `<service>-<stage>-<name>` unless the web app sets `name`.

```bash
serverless logs --web-app api
serverless logs --web-app api --tail
serverless logs --web-app api --startTime 1h --filter ERROR
```

Your app's lines look like this; the first was written at startup and has no request ID, the second while handling a request:

```text
{"timestamp":"2026-10-15T08:03:43.526Z","level":"INFO","message":"listening on 0.0.0.0:3000","region":"us-east-1"}
{"timestamp":"2026-10-15T08:12:09.756Z","level":"INFO","message":"GET / served v1","requestId":"OJAKUSPFGG6SUUVAQAPSSH5IX4","endpointName":"main","region":"us-east-1"}
```

`serverless logs --web-app` reads the `.local` log group and takes the same options as `serverless logs --function`: `--startTime`, `--filter`, `--tail` and `--interval`. Before the web app has logged anything, for example right after its first deploy, the command stops with `No logs yet for web app "api". Send it a request, then run this command again.` The caller needs `logs:DescribeLogStreams` and `logs:FilterLogEvents` on that log group, `arn:aws:logs:<region>:<account-id>:log-group:/aws/lambda/web/<function-name>.local:*`. A grant on the other log group does not cover it.

`logs.applicationLogLevel` filters what your code writes with `console.*` (`trace`, `debug`, `info`, `warn`, `error`, `fatal`); `logs.systemLogLevel` sets which of Lambda's own lines are written (`debug`, `info`, `warn`). A level the web app doesn't set comes from `provider.logs.lambda`, which sets it for functions too; without either, it is `info` ([log levels](https://docs.aws.amazon.com/lambda/latest/dg/web-functions-logging.html#web-functions-logging-format-levels)). Values are case-insensitive.

```yml
provider:
  name: aws
  logs:
    lambda:
      applicationLogLevel: warn # functions and web apps

webApps:
  api:
    entry: src/server.ts
    logs:
      applicationLogLevel: debug # this web app
```

`logDataProtectionPolicy` masks sensitive data, such as email addresses, in both log groups ([data protection](https://docs.aws.amazon.com/AmazonCloudWatch/latest/logs/mask-sensitive-log-data-start.html)). A web app without one takes `provider.logDataProtectionPolicy`, which applies to functions too. `serverless logs --web-app` and `serverless invoke --web-app --log` print the masked lines; seeing the original text takes the `logs:Unmask` permission, in the CloudWatch console or API.

```yml
provider:
  name: aws
  logDataProtectionPolicy: # functions and web apps
    Name: mask-email-addresses
    Version: '2021-06-01'
    Statement:
      - Sid: audit
        DataIdentifier:
          - arn:aws:dataprotection::aws:data-identifier/EmailAddress
        Operation:
          Audit:
            FindingsDestination: {}
      - Sid: redact
        DataIdentifier:
          - arn:aws:dataprotection::aws:data-identifier/EmailAddress
        Operation:
          Deidentify:
            MaskConfig: {}
```

---

## Local development

Run the server on your machine as you would any Node.js server, for example `node src/server.js`, `npx tsx watch src/server.ts` or `next dev`. Without the Framework's start file, it listens on the fallback port in your code.

`serverless dev` runs a service's functions, agents and sandboxes; running web apps with it is planned. In a service that also has functions, `serverless dev` runs them and prints a notice that the web apps aren't included. In a service with only web apps, it stops with a message saying so.

---

## Inspecting deployed web apps

`serverless agent inspect --web-apps` describes the deployed web functions, their revisions and endpoints for AI coding agents, as JSON. See [agent inspect](../cli-reference/agent-inspect.md).

---

## Costs

Web apps are billed per request, for the CPU time your code actively uses, and for the memory each execution environment consumes for as long as it runs ([AWS Lambda pricing](https://aws.amazon.com/lambda/pricing/)). Because one environment serves many requests at once, requests that mostly wait on databases and other APIs share the cost of an environment, and web apps tend to cost less than functions for that kind of traffic. Very short requests at high volume, and CPU-heavy work, tend to cost less as functions.

The Framework adds the two log groups, kept for your retention setting, and S3 storage for each distinct build in the deployment bucket. A custom domain adds CloudFront, whose free tier covers 10 million requests and 1 TB of data out each month per account ([CloudFront pricing](https://aws.amazon.com/cloudfront/pricing/)).

---

## Examples

- [Express web app](https://github.com/serverless/examples/tree/v4/aws-node-express-web-app): an Express API with a public endpoint.
- [Next.js web app](https://github.com/serverless/examples/tree/v4/aws-node-nextjs-web-app): a Next.js app deployed from its standalone output.
- [Web apps on a custom domain](https://github.com/serverless/examples/tree/v4/aws-node-web-app-custom-domain): a Next.js frontend and an Express API sharing one domain by `basePath`.
