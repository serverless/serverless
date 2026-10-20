# Web apps (AWS Lambda Web Functions)

## Contents

- A minimal web app
- Rules
- Next.js
- Custom domains
- Verify and debug

The full guide ships with the CLI: `serverless agent docs providers/aws/guide/web-apps`.

## A minimal web app

A web app is a plain HTTP server under the top-level `webApps` block. Each
one gets its own HTTPS endpoint; `serverless deploy` and `serverless info`
print its URL under `endpoints`.

```yaml
service: shop-api
frameworkVersion: '4'

provider:
  name: aws
  region: us-east-1

webApps:
  api:
    entry: src/server.ts # the file that starts the server; TypeScript is bundled with esbuild
```

```ts
import express from 'express'

const app = express()
app.get('/health', (req, res) => res.json({ ok: true }))
app.listen(process.env.PORT ?? 3000) // the Framework sets PORT and HOSTNAME on Lambda
```

## Rules

- `entry` is a file path (`src/server.ts`), never `file.export`. The server
  listens on `process.env.PORT`; the code needs nothing Lambda-specific.
  Listen on `process.env.HOSTNAME` or leave the host out: a server bound to
  `127.0.0.1` or `localhost`, or one that starts only behind
  `import.meta.main`, never receives requests, and every request returns `502`
  with `lambda-web-error-type: Application.TimeoutListenError`.
- Web apps take no `events`, `handler`, `memorySize` or `architecture`: they
  run on Node.js 24 or newer, arm64, 2 GB. Leave `runtime` unset: it
  defaults to `provider.runtime` when that is `nodejs24.x` or newer, else
  `nodejs24.x`. Set `webApps.<name>.runtime: nodejs24.x` only when
  `provider.runtime` is newer than the versions Web Functions support
  (currently `nodejs24.x`).
  Queue consumers, schedules and other event handlers go under `functions` in
  the same service.
- A key can't be used under both `functions` and `webApps`.
- `PORT`, `HOSTNAME`, `AWS_LAMBDA_NODEJS_ENTRYPOINT` and the variables Lambda
  sets (`AWS_REGION` and the like) can't be set in a web app's `environment`.
- Web apps inherit `provider.environment`, `iam`, `vpc`, `tags`, `kmsKeyArn`,
  `logRetentionInDays`, `logDataProtectionPolicy` (both log groups; a web
  app's own `logDataProtectionPolicy` wins), the `provider.logs.lambda` levels
  (`applicationLogLevel`, `systemLogLevel`; a web app's own `logs` wins, and
  they apply without `logFormat: JSON`, since web apps always log JSON) and
  an explicitly set `provider.timeout`. Without
  either timeout they get 30 s. A `provider.timeout: 6` meant for functions
  gives web apps 6 s too, so set `webApps.<name>.timeout` when they need more.
- For permissions only one web app needs, set `webApps.<name>.iam.role.statements`
  (or `managedPolicies`). The web app then gets a role of its own that holds
  only those statements, not `provider.iam.role.statements`: add
  `iam.inheritStatements: true` to keep them, or put the statement in
  `provider.iam.role.statements` when sharing the service role is fine. Moving
  `iamRoleStatements` from a function definition works the same way. `role` can't be
  combined with `iam.role.statements` or `iam.role.managedPolicies`; with
  `role` set, the other `iam` settings don't apply.
- `url` is optional: every web app has a public endpoint. `url.authorizer:
aws_iam` requires SigV4-signed requests. `url: false` is not accepted.
- `package.artifact` deploys a prebuilt zip as it is: `entry` is the start
  file's path inside the zip, and the server reads its listen address from
  `AWS_LAMBDA_HTTP_ENDPOINT`. It can be a local path or an
  `s3://bucket/key` URI, which the Framework downloads when packaging, so the
  credentials you deploy with need `s3:GetObject` on that object.
- Native dependencies must be built for Linux arm64.
- `serverless dev` doesn't run web apps; run the server locally
  (`node src/server.js`, `npx tsx watch src/server.ts`, `next dev`) and test
  against the deployed stage.
- `serverless deploy function` doesn't deploy web apps; use `serverless deploy`.

## Next.js

Deploy the standalone output as it is: `output: 'standalone'` in
`next.config.mjs`, with `outputFileTracingRoot` and `turbopack.root` set to
the project directory, and a build script that copies `public/` and
`.next/static/` into `.next/standalone/`. Run the build before
`serverless deploy`.

```yaml
webApps:
  site:
    entry: .next/standalone/server.js
    build: false # already built; don't bundle it again
    package:
      patterns: ['!**', '.next/standalone/**']
```

A complete app: the `aws-node-nextjs-web-app` example in the
[Serverless Framework examples](https://github.com/serverless/examples).

## Custom domains

A `provider.domain(s)` entry with `webApp: <name>` serves that web app on a
hostname through CloudFront. Entries for the same hostname with `basePath`
route `/<basePath>` and `/<basePath>/*` to other web apps (the longest
matching `basePath` wins), and the path arrives unchanged (`/api/users`
stays `/api/users`), unlike API Gateway entries, which strip it. Each
hostname needs one entry without `basePath`, and certificate and Route 53
settings go on that entry. Hostnames are case-insensitive.

```yaml
provider:
  name: aws
  domains:
    - name: shop.example.com
      webApp: web
    - name: shop.example.com
      basePath: api
      webApp: api
```

When the hostname's DNS isn't in Route 53, set `createRoute53Record: false`
on its entry without `basePath`, and issue or import an ACM certificate for
the hostname in us-east-1 (the deploy finds it by hostname, or set
`certificateArn`). After the deploy, point a CNAME at the
`<Hostname>CloudFrontDistributionDomainName` output of
`serverless info --verbose` (the hostname in lower case with `Dot` for each
dot: `ShopDotexampleDotcomCloudFrontDistributionDomainName` for
`shop.example.com`); `serverless deploy` lists only the hostname.

A hostname can belong to only one CloudFront distribution, so set the domain
for the stage that serves it (for example through `stages.prod.params`) and
test other stages on the web app's own endpoint.

Behind a domain a response must start within the web app's `timeout` + 5 s,
120 s at most. The first deploy with a new hostname takes several minutes;
`serverless remove` leaves the ACM certificate in place for reuse. Read
`serverless agent docs providers/aws/guide/web-apps` ("Custom domains") before
adding one.

## Verify and debug

- A server that throws at startup still deploys; every request then returns
  `502` with `lambda-web-error-type: Application.InitCodeError`. After each
  deploy, send a request: `serverless invoke --web-app api --path /health`.
- `serverless invoke --web-app <name> [--path] [--method] [--header] [--data] [--log]`
  sends one request (signed when the endpoint needs it). The status line and
  headers go to stderr and the body to stdout, so `| jq` gets the body alone.
  Status 400 or above exits 1 after printing the response. `--data` is not
  sent with GET or HEAD, so pair it with `--method POST`, and it goes as
  `text/plain` unless `--header 'Content-Type: application/json'` is set
  (repeat `--header 'Name: value'` for more; `Host`, and on a signed
  endpoint `Authorization` and `X-Amz-*`, are refused). Redirects are
  printed, not followed. `--log` adds the `console.*` lines written while
  handling that request, waiting up to 30 s for them; startup lines appear
  only in `serverless logs`. Function, agent and sandbox flags (`--qualifier`,
  `--type`, `--raw`, `--context`, `--port`, …) stop the command with an
  error rather than being ignored.
- `serverless logs --web-app <name> [--tail] [--startTime 10m]` reads the
  web app's `.local` log group, which the deploy creates. A web app runs, and
  logs, only once a request arrives, so right after the first deploy it stops
  with "No logs yet"; send a request first. Without `--startTime` it shows
  the last 10 minutes.
- `serverless rollback --timestamp <timestamp>` restores the previous
  deployment while you fix the code (`serverless deploy list` lists them).
- `serverless diff` lists web apps whose code changed under `Web App Code`
  (`code.webApps` with `--json`), next to the functions under `Function Code`.
- `serverless agent inspect --web-apps` returns the deployed web function,
  revision and endpoint state as JSON.
