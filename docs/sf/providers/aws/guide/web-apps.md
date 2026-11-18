<!--
title: Web Apps (AWS Lambda Web Functions)
description: 'Deploy Express, Fastify, Hono or Next.js servers as AWS Lambda Web Functions with webApps: packaging, endpoints, domains, IAM, logs and errors.'
short_title: Web Apps
keywords:
  [
    'Serverless Framework',
    'AWS Lambda Web Functions',
    'webApps',
    'Express on Lambda',
    'Next.js on Lambda',
  ]
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/aws/guide/web-apps)

<!-- DOCS-SITE-LINK:END -->

# Web Apps (AWS Lambda Web Functions)

A web app is an HTTP server, written with Express, Fastify, Hono, Next.js or plain `node:http`, that runs on [AWS Lambda Web Functions](https://docs.aws.amazon.com/lambda/latest/dg/web-functions.html). Your code starts a server and listens on a port, as on a laptop or in a container, with no handler to export and no adapter. Lambda gives each web app its own HTTPS endpoint, sends many concurrent requests to each execution environment, and scales the environments with traffic, down to zero.

You define web apps under the top-level `webApps` key in `serverless.yml`, next to `functions` and `sandboxes`. `serverless deploy` packages each one (bundling TypeScript with esbuild), creates the web function and its endpoint, and prints the endpoint URL. A web app can also serve a custom domain through Amazon CloudFront, and several web apps can share one domain by path.

## Web apps or functions?

AWS Lambda runs Event Functions, which you define under `functions`, and Web Functions, which you define under `webApps`. They differ in what your code looks like and how it is billed:

|                          | Functions (`functions`)                                                         | Web apps (`webApps`)                                                                              |
| ------------------------ | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Your code                | An exported handler, `(event, context)`                                         | An HTTP server that listens on a port                                                             |
| Triggers                 | HTTP (API Gateway, function URL, ALB) and every `events` source                 | HTTP requests to the web app's endpoint                                                           |
| Requests per environment | One at a time, or several on [Managed Instances](./managed-instances.md)        | Many at once: up to 128, 64 by default, adjusted by Lambda                                        |
| Size                     | 128 to 10,240 MB of memory (up to 32,768 on Managed Instances), x86_64 or arm64 | 2 GB of memory and 2 vCPUs, arm64                                                                 |
| Runtimes                 | Many                                                                            | Node.js 24 (`nodejs24.x`) and newer                                                               |
| Billing                  | Requests, plus configured memory for each request's duration                    | Requests, plus the CPU time your code uses and the memory each environment consumes while it runs |
| Timeout                  | 6 seconds by default in the Framework, up to 900                                | 30 seconds by default, up to 900                                                                  |

Choose a web app for a standard Node.js web server, or for requests that spend most of their time waiting on databases and APIs: one environment serves many of them at once, and you pay for the CPU time your code uses. Choose functions for event processing (queues, streams, schedules, S3 events), for runtimes other than Node.js, and for very short requests at high volume or CPU-heavy work, which per-request pricing favors. For isolated containers per session with suspend and resume, see [Sandboxes](./sandboxes.md).

## Quick start

Prerequisites: Serverless Framework v4, AWS credentials, and Node.js 24 or later to run the server locally.

1. Create `serverless.yml`:

   ```yaml
   # serverless.yml
   service: my-web-app

   provider:
     name: aws
     region: us-east-1

   webApps:
     api:
       entry: src/server.js
   ```

2. Create `src/server.js`. It listens on `process.env.PORT`, which the Framework sets to the address Lambda expects:

   ```javascript
   import express from 'express'

   const app = express()

   app.get('/', (req, res) => res.json({ message: 'Hello from a web app' }))
   app.get('/health', (req, res) => res.json({ ok: true }))

   app.listen(process.env.PORT ?? 3000)
   ```

3. Install Express with `npm install express`, and set `"type": "module"` in `package.json` for the `import` syntax.

4. Deploy:

   ```bash
   serverless deploy
   ```

   ```text
   Deploying "my-web-app" to stage "dev" (us-east-1)
   ✔ Service deployed to stack my-web-app-dev (52s)
   endpoint: https://abc123example.lambda-web.us-east-1.on.aws
   ```

5. Send a request with `curl`, or with the Framework, which prints the status line, headers and body:

   ```bash
   serverless invoke --web-app api --path /health
   ```

Deploying again without changes prints `No changes to deploy`. A code change creates a new revision behind the same URL. `serverless remove` deletes the web app, its endpoint, log groups and uploaded code.

## Writing the server

Lambda tells your server where to listen in `AWS_LAMBDA_HTTP_ENDPOINT`, as a `host:port` pair. The Framework adds a start file, `__sls_web_bootstrap.mjs`, at the root of each web app's package: it sets `PORT` and `HOSTNAME` from that address and starts your `entry` as the main script, so `process.argv[1]` is the entry and, for CommonJS, `require.main === module` is true. Servers that read `process.env.PORT` (Express, Fastify, Hono's Node server and most others) and Next.js standalone output, which reads `PORT` and `HOSTNAME`, run unchanged. A [prebuilt zip](#prebuilt-zip) gets no start file.

`PORT`, `HOSTNAME` and `AWS_LAMBDA_NODEJS_ENTRYPOINT` are the Framework's, so a web app's `environment` can't set them. Lambda runs the file `AWS_LAMBDA_NODEJS_ENTRYPOINT` names (`index.js` without it, see [Web Function deployment package](https://docs.aws.amazon.com/lambda/latest/dg/web-functions-configuration-deployment-package.html)); the Framework sets it to the start file, or to `entry` for a prebuilt zip.

The platform behaviors to design for ([runtime guide](https://docs.aws.amazon.com/lambda/latest/dg/web-functions-runtimes.html)):

- One process serves many requests at once. Keep per-request state in the request, not in module-level variables.
- The server must start listening within 10 seconds of starting ([environment lifecycle](https://docs.aws.amazon.com/lambda/latest/dg/web-functions-env-lifecycle.html)). Do slow initialization lazily, or after `listen`.
- The endpoint speaks HTTP/1.1 and streams responses. Server-sent events work; WebSocket upgrades don't.
- Lambda adds no CORS headers. Handle CORS in your app, for example with the `cors` package for Express.
- The 2 GB of memory holds the Node.js heap, buffers and all concurrent requests. The default heap is 1,024 MB ([memory guidance](https://docs.aws.amazon.com/lambda/latest/dg/web-functions-runtimes.html#web-functions-runtimes-memory)).

## Packaging

`entry` is the file that starts your server. The Framework packages each web app into its own zip, whatever `package.individually` says, with the same rules as functions.

### TypeScript and esbuild

A TypeScript `entry` (`.ts`, `.mts`, `.cts`, `.tsx`) is bundled with esbuild, like a TypeScript handler, with the service-level `build.esbuild` settings (`external`, `minify`, `format`, `sourcemap` and the others; see [Building](./building.md)). A JavaScript `entry` is bundled too when the web app sets `build: esbuild` or the service sets `build.esbuild`. `build: false` skips esbuild for one web app.

```yaml
webApps:
  api:
    entry: src/server.ts
```

### JavaScript without bundling

A JavaScript `entry` that isn't bundled is zipped with the service directory, as an unbundled function is: production dependencies from `node_modules` are included and devDependencies left out. Service-level `package.patterns` apply first, then the web app's own:

```yaml
webApps:
  api:
    entry: src/server.js
    package:
      patterns:
        - '!tests/**'
```

### Prebuilt output

A server another tool has built, such as Next.js standalone output, is selected with `package.patterns` and shipped as it is with `build: false`, which also keeps a service-level `build.esbuild` from bundling it again:

```yaml
webApps:
  site:
    entry: .next/standalone/server.js
    build: false
    package:
      patterns:
        - '!**'
        - '.next/standalone/**'
```

### Prebuilt zip

`package.artifact` deploys a zip you built, exactly as supplied. `entry` is the start file's path inside the zip, checked when you package:

```yaml
webApps:
  api:
    entry: dist/index.js
    package:
      artifact: build/api.zip
```

With no start file added, `PORT` and `HOSTNAME` aren't set; read the address from `AWS_LAMBDA_HTTP_ENDPOINT`:

```javascript
const [host, port] = (
  process.env.AWS_LAMBDA_HTTP_ENDPOINT ?? 'localhost:3000'
).split(':')
app.listen(Number(port), host)
```

`artifact` can also be an S3 URI such as `s3://my-bucket/builds/api.zip`. The Framework downloads it when you package, which needs `s3:GetObject` on the object, and then handles it like a local zip.

### Native modules

Web apps run on Linux on arm64 (Graviton). Dependencies with native code, such as `sharp` or `bcrypt`, must be installed or built for `linux-arm64`: in an arm64 Linux container or CI runner, or with your package manager's platform options.

### Source maps

Web apps that esbuild builds get mapped stack traces when `build.esbuild.sourcemap` is unset or `true`, or is an object with `setNodeOptions: true`: the cases in which functions get `NODE_OPTIONS=--enable-source-maps`. The start file turns them on instead of `NODE_OPTIONS`, whose value would replace the runtime's default heap settings. They are off with `sourcemap: false`, a `sourcemap` object without `setNodeOptions: true`, an esbuild `configFile` that returns `sourcemap: false`, and web apps esbuild doesn't build.

## Next.js

Next.js runs as a web app from its [standalone output](https://nextjs.org/docs/app/api-reference/config/next-config-js/output), the self-contained server `next build` writes with `output: 'standalone'`. The start file sets the `PORT` and `HOSTNAME` that its `server.js` reads, so the build needs no Lambda-specific code. In `next.config.mjs`:

```javascript
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

`outputFileTracingRoot` and `turbopack.root` keep `server.js` at `.next/standalone/server.js` when a parent directory holds another lockfile. `next build` doesn't copy `.next/static/` and `public/` into the standalone directory, so the build script does, copying `public/` only when the app has one:

```json
{
  "scripts": {
    "build": "next build && cp -r .next/static .next/standalone/.next/ && if [ -d public ]; then cp -r public .next/standalone/; fi"
  }
}
```

Deploy the standalone directory as [prebuilt output](#prebuilt-output) (`entry: .next/standalone/server.js`, `build: false`, the two patterns), then run `npm run build` and `serverless deploy`. The [Next.js example](https://github.com/serverless/examples/tree/v4/aws-node-nextjs-web-app) is a complete app.

## Endpoint and access

Every web app has one HTTPS endpoint, whose URL `serverless deploy` and `serverless info` print. It is public by default, like a function URL with `url: true`: your app decides who may do what. To require AWS credentials, set `url.authorizer: aws_iam`; callers then sign each request with Signature Version 4 for the `lambda` service, including the `X-Amz-Content-SHA256` header, and need `lambda:InvokeWebFunctionEndpoint` on the web app ([signing requests](https://docs.aws.amazon.com/lambda/latest/dg/web-functions-endpoint-access-control.html#web-functions-endpoint-access-control-signing)). `serverless invoke --web-app` signs for you.

```yaml
webApps:
  admin:
    entry: src/admin.ts
    url:
      authorizer: aws_iam
      maxEnvironments: 50
      rateLimit: 2000
```

`url.maxEnvironments` caps the execution environments and `url.rateLimit` the requests per second; requests above them get HTTP 429. Without `maxEnvironments`, an endpoint scales up to the account's vCPU quota for Web Functions, 2,000 vCPUs per Region by default, shared by all endpoints, at 2 vCPUs per environment ([scaling settings](https://docs.aws.amazon.com/lambda/latest/dg/web-functions-scaling.html#web-functions-scaling-settings)). Behind a [custom domain](#custom-domains), the endpoint accepts only signed requests.

## Custom domains

A web app serves your own hostname through an entry with `webApp` in `provider.domain` or `provider.domains`, the keys that configure [custom domains](./domains.md) for API Gateway:

```yaml
provider:
  name: aws
  domains:
    - name: shop.example.com
      webApp: web # every path no other entry matches
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

For each hostname, the Framework creates an Amazon CloudFront distribution in front of the web apps, and uses an ACM certificate from us-east-1 (CloudFront's certificate Region, whatever Region the service deploys to): an existing one that covers the hostname, such as `*.example.com`, or, when the hostname's zone is in Route 53, one it requests and validates through DNS. It then points A and AAAA alias records in that zone at the distribution. Hostnames are case-insensitive, and the Framework uses the lowercase form.

The first deploy with a new hostname takes several minutes, mostly waiting for the certificate and the distribution. `serverless remove` deletes the distribution and the alias records; the certificate and its validation record stay, as for API Gateway domains, for a later deploy to reuse. Each web app on a domain adds a CloudFront origin access control, of which an account has 100 by default ([CloudFront quotas](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/cloudfront-limits.html#limits-web-distributions)).

### Routing by `basePath`

Entries for one hostname route by path to web apps of the same service:

- The entry without `basePath` receives every path no other entry matches; each hostname needs exactly one.
- `basePath: api` receives `/api` and every path under `/api/`. The longest matching `basePath` wins: with `api` and `api/v2`, `/api/v2/orders` reaches the `api/v2` web app.
- The path reaches the web app unchanged, so a request for `/api/users` arrives as `/api/users` and the app defines its routes under `/api`. API Gateway entries strip the base path instead.
- A hostname serves either web apps or API Gateway APIs. A hostname that already exists as an API Gateway custom domain in the account stops the deploy before anything changes.

### What the web app sees behind CloudFront

- Every request reaches the web app: responses aren't cached, all methods are allowed, and headers (other than `Host`), cookies and query strings are forwarded, `Authorization` included. HTTP redirects to HTTPS.
- `Host` is the web app's endpoint domain. The public hostname arrives in `X-Forwarded-Host`, which viewers can't override; build absolute URLs and redirects from it, with a configured base URL for requests that reach the endpoint directly, such as `serverless invoke --web-app`.
- CloudFront signs the requests it forwards, and unsigned requests to the endpoint get HTTP 403. IAM identities in your account allowed to invoke the web app can still call the endpoint directly.
- A web app behind a domain can't set `url.authorizer`; authenticate users in your app.

### Response time limit behind CloudFront

CloudFront waits a limited time for a response to start, and between parts of a streamed response ([response timeout](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/DownloadDistValuesOrigin.html#DownloadDistValuesOriginResponseTimeout)). The Framework sets that wait to the web app's `timeout` plus 5 seconds, so the web app's own timeout answers first, up to CloudFront's maximum of 120 seconds:

- When CloudFront stops waiting, it returns its own `504`, without the `lambda-web-*` headers of a web app's own timeout.
- For `GET` and `HEAD`, CloudFront tries up to 3 times before that `504` ([connection attempts](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/DownloadDistValuesOrigin.html#origin-connection-attempts)); each attempt runs to completion and is billed. Other methods aren't retried.
- A web app with a `timeout` above 115 seconds behind a domain gets a warning at `serverless package` and `serverless deploy`: longer requests work only on its own endpoint.

### Certificate and DNS settings

Set `certificateArn`, `certificateName`, `createRoute53Record`, `createRoute53IPv6Record`, `hostedZoneId`, `hostedZonePrivate`, `splitHorizonDns`, `route53Profile`, `route53Region` and `route53Params` on the hostname's entry without `basePath`; they apply to the whole hostname, and a different value on an entry with `basePath` stops the deploy. Entries with `webApp` take those keys plus `name`, `basePath`, `webApp` and `enabled`; API Gateway keys such as `apiType`, `endpointType`, `securityPolicy` and `autoDomain` aren't accepted on them.

For DNS outside Route 53, set `createRoute53Record: false` and create or import an ACM certificate in us-east-1 that covers the hostname; the deploy finds it by hostname, or takes it from `certificateArn`:

```yaml
provider:
  domains:
    - name: shop.example.com
      webApp: web
      createRoute53Record: false
      certificateArn: arn:aws:acm:us-east-1:123456789012:certificate/12345678-1234-1234-1234-123456789012
```

After the deploy, create a CNAME record for the hostname that points to the distribution's domain name. `serverless info --verbose` prints it as the output `<Hostname>CloudFrontDistributionDomainName`, where `<Hostname>` is the lowercase hostname with `.` written as `Dot` and `-` as `Dash`, starting with a capital: `shop.example.com` gives `ShopDotexampleDotcomCloudFrontDistributionDomainName`. In a Route 53 zone, `createRoute53Record: false` only skips the alias records.

## Provider settings web apps inherit

Web apps take these `provider` settings as functions do, and a value on the web app wins:

- `environment`, `tags` (and `stackTags`), `iam`, `vpc`, `kmsKeyArn`, `logRetentionInDays` and `logDataProtectionPolicy`.
- `logs.lambda.applicationLogLevel` and `systemLogLevel`, whatever `logs.lambda.logFormat` says, because web apps always log JSON.
- `timeout`, when you set it. A service with `provider.timeout: 6` gives its web apps 6 seconds too, so set `timeout` on a web app that needs longer; a `provider.timeout` outside 3 to 900 stops the deploy unless the web app sets its own.
- `runtime`, when it is `nodejs24.x` or newer; any other `provider.runtime` stays with the functions, and web apps run on `nodejs24.x`. A `provider.runtime` newer than Lambda Web Functions run needs `runtime: nodejs24.x` on the web app.

Web apps don't take `memorySize` or `architecture`, nor the function-only `provider.logs.lambda.logFormat`, `logGroup` and `logGroupClass`, `provider.tracing.lambda`, `provider.layers`, `provider.runtimeManagement`, `provider.versionFunctions`, or the alarms and dashboards from [`custom.alerts`](./alerts.md).

### VPC

A web app reaches resources in your VPC through a network connector the Framework creates; requests still arrive through the endpoint.

```yaml
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

- Web apps without their own `vpc` use `provider.vpc` and share one connector, dual-stack with `provider.vpc.ipv6AllowedForDualStack: true`. A web app with its own `vpc` gets its own connector. A web app can't opt out of an inherited `provider.vpc` except by setting its own.
- Creating a connector takes about 4 minutes, once. Right after that deploy, connections into the VPC can time out for up to about a minute.
- Use subnets in at least two Availability Zones, with a route to a NAT gateway for the internet and for AWS services you don't reach through VPC endpoints ([VPC networking](https://docs.aws.amazon.com/lambda/latest/dg/web-functions-networking.html#web-functions-networking-vpc)).

### Environment variables

A web app's environment is `provider.environment` merged with its own `environment`; values are strings or CloudFormation references (`!Ref`, `!GetAtt`, `!ImportValue`, `!Sub`). Names Lambda sets, such as `AWS_REGION` and `AWS_LAMBDA_HTTP_ENDPOINT`, can't be set, nor can the Framework's `PORT`, `HOSTNAME` and `AWS_LAMBDA_NODEJS_ENTRYPOINT`. When `provider.environment` sets one of the Framework's three, the web app gets the Framework's value, except `PORT` and `HOSTNAME` in a [prebuilt zip](#prebuilt-zip). Each value can be up to 4,096 characters and all together up to 32 KB; the Framework checks literal values when you package.

### IAM

Web apps use the service's execution role, so `provider.iam.role.statements` grant permissions to functions and web apps alike, and the role can write to the web apps' log groups. With `provider.iam.role.mode: perFunction`, each web app gets a role of its own, as each function does.

A web app that needs permissions the rest of the service doesn't sets `iam.role`, as a function does ([Per-Function IAM Roles](./iam.md#per-function-iam-roles)):

```yaml
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

- With `iam.role.statements` or `managedPolicies`, the web app gets a role named `<service>-<stage>-<name>-<region>-lambdaRole` (or `iam.role.name`), with write access to its log groups, decrypt access to its `kmsKeyArn`, and what you list. `iam.role` also takes `path`, `permissionsBoundary` and `tags`.
- `provider.iam.role.statements` are added with `iam.inheritStatements: true`, and in `perFunction` mode unless `iam.inheritStatements: false`.
- `role` uses an existing role: an ARN, a role name or a CloudFormation reference. It must trust `lambda.amazonaws.com` and allow writing to the web app's two log groups ([execution role](https://docs.aws.amazon.com/lambda/latest/dg/web-functions-permissions.html#web-functions-permissions-execution-role-create)). `role` can't be combined with `iam.role.statements` or `managedPolicies`, and when `provider.iam.role` names an existing role, a web app's `iam` doesn't apply.
- The function-level keys `iamRoleStatements`, `iamRoleStatementsInherit`, `iamRoleStatementsName` and `iamPermissionsBoundary` aren't accepted on web apps; the error names the `iam` key to use. With the `serverless-iam-roles-per-function` plugin loaded, a web app's `iam` stops the command with `webApps.<name>.iam is not applied while the serverless-iam-roles-per-function plugin is loaded`; remove the plugin, since the Framework gives functions and web apps roles of their own without it.

## Deploying

`serverless deploy` uploads each web app's zip to the [deployment bucket](../../../guides/deployment-bucket.md) under a name derived from its content, only when that content is new, so an unchanged service gets `No changes to deploy`. Services without functions skip an unchanged deploy the same way, unless the last deploy failed or rolled back. These uploads sit outside the per-deploy directories: cleanup of old deployments and `serverless prune` leave them, and `serverless remove` deletes them.

Lambda reads web app code straight from the deployment bucket, which therefore must be versioned and readable by Lambda, as for [`codeStorageMode: reference`](../../../guides/deployment-bucket.md#code-storage-mode-self-managed-lambda-code-storage). The Framework-managed bucket meets that. A bucket named in `provider.deploymentBucket.name` is checked and never modified: the deploy stops when it isn't versioned or has no bucket policy (the message includes the statement to add), and warns when the policy doesn't appear to grant Lambda read access. A deployment bucket in the service's own stack (services first deployed before v4, or `provider.enableLegacyDeploymentBucket`) needs `provider.deploymentBucket.versioning: true`.

Each deploy that changes a web app's code or configuration creates a new revision, and the endpoint moves all traffic to it once it is ready. `serverless rollback --timestamp <timestamp>` restores an earlier deployment with its web app code. `serverless deploy function` deploys functions only; given a web app, it prints `"<name>" is a web app. Deploy it with serverless deploy.`

### Permissions

The identity that runs `serverless deploy` needs these permissions for web apps, beyond what every deploy needs:

- `lambda:CreateWebFunction`, `lambda:GetWebFunction`, `lambda:DeleteWebFunction`, `lambda:ListWebFunctions`, `lambda:CreateWebFunctionRevision`, `lambda:GetWebFunctionRevision`, `lambda:DeleteWebFunctionRevision`, `lambda:ListWebFunctionRevisions`, `lambda:CreateWebFunctionEndpoint`, `lambda:GetWebFunctionEndpoint`, `lambda:UpdateWebFunctionEndpoint`, `lambda:DeleteWebFunctionEndpoint`, `lambda:ListWebFunctionEndpoints`, `lambda:TagResource`, `lambda:UntagResource` and `lambda:ListTags`.
- `iam:PassRole` for the web apps' execution roles.
- On the deployment bucket's objects, `s3:GetObject`, `s3:GetObjectVersion` and `s3:PutObject`. `s3:ListBucket` is optional: without it, the check for an existing zip gets access denied instead of not found, and the deploy uploads the zip either way.
- On the deployment bucket, `s3:GetBucketPolicy` and `s3:PutBucketPolicy` for the Framework-managed bucket, or `s3:GetBucketVersioning` for one you name. With `s3:GetBucketPolicy`, the deploy also checks that the policy lets Lambda read your code.
- With a `package.artifact` S3 URI, `s3:GetObject` on it (and `s3:ListBucket` to get not found rather than access denied for a missing object).
- With `kmsKeyArn`, `kms:CreateGrant`, `kms:Decrypt`, `kms:DescribeKey` and `kms:GenerateDataKey`.
- With a `vpc`, own or inherited, `lambda:CreateNetworkConnector`, `lambda:GetNetworkConnector`, `lambda:UpdateNetworkConnector`, `lambda:DeleteNetworkConnector`, `lambda:ListNetworkConnectors`, `lambda:PassNetworkConnector`, `ec2:DescribeSubnets`, `ec2:DescribeSecurityGroups` and `iam:CreateServiceLinkedRole`.
- With a [custom domain](#custom-domains): the CloudFront distribution and origin access control actions CloudFormation needs (`cloudfront:CreateDistribution`, `GetDistribution`, `UpdateDistribution`, `DeleteDistribution`, `TagResource`, `CreateOriginAccessControl`, `GetOriginAccessControl`, `UpdateOriginAccessControl`, `DeleteOriginAccessControl`); `lambda:PutResourcePolicy`, `lambda:GetResourcePolicy` and `lambda:DeleteResourcePolicy`; `acm:ListCertificates`, `acm:DescribeCertificate` and `acm:RequestCertificate` in us-east-1; `route53:ListHostedZones` and `route53:ChangeResourceRecordSets`; and `apigateway:GET`.

Before it deploys, `serverless deploy` (and `serverless rollback --timestamp`) restores web apps a [Dev Mode](./dev-mode.md#stopping-and-restoring-web-apps) session left on its own revisions. Without `lambda:ListWebFunctionEndpoints` and `lambda:GetWebFunctionRevision`, it skips that check, with the warning `Dev Mode check of web apps skipped: …` where a session ran.

`serverless remove` also needs `cloudformation:DescribeStackResource` on the stack and `logs:DeleteLogGroup` on each web app's two log groups. After deleting the stack, it deletes those log groups again, because Lambda can recreate one, without retention, from late log lines; a log group the stack doesn't hold is left alone. Without either permission, `remove` completes with a warning per log group.

## Invoking a web app

`serverless invoke --web-app` sends one HTTP request to the web app's endpoint and prints the response. Requests to an `aws_iam` web app, or one behind a custom domain, are signed with your AWS credentials:

```bash
serverless invoke --web-app api --path /health
```

```text
HTTP 200 OK
content-length: 11
content-type: application/json; charset=utf-8
lambda-web-request-id: DFWK6UW3VJPQRADPSKLN2OULWA
x-powered-by: Express

{"ok":true}
```

| Flag                     | Default      | Description                                                             |
| ------------------------ | ------------ | ----------------------------------------------------------------------- |
| `--web-app <name>`       | **required** | The web app's name under `webApps`.                                     |
| `--path <path>`          | `/`          | Request path, with a query string if needed.                            |
| `--method <method>`      | `GET`        | HTTP method.                                                            |
| `--header 'Name: value'` | none         | A request header; repeat the flag for more headers.                     |
| `--data '<body>'`        | none         | Request body; not sent with `GET` or `HEAD`, so set `--method` with it. |
| `--log`                  | off          | Print the request's log lines after the response.                       |

```bash
serverless invoke --web-app api --path /orders --method POST --header 'Content-Type: application/json' --data '{"sku":"A-1"}'
```

- The status line and headers go to standard error and the body to standard output as it arrives, so piping to `jq` or a file passes the body alone. A redirect is printed, not followed.
- A status of 400 or above prints the response, then exits with code 1 and `✖ Web app "api" returned HTTP 404.`, so the command works as a CI health check.
- Without a `Content-Type` header, `--data` is sent as `text/plain`, which JSON body parsers such as `express.json()` skip.
- `--header` takes one printable-ASCII `Name: value` line. The Framework sets `Host` on every request, and `Authorization`, `X-Amz-Date`, `X-Amz-Security-Token` and `X-Amz-Content-Sha256` on a signed one, so `--header` can't set those: `✖ --header cannot set Authorization: the Framework sets it to sign the request.`
- Options for functions, agents or sandboxes, such as `--qualifier`, `--raw` or `--port`, stop the command: `✖ --qualifier is not available with --web-app.`
- `--log` waits for the request's log lines, usually about 10 seconds, and prints the `console.*` lines written while handling it. Lines from startup code, timers or `process.stdout.write` carry no request ID and appear only in `serverless logs --web-app`. After 30 seconds without lines, the command succeeds and prints `No log lines for this request arrived within 30 seconds.`

The caller needs `cloudformation:DescribeStacks` on the stack, `lambda:InvokeWebFunctionEndpoint` for a signed request, and for `--log`, `logs:FilterLogEvents` on the `.local` log group (see [Logs](#logs)).

## Logs

Lambda writes your server's standard output and standard error to CloudWatch Logs with its own system lines; `console.*` output is JSON with the request ID. Each web app has two log groups, created by the deploy with the web app's retention and deleted by `serverless remove` ([log groups](https://docs.aws.amazon.com/lambda/latest/dg/web-functions-logging.html#web-functions-logging-log-groups)):

- `/aws/lambda/web/<function-name>.local`, where lines arrive first, within seconds.
- `/aws/lambda/web/<function-name>`, which collects them a little later.

`<function-name>` is `<service>-<stage>-<name>` unless the web app sets `name`.

```bash
serverless logs --web-app api --tail
serverless logs --web-app api --startTime 1h --filter ERROR
```

```text
{"timestamp":"2026-10-15T08:03:43.526Z","level":"INFO","message":"listening on 0.0.0.0:3000","region":"us-east-1"}
{"timestamp":"2026-10-15T08:12:09.756Z","level":"INFO","message":"GET / served v1","requestId":"OJAKUSPFGG6SUUVAQAPSSH5IX4","endpointName":"main","region":"us-east-1"}
```

`serverless logs --web-app` reads the `.local` log group with the options of `serverless logs --function`: `--startTime`, `--filter`, `--tail` and `--interval`. Before the web app has logged anything, it stops with `No logs yet for web app "api". Send it a request, then run this command again.` The caller needs `logs:DescribeLogStreams` and `logs:FilterLogEvents` on `arn:aws:logs:<region>:<account-id>:log-group:/aws/lambda/web/<function-name>.local:*`; a grant on the other log group doesn't cover it.

`logs.applicationLogLevel` filters what your code writes with `console.*` (`trace`, `debug`, `info`, `warn`, `error`, `fatal`), and `logs.systemLogLevel` sets which of Lambda's lines are written (`debug`, `info`, `warn`), case-insensitive. A level the web app doesn't set comes from `provider.logs.lambda`; without either, it is `info` ([log levels](https://docs.aws.amazon.com/lambda/latest/dg/web-functions-logging.html#web-functions-logging-format-levels)):

```yaml
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

`logDataProtectionPolicy` masks sensitive data, such as email addresses, in both log groups; a web app without one takes `provider.logDataProtectionPolicy`, as for functions ([Log Group Resources](./functions.md#log-group-resources); policy format in [data protection](https://docs.aws.amazon.com/AmazonCloudWatch/latest/logs/mask-sensitive-log-data-start.html)). The Framework's commands print the masked lines; the original text needs `logs:Unmask`, in the CloudWatch console or API.

## Local development

`serverless dev` runs your web apps on your machine against the deployed stage, with no redeploy. Each web app's server gets the deployed environment and the execution role's credentials, requests to its real URL (and a custom domain in front of it) reach that server, and a local URL on `localhost` serves it with your framework's hot reload. Stopping the session puts the deployed code back.

```bash
serverless dev --stage alice
```

A web app whose `entry` is a source file runs from source and restarts on save. One whose `entry` is a build output names its local command in `dev.command`:

```yaml
webApps:
  site:
    entry: .next/standalone/server.js
    dev:
      command: next dev --hostname 127.0.0.1
```

`--local-only <web app>` keeps a web app's real URL on the deployed code. Its server gets the execution role's credentials only when your own AWS credentials may call `lambda:InvokeWebFunctionEndpoint` on the web app's Dev Mode endpoint `sls-dev-local`; without that permission, the server runs without role credentials, so its AWS SDK calls have none, and the web app's row carries the note `no_role_credentials` (see [`--local-only` in the Dev Mode guide](./dev-mode.md#--local-only)). The request path, permissions, limits and costs are in [Web Apps in the Dev Mode guide](./dev-mode.md#web-apps), and the options in the [`serverless dev` reference](../cli-reference/dev.md). The agents and sandboxes modes of `serverless dev` leave web apps out and say so. You can also run the server as any Node.js server (`node src/server.js`, `npx tsx watch src/server.ts`, `next dev`), with your own credentials and environment and the fallback port in your code.

`serverless agent inspect --web-apps` describes the deployed web functions, revisions and endpoints as JSON for AI coding agents ([agent inspect](../cli-reference/agent-inspect.md)).

## Configuration reference

Web apps are defined under the top-level `webApps` key. Each key is a web app's name: letters, digits, `-` and `_`, ending in a letter or digit. A name can't also be under `functions`, and a web app's Lambda name (its `name`, or the default) can't match a function's, because both deploy as Lambda functions. Only `entry` is required.

| Key                                                                                     | Type                 | Default                                                          | Description                                                                                                                                                                                                                  |
| --------------------------------------------------------------------------------------- | -------------------- | ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `entry`                                                                                 | string               | **required**                                                     | The file that starts your server, relative to the service directory, or its path inside `package.artifact`. No absolute paths or `..` segments.                                                                              |
| `runtime`                                                                               | string               | `provider.runtime` when `nodejs24.x` or newer, else `nodejs24.x` | `nodejsNN.x`, Node.js 24 or newer. A version Lambda doesn't run yet fails at deploy with Lambda's error.                                                                                                                     |
| `name`                                                                                  | string               | `<service>-<stage>-<name>`                                       | The web function's name: letters, digits, `-` and `_`, up to 64 characters. A longer default is shortened and ends in a hash.                                                                                                |
| `description`                                                                           | string               | none                                                             | Up to 256 characters.                                                                                                                                                                                                        |
| `timeout`                                                                               | integer              | `provider.timeout` when set, else 30                             | Seconds a request may run, 3 to 900. See [Response time limit behind CloudFront](#response-time-limit-behind-cloudfront).                                                                                                    |
| `maxConcurrency`                                                                        | integer              | Lambda's, 64                                                     | Most requests one environment serves at once, 1 to 128; Lambda adjusts the actual number below it.                                                                                                                           |
| `environment`                                                                           | map                  | `provider.environment`                                           | Merged over `provider.environment`; strings or CloudFormation references. See [Environment variables](#environment-variables).                                                                                               |
| `logs.applicationLogLevel`                                                              | string               | `provider.logs.lambda`, else `info`                              | `trace`, `debug`, `info`, `warn`, `error` or `fatal`.                                                                                                                                                                        |
| `logs.systemLogLevel`                                                                   | string               | `provider.logs.lambda`, else `info`                              | `debug`, `info` or `warn`.                                                                                                                                                                                                   |
| `logRetentionInDays`                                                                    | number               | `provider.logRetentionInDays`                                    | Retention for both log groups.                                                                                                                                                                                               |
| `logDataProtectionPolicy`                                                               | map                  | `provider.logDataProtectionPolicy`                               | A CloudWatch Logs data protection policy for both log groups.                                                                                                                                                                |
| `role`                                                                                  | string or reference  | the service's execution role                                     | An existing role: ARN, name or CloudFormation reference. See [IAM](#iam).                                                                                                                                                    |
| `iam.inheritStatements`                                                                 | boolean              | `false` (`true` in `perFunction` mode)                           | Add `provider.iam.role.statements` to the web app's own role.                                                                                                                                                                |
| `iam.role.statements`, `managedPolicies`, `name`, `path`, `permissionsBoundary`, `tags` |                      | none                                                             | The web app's own role. See [IAM](#iam).                                                                                                                                                                                     |
| `vpc`                                                                                   | map                  | `provider.vpc`                                                   | `subnetIds` and `securityGroupIds` for outbound access to your VPC. See [VPC](#vpc).                                                                                                                                         |
| `kmsKeyArn`                                                                             | string               | `provider.kmsKeyArn`                                             | KMS key that encrypts the environment variables.                                                                                                                                                                             |
| `tags`                                                                                  | map                  | `provider.tags`                                                  | Merged over `provider.tags`; values can be CloudFormation references.                                                                                                                                                        |
| `build`                                                                                 | `false` or string    | esbuild for a TypeScript `entry`                                 | `false` skips esbuild; `esbuild` bundles any `entry`. See [Packaging](#packaging).                                                                                                                                           |
| `package.patterns`                                                                      | list of globs        | none                                                             | Applied after the service-level `package.patterns`.                                                                                                                                                                          |
| `package.artifact`                                                                      | string               | none                                                             | A local zip or `s3://` URI to deploy as it is. See [Prebuilt zip](#prebuilt-zip).                                                                                                                                            |
| `dev.command`                                                                           | string               | none: `entry` runs from source                                   | The command that runs the server in [`serverless dev`](./dev-mode.md#web-apps), such as `next dev --hostname 127.0.0.1` or `vite --port $PORT`, run in your shell from the service directory with `PORT` and `HOSTNAME` set. |
| `url`                                                                                   | `true` or map        | `true`                                                           | The endpoint; `false` isn't accepted, since every web app has one.                                                                                                                                                           |
| `url.authorizer`                                                                        | string               | none (public)                                                    | `aws_iam` requires signed requests. Not with a custom domain.                                                                                                                                                                |
| `url.maxEnvironments`                                                                   | integer or reference | none                                                             | Most execution environments, 2 to 10000.                                                                                                                                                                                     |
| `url.rateLimit`                                                                         | integer or reference | none                                                             | Requests per second: `0`, 100 to 1,000 in steps of 100, or 2,000 to 10,000 in steps of 1,000. `0` blocks all traffic with HTTP 503 and `lambda-web-error-type: Platform.EndpointDisabled`.                                   |

The [`serverless.yml` reference](./serverless.yml.md#web-apps-lambda-web-functions) lists the same keys in one block.

## Limits and behavior

- **Resources**: per web app, an `AWS::Lambda::WebFunction` (`<Name>WebFunction`), its revision and endpoint (`<Name>WebFunctionRevision`, `<Name>WebFunctionEndpoint`), two log groups, and the stack output `<Name>WebFunctionUrl`. A `vpc` adds a network connector and its operator role, and a custom domain a CloudFront distribution, an origin access control per web app, alias records and, when requested, an ACM certificate.
- **Size**: each environment has 2 GB of memory and 2 vCPUs, on arm64.
- **Scale**: up to the account's vCPU quota, 2,000 vCPUs per Region by default, shared by all endpoints; up to 128 concurrent requests per environment.
- **Cost**: requests, the CPU time your code uses, and the memory each environment consumes while it runs ([AWS Lambda pricing](https://aws.amazon.com/lambda/pricing/)); environments that serve many waiting requests share that cost. The Framework adds two log groups and S3 storage for each distinct build. A custom domain adds CloudFront charges beyond its free tier ([CloudFront pricing](https://aws.amazon.com/cloudfront/pricing/)).
- **Not for** event processing, runtimes other than Node.js, or WebSocket servers.

## Troubleshooting web apps

### Requests return `502` after a successful deploy

`serverless deploy` finishes when the new revision is in place; it doesn't send a request. A server that throws while starting deploys successfully, and every request then gets HTTP `502` with `lambda-web-error-type: Application.InitCodeError` (or `Runtime.ExitError` for a CommonJS entry with an `--import` or `--loader` preload in `NODE_OPTIONS`). Check the app and read its logs:

```bash
serverless invoke --web-app api --path /health
serverless logs --web-app api --startTime 10m
```

The `lambda-web-error-type` header names platform errors such as initialization failures, timeouts and throttling ([error types](https://docs.aws.amazon.com/lambda/latest/dg/web-functions-troubleshooting.html#web-functions-troubleshooting-error-types)); a response without it came from your app. To go back to the last working version, run `serverless deploy list` and `serverless rollback --timestamp <timestamp>`.

### `nothing was listening on 0.0.0.0:3000 within 9000ms`

Every request gets HTTP `502` with `lambda-web-error-type: Application.TimeoutListenError`, and the logs show this line. Causes:

- The server starts only behind `import.meta.main`, which is `false` because Lambda loads the entry as a module. Start the server unconditionally; `require.main === module` and `process.argv[1]` checks work, except in a prebuilt zip.
- The server listens on `127.0.0.1` or `localhost`. Listen on `process.env.HOSTNAME` (in a prebuilt zip, the host from `AWS_LAMBDA_HTTP_ENDPOINT`), or leave the host out.
- Startup work before `listen` takes longer than about 9 seconds. Do it lazily, or after `listen`.

### `webApps.<name>.entry "..." is not in ...`

```text
webApps.api.entry "dist/index.js" is not in build/api.zip. Set entry to the path of your server's start file inside the zip.
```

With `package.artifact`, `entry` is a path inside the zip. Set it to the start file's path there.

### `webApps.<name> and functions.<name> use the same name...`

A web app and a function have the same key, so both would deploy as the same Lambda function and logical IDs. Rename one of them. A related message, `webApps.<name> and functions.<key> use the same Lambda function name`, means a `name` setting collides; change that `name`.

### `Limit exceeded for resource of type 'AWS::CloudFront::OriginAccessControl'`

The deploy would exceed the account's origin access control quota (100 by default), one per web app on a domain. Request a higher quota through AWS Support ([CloudFront quotas](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/cloudfront-limits.html#limits-web-distributions)).

## Examples

- [Express web app](https://github.com/serverless/examples/tree/v4/aws-node-express-web-app): an Express API with a public endpoint.
- [Next.js web app](https://github.com/serverless/examples/tree/v4/aws-node-nextjs-web-app): a Next.js app deployed from its standalone output.
- [Web apps on a custom domain](https://github.com/serverless/examples/tree/v4/aws-node-web-app-custom-domain): a Next.js frontend and an Express API sharing one domain by `basePath`.

## Related

- [Custom domains](./domains.md): the `provider.domains` keys.
- [Dev Mode](./dev-mode.md#web-apps): run web apps on your machine.
- [`serverless invoke`](../cli-reference/invoke.md) and [`serverless logs`](../cli-reference/logs.md): the `--web-app` options.
- [Sandboxes](./sandboxes.md): isolated container instances.
