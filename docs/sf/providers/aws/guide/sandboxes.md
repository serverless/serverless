<!--
title: Sandboxes (AWS Lambda MicroVMs)
description: 'Deploy container workloads as AWS Lambda MicroVMs with the sandboxes property: Dockerfile builds, hooks, VPC, IAM, invoke, logs and local dev.'
short_title: Sandboxes
keywords:
  [
    'Serverless Framework',
    'AWS Lambda MicroVMs',
    'Lambda MicroVM sandbox',
    'sandboxes',
    'Dockerfile',
  ]
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/aws/guide/sandboxes)

<!-- DOCS-SITE-LINK:END -->

# Sandboxes (AWS Lambda MicroVMs)

Sandboxes run a container image as [AWS Lambda MicroVMs](https://docs.aws.amazon.com/lambda/latest/dg/lambda-microvms-guide.html): isolated virtual machines, each started from a snapshot of your image, with its own HTTPS endpoint, that suspend when idle and resume with their memory and disk intact. You define them under the top-level `sandboxes` key in `serverless.yml`; `serverless deploy` builds the MicroVM image from your `Dockerfile`, and your code or `serverless invoke --sandbox` launches instances of it.

Use a sandbox instead of a Lambda function when:

- The workload is a container or a long-lived server, not a handler function.
- Each user, session or tenant needs its own isolated instance, such as an AI agent's code-execution environment.
- Startup is expensive, and suspending and resuming an instance beats a cold start.
- The process needs OS capabilities that functions don't grant (`osCapabilities`).

For HTTP servers that share execution environments across requests, see [Web Apps](./web-apps.md); for event-driven handlers, [Functions](./functions.md).

## Quick start

Prerequisites: Serverless Framework v4 and AWS credentials for a Region where Lambda MicroVMs are available. The image builds on AWS, so deploying needs no Docker; [`serverless dev`](#local-development-serverless-dev) needs a Docker daemon.

1. Create `serverless.yml`:

   ```yaml
   # serverless.yml
   service: my-sandbox-service

   provider:
     name: aws
     region: us-east-1

   sandboxes:
     echo:
       artifact: ./app # a directory that contains a Dockerfile
   ```

2. Create `app/Dockerfile`:

   ```dockerfile
   FROM public.ecr.aws/docker/library/node:24-slim
   WORKDIR /app
   COPY server.mjs .
   EXPOSE 8080
   CMD ["node", "server.mjs"]
   ```

3. Create `app/server.mjs`, a server on port 8080, where MicroVM endpoints send requests by default:

   ```javascript
   import http from 'node:http'

   http
     .createServer((req, res) => {
       res.writeHead(200, { 'Content-Type': 'application/json' })
       res.end(JSON.stringify({ ok: true, path: req.url }))
     })
     .listen(8080, '0.0.0.0')
   ```

4. Deploy. The Framework zips `app/`, uploads it to the deployment bucket, and creates the MicroVM image, which Lambda builds from the `Dockerfile`:

   ```bash
   serverless deploy
   ```

   ```text
   ✔ Service deployed to stack my-sandbox-service-dev (98s)

   sandboxes:
     echo: my-sandbox-service-echo-dev
   dashboard: https://us-east-1.console.aws.amazon.com/cloudwatch/home?region=us-east-1#dashboards/dashboard/my-sandbox-service-dev-sandboxes
   ```

5. Launch an instance, send it a request, and terminate it:

   ```bash
   serverless invoke --sandbox echo
   ```

   ```text
   {"ok":true,"path":"/"}
   ```

To delete the image, its roles and log group, terminate any running instances and then run `serverless remove`.

## Package the container

The `artifact` key of a sandbox is a local directory with a `Dockerfile`, or an `s3://` URI of a zip built elsewhere. Lambda builds the image for ARM64 on the `al2023` base image, which the Framework resolves to its latest version when it packages the service. That lookup calls AWS, so `serverless package` needs AWS credentials for a service with sandboxes.

### Local directory

A relative `artifact` path is resolved from the service directory:

```yaml
sandboxes:
  api:
    artifact: ./docker/api
```

The Framework zips the directory's files (see [Choosing the files](#choosing-the-files)) and uploads the zip to the deployment bucket under a content hash:

```text
<deploymentPrefix>/<service>/<stage>/sandboxes/<name>-<sha256>.zip
```

`<deploymentPrefix>` is `provider.deploymentPrefix` (default `serverless`). Deploying again without changing the selected files reuses the key and the image; a change to any selected file builds a new image version. `serverless package` writes the zip to `.serverless/sandboxes/<name>-<sha256>.zip` (under `--package` when given) and lists the uploads in `.serverless/sandboxes-uploads.json`; run `unzip -l` on the zip to see what a sandbox ships.

### Choosing the files

The zip holds every file in the artifact directory except:

- anything named `node_modules`, `.venv`, `venv`, `__pycache__`, `.pytest_cache` or `.mypy_cache`, at any depth, including a plain file with one of these names. Names that only start with them, such as `node_modules.txt`, are kept.
- the [default exclusions](./packaging.md#patterns) of function packaging (`.git`, `.serverless`, the service configuration file, `.env*` with `useDotenv`, and others). They are matched from the service directory, so they reach a sandbox only with `artifact: .`. In a subdirectory such as `./app`, a `.git` directory, an `.env` file or a `.DS_Store` is included unless a pattern excludes it (`'!app/**/.env*'`).

Your `Dockerfile` installs the dependencies (`npm ci`, `pip install`) for the ARM64 image. Dependencies installed on your machine are built for its platform, a `COPY . .` would overwrite the ones the build installed, and they would change the content hash, so every local install would rebuild the image.

To choose files yourself, use `package.patterns`, which work as [function patterns](./packaging.md#patterns): globs relative to the service directory, applied in order, `!` to exclude, later patterns win. Service-level patterns apply first, then the sandbox's own:

```yaml
package:
  patterns:
    - '!**/docs/**' # applies to functions and sandboxes

sandboxes:
  api:
    artifact: ./app
    package:
      patterns:
        - '!app/tests/**' # paths start at the service directory
        - 'app/node_modules/**' # re-include vendored dependencies
```

- The `Dockerfile` at the root of the artifact directory is always included.
- Service-level patterns written for functions apply to sandboxes too: `'!**'` followed by `src/**` leaves a sandbox with only its `Dockerfile`, so re-include its files with the sandbox's own patterns (`'app/**'`).
- `'app/**'` re-includes the default exclusions too, such as `node_modules`, `.venv` and `.env` files. Exclude them again after it: `'!app/**/node_modules/**'`, `'!app/**/.venv/**'`, `'!app/**/.env*'`.
- For a directory outside the service directory (`artifact: ../shared/app`), write the `../` path in the pattern (`'!../shared/app/tests/**'`), since `**` doesn't match paths that start with `../`.
- A `.dockerignore` in the artifact directory still applies when the image is built, on AWS and in `serverless dev`: patterns decide what is uploaded, `.dockerignore` what the build sees.

### Pre-built zip in S3

An `artifact` that starts with `s3://` is used as it is: the Framework uploads nothing, and `package.patterns` don't apply. The generated build role can read the object.

```yaml
sandboxes:
  api:
    artifact: s3://my-bucket/builds/api-v1.2.3.zip
```

Container registry URIs aren't accepted as `artifact`; build the image from a `Dockerfile`, which can start `FROM` a registry image.

## Pass configuration to instances

Every instance starts from one snapshot, taken when the image is built. A value your code creates at build time, in a `ready` or `validate` hook or at startup before the snapshot, is the same in every instance, including UUIDs, random seeds and tokens. Create such values in the `run` hook, or per call from a cryptographically secure generator such as `crypto.randomUUID()` ([MicroVM images](https://docs.aws.amazon.com/lambda/latest/dg/microvms-images.html)).

`environment` sets variables that are baked into the image, so they are identical across its instances and persist across suspend and resume. A sandbox inherits `provider.environment`, and its own keys win; values are strings or CloudFormation references, resolved at deploy:

```yaml
provider:
  environment:
    STAGE: ${sls:stage} # inherited by functions and sandboxes

sandboxes:
  api:
    artifact: ./app
    environment:
      TABLE_NAME: !Ref UsersTable
```

Keep `environment` to static, non-secret settings. Per-instance data, such as a session or tenant ID, travels in the `runHookPayload` of the launch call (up to 16 KB), which Lambda delivers to the `run` hook. Fetch secrets at runtime with the execution role, from Secrets Manager or SSM.

Outbound TCP connections are closed on `run` and `resume`. The AWS SDKs reconnect on their own; configure retries in other HTTP and database clients instead of assuming a connection survives a resume.

## Lifecycle hooks

Hooks call your application at points in the MicroVM lifecycle. Your image runs an HTTP server on the hook port (default 9000) that answers `POST /aws/lambda-microvms/runtime/v1/<hook-name>` with HTTP 200 within the hook's timeout; any other response, or no response in time, fails that step. The exception is HTTP 503 from `ready` or `validate`, which means the app needs more time: Lambda retries the hook until it returns 200 or the timeout expires. Return the 503 at once rather than holding the request open.

| Hook        | When Lambda calls it                                      | AWS default timeout | `timeout` range |
| ----------- | --------------------------------------------------------- | ------------------- | --------------- |
| `ready`     | During the image build, until the app reports it is ready | 60 s                | 1–3600 s        |
| `validate`  | After the image build, on an instance of the new image    | 1 s                 | 1–3600 s        |
| `run`       | When an instance starts; traffic begins after it returns  | 1 s                 | 1–60 s          |
| `resume`    | When an instance resumes from `SUSPENDED`                 | 1 s                 | 1–60 s          |
| `suspend`   | Before an instance suspends                               | 1 s                 | 1–60 s          |
| `terminate` | Before an instance terminates                             | 1 s                 | 1–60 s          |

Each hook is `true`, to use the AWS default timeout, or an object with `timeout` in seconds:

```yaml
sandboxes:
  api:
    artifact: ./app
    hooks:
      port: 9000 # one port for all hooks
      ready:
        timeout: 120
      run: true
      suspend:
        timeout: 5
```

- Enabling any of `run`, `resume`, `suspend` or `terminate` also enables `ready`.
- A hook is a notification: instances run, suspend, resume and terminate whether or not you declare the hook. Declare one only to act on that step, such as flushing state on `suspend`.
- Lambda can retry `suspend` and `terminate`, so make those handlers safe to run twice.
- Lambda moves to the next step when the hook returns 200: a new instance receives traffic only after `run` returns, and an instance suspends after `suspend` returns. Finish the work that step depends on, such as tenant setup in `run` or required writes in `suspend`, before replying, and set a `timeout` that covers it.

This hook server runs your `handleHook` code to completion before it replies:

```javascript
import http from 'node:http'

http
  .createServer((req, res) => {
    const hook = req.url.split('/').pop() // 'ready', 'run', 'suspend', ...
    let body = ''
    req.on('data', (chunk) => (body += chunk))
    req.on('end', async () => {
      try {
        await handleHook(hook, body) // your code; the run body carries runHookPayload
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end('{}')
      } catch (error) {
        console.error(error)
        res.writeHead(500)
        res.end()
      }
    })
  })
  .listen(9000, '0.0.0.0')
```

## Connect a sandbox to your VPC

Instances reach the internet through AWS's `INTERNET_EGRESS` connector. To route their traffic through your VPC instead, set `vpc`; the Framework creates an `AWS::Lambda::NetworkConnector` and its operator role:

```yaml
sandboxes:
  api:
    artifact: ./app
    vpc:
      subnetIds:
        - subnet-0a1b2c3d4e5f60718
        - subnet-0f1e2d3c4b5a69788
      securityGroupIds:
        - sg-0123456789abcdef0
      protocol: ipv4
```

`subnetIds` (1 to 16) and `securityGroupIds` (1 to 5) take the same value shapes as a function's `vpc`: lists of IDs or CloudFormation references, or one expression that yields the list (`!Split`, `!FindInMap`). `protocol` is `ipv4` (default) or `dualstack`. The image build always uses `INTERNET_EGRESS`, whatever `vpc` says. `serverless invoke --sandbox` attaches the connector to the instances it launches; your own launch calls pass the `<Name>ConnectorArn` stack output as an egress connector.

## IAM roles for sandboxes

The Framework creates these roles for each sandbox:

- **Build role** (`<Name>ImageBuildRole`), used by Lambda to build the image: `s3:GetObject` on the deployment bucket and on the bucket of an `s3://` artifact, and `logs:CreateLogGroup`, `logs:CreateLogStream` and `logs:PutLogEvents` on the sandbox's log group.
- **Execution role** (`<Name>ExecutionRole`), assumed by running instances: the same three `logs:*` actions on the log group, and no others, so add the permissions your code needs.
- **Connector operator role** (`<Name>ConnectorOperatorRole`, with `vpc` only), assumed by `network-connectors.lambda.amazonaws.com`: `ec2:CreateNetworkInterface` on network interfaces, subnets and security groups of the deploying account, and `ec2:CreateTags` on network interfaces it manages.

The build and execution roles trust `lambda.amazonaws.com` with an `aws:SourceAccount` condition.

### Add permissions to a generated role

`iam.buildRole`, `iam.executionRole` and `iam.operatorRole` take `statements` (appended to the role's inline policy), `managedPolicies` (managed policy ARNs) and `permissionsBoundary` (a policy ARN):

```yaml
sandboxes:
  api:
    artifact: ./app
    iam:
      executionRole:
        statements:
          - Effect: Allow
            Action: ['dynamodb:GetItem']
            Resource: !GetAtt UsersTable.Arn
      buildRole:
        permissionsBoundary: arn:aws:iam::123456789012:policy/MyBoundary
```

The build role needs more in two setups:

- A deployment bucket encrypted with a customer managed KMS key: add `kms:Decrypt` and `kms:DescribeKey` on the key, or the build can't fetch the artifact (`AccessDenied`).
- A `Dockerfile` that starts `FROM` a private Amazon ECR image: add `ecr:GetAuthorizationToken` on `*`, and `ecr:BatchGetImage` and `ecr:GetDownloadUrlForLayer` on the repository.

Subnets shared into your account through AWS RAM keep their owner's ARN, which the operator role's `ec2:CreateNetworkInterface` grant doesn't cover. Add a statement for exactly those subnets; the operator role's trust policy can't carry an `aws:SourceAccount` condition, so keep its grants to the minimum:

```yaml
sandboxes:
  api:
    artifact: ./app
    vpc:
      subnetIds: [subnet-0123456789abcdef0]
      securityGroupIds: [sg-0123456789abcdef0]
    iam:
      operatorRole:
        statements:
          - Effect: Allow
            Action: ec2:CreateNetworkInterface
            Resource: arn:aws:ec2:us-east-1:111122223333:subnet/subnet-0123456789abcdef0
```

Here `111122223333` is the account that owns the VPC.

### Use an existing role

An ARN string, or a `Ref`, `Fn::GetAtt`, `Fn::ImportValue` or `Fn::Sub`, replaces the generated role, which the Framework then doesn't create:

```yaml
sandboxes:
  api:
    artifact: ./app
    iam:
      buildRole: arn:aws:iam::123456789012:role/MyBuildRole
      executionRole:
        Fn::ImportValue: SharedExecutionRoleArn
```

An existing operator role must trust `network-connectors.lambda.amazonaws.com` without an `aws:SourceAccount` condition, which that service doesn't present. `iam.operatorRole` applies only with `vpc`.

## Invoking a sandbox

`serverless invoke --sandbox` launches a fresh instance of the deployed image, sends it one HTTP request through the AWS proxy, prints the response body and terminates the instance, also when the request fails:

```bash
serverless invoke --sandbox echo --path /health
```

| Flag                     | Default      | Description                                         |
| ------------------------ | ------------ | --------------------------------------------------- |
| `--sandbox <name>`       | **required** | The sandbox's name under `sandboxes`.               |
| `--path <path>`          | `/`          | Request path.                                       |
| `--method <method>`      | `GET`        | HTTP method.                                        |
| `--header 'Name: value'` | none         | A request header; repeat the flag for more headers. |
| `--data '<body>'`        | none         | Request body; not sent with `GET`.                  |
| `--port <port>`          | `8080`       | Container port the request goes to.                 |

```bash
serverless invoke --sandbox echo --path /api/items --method POST --header 'Content-Type: application/json' --data '{"name":"widget"}'
serverless invoke --sandbox echo --path /metrics --port 9090
```

- The command waits up to 5 minutes for the instance to reach `RUNNING`, and stops with the platform's reason when it fails or terminates instead.
- A response status of 400 or above prints the body, then stops the command with `Sandbox 'echo' returned HTTP 500` (with the actual status).
- The instance starts with an idle policy that terminates it about 60 seconds after its last request, so an interrupted invoke leaves nothing running.
- `--header` takes printable ASCII and can't set `Host`, `X-Aws-Proxy-Auth` or `X-Aws-Proxy-Port`, which the Framework sets.
- `--qualifier`, `--raw`, `--session-id`, `--log`, `--json` and the other function options stop the command, for example `✖ --qualifier is not available with --sandbox.`

The caller needs `lambda:RunMicrovm`, `lambda:GetMicrovm`, `lambda:CreateMicrovmAuthToken`, `lambda:TerminateMicrovm`, `iam:PassRole` for the execution role, and `lambda:PassNetworkConnector` for the connectors attached to the instance. It also reads the stack outputs with `cloudformation:DescribeStacks`.

## Logs and monitoring

Each sandbox gets a log group the Framework owns, `/aws/lambda-microvms/<service>-<name>-<stage>`, with build lines and the output of every instance. It is created before the image builds, kept for 14 days by default, and deleted by `serverless remove`. Print it with:

```bash
serverless logs --sandbox echo --startTime 1h
```

`serverless logs --sandbox` prints the last 10 minutes by default; `--startTime` (`30m`, `1h`, `2d` or a date) widens the window and `--filter` applies a CloudWatch Logs filter pattern. It prints once and exits: `--tail` prints a notice instead of following. It reads the default log group name, also when `observability.logs.logGroup` names another one.

Monitoring is on by default. For each sandbox, the Framework adds:

- a metric filter that counts log lines containing `error`, `exception` or `fail` (case-insensitive) into the metric `<service>-<name>-<stage>-errors` in the `ServerlessFramework/Sandboxes` namespace. Like Lambda's `Errors` metric, it has data points only when lines match. It counts what your application logs, so a process that exits silently needs a separate health check.
- a section in one CloudWatch dashboard per service, `<service>-<stage>-sandboxes`: log volume, the filter metrics, instances started, recent logs and errors, and alarm states. `serverless deploy` and `serverless info` print its URL as `dashboard`.

Configure it under `observability`:

```yaml
sandboxes:
  api:
    artifact: ./app
    observability:
      logs:
        retentionDays: 30
      metrics:
        filters:
          errors: '%[Ee][Rr][Rr][Oo][Rr]%'
          timeouts: '%timed out%'
      alarms:
        notify: arn:aws:sns:us-east-1:123456789012:my-alerts
        thresholds:
          errors:
            threshold: 10
            period: 60
```

- `metrics.filters` replaces the default filters: one metric, alarm and dashboard line per key. Include `errors` to keep error counting.
- `alarms` creates one alarm per filter, notifying the SNS topic in `notify` (an ARN or a CloudFormation reference such as `!Ref AlertTopic`). Each alarm defaults to more than 5 matches in one 300-second period, one data point, missing data not breaching.
- `observability: false` drops the metric filters, alarms and dashboard; the log group stays. `dashboard.enabled: false` drops only the dashboard section.
- `logs.enabled: false` turns logging off: no log group, metrics, alarms or dashboard section.
- `logs.logGroup` writes to a log group of another name, which the Framework creates and scopes the roles to.

Metric filters are free; the metrics, alarms and dashboard are billed as CloudWatch custom metrics, alarms and dashboards beyond the free tier ([Amazon CloudWatch pricing](https://aws.amazon.com/cloudwatch/pricing/)).

## Local development (`serverless dev`)

`serverless dev --sandbox` builds the sandbox's image with your local Docker daemon and starts a local, SDK-compatible Lambda MicroVMs API on `http://127.0.0.1:9100`. Each `RunMicrovm` call to it starts a fresh container from the image, so your orchestration code runs unchanged against it:

```bash
serverless dev --sandbox echo
```

```text
Endpoint   http://127.0.0.1:9100   ← point your AWS SDK or CLI here
           e.g.  aws … --endpoint-url http://127.0.0.1:9100

MicroVMs API ready — Ctrl-C to stop
```

- `--sandbox` can be left out when the service has one sandbox; `--mode sandboxes` selects this mode, which is the default for a service with only sandboxes.
- `--port` changes the endpoint port. With the port in use, the command stops; give each concurrent session its own port.
- The image is built from the files a deploy uploads ([Choosing the files](#choosing-the-files)) and your `.dockerignore`, for the Docker daemon's own CPU architecture. A sandbox with an `s3://` artifact can't run in `dev`.
- Saving a file in the artifact directory rebuilds the image, and the next `RunMicrovm` uses it; running containers keep their image. Changes in `.serverless`, `.git`, `coverage`, dependency and cache directories, and test files (`*.test.js`, `*.spec.js`, `*_test.py`, `*.test.py`) don't rebuild. A failed rebuild prints the error and keeps the session running.
- Containers get the same environment as the deployed sandbox. CloudFormation references resolve from the deployed stack: `!Ref` and `!ImportValue`, and `!GetAtt` only for attributes the stack exports as an output named `<LogicalId><Attribute>` (`UsersTableArn` for `!GetAtt UsersTable.Arn`). An unresolved reference is dropped with a warning.

### Execution-role credentials in `dev`

By default, containers run as the sandbox's deployed execution role, so AWS calls get the permissions they have in production:

- The sandbox must be deployed. The command adds your identity to the role's trust policy for the session (a statement tagged `ServerlessSandboxesLocalDevPolicy`) and removes it on Ctrl-C; after a `SIGKILL`, the next session reuses or removes it. This needs `iam:GetRole`, `iam:UpdateAssumeRolePolicy` and `sts:AssumeRole`.
- When the role can't be assumed, the session prints a notice and uses your own credentials. `--no-assume-role` uses them from the start.
- Only the AWS SDK credential chain sees the role's credentials; code that reads the instance metadata service (`169.254.169.254`) doesn't.

### What the local API emulates

- `RunMicrovm`, `GetMicrovm`, `CreateMicrovmAuthToken`, `TerminateMicrovm`, suspend and resume, and the `idlePolicy` of each launch: an idle container is paused, then removed.
- The proxy contract: the endpoint requires the `X-aws-proxy-auth` token (`403` otherwise), routes by `X-aws-proxy-port` (default `8080`), and adds `x-amzn-requestid`.
- The hooks your sandbox enables, with the same timeouts as on AWS.

The local `endpoint` is a full `http://127.0.0.1:<port>` URL, where AWS returns a bare hostname you prefix with `https://`; use the value as returned. The emulator doesn't check signatures, network isolation or quotas, and doesn't reproduce the production proxy's authentication path, so check those on a deployed sandbox. It answers only requests to `127.0.0.1`, `localhost`, `[::1]` or `host.docker.internal`, and refuses requests with an `Origin` header with `403`, so web pages can't drive it. Pass `--endpoint-url` per command, or `endpoint` per client, rather than exporting `AWS_ENDPOINT_URL_LAMBDA_MICROVMS`, which `serverless deploy` would also pick up.

## Run instances from your own code

Applications launch and manage instances with the Lambda MicroVMs API (`@aws-sdk/client-lambda-microvms`, or `aws lambda-microvms`). The stack outputs `<Name>ImageIdentifier` and `<Name>ExecutionRoleArn` give the image and role to launch with. This script launches an instance, calls it, retrying for up to about 20 seconds while the instance starts, and terminates the instance whether or not the call succeeds:

```bash
#!/usr/bin/env bash
set -euo pipefail

RUN=$(aws lambda-microvms run-microvm --image-identifier "$IMAGE_ARN" --execution-role-arn "$ROLE_ARN" \
  --idle-policy '{"autoResumeEnabled":true,"maxIdleDurationSeconds":900,"suspendedDurationSeconds":1800}')
ID=$(echo "$RUN" | jq -r .microvmId); ENDPOINT=$(echo "$RUN" | jq -r .endpoint)
trap 'aws lambda-microvms terminate-microvm --microvm-identifier "$ID"' EXIT
TOKEN=$(aws lambda-microvms create-microvm-auth-token --microvm-identifier "$ID" \
  --allowed-ports '[{"port":8080}]' --expiration-in-minutes 60 \
  --query 'authToken."X-aws-proxy-auth"' --output text)
curl --fail --retry 10 --retry-delay 2 --retry-connrefused \
  -H "X-aws-proxy-auth: $TOKEN" -H "X-aws-proxy-port: 8080" "https://$ENDPOINT/hello"
```

`IMAGE_ARN` and `ROLE_ARN` are the two stack outputs (`serverless info --verbose` prints them). Against `serverless dev`, add `--endpoint-url http://127.0.0.1:9100`, pass any `--image-identifier` (the emulator runs the session's sandbox), and use the returned endpoint without adding `https://`.

- **Readiness**: `get-microvm` state is eventually consistent. Treat a successful authenticated request to the endpoint as the ready signal, and retry a `502` in the first seconds after launch.
- **Connector permissions**: launching attaches network connectors, and the caller needs `lambda:PassNetworkConnector` for each one, such as `arn:aws:lambda:us-east-1:aws:network-connector:aws-network-connector:INTERNET_EGRESS`, plus `iam:PassRole` for the execution role. A missing grant returns an `AccessDeniedException` that names the connector.
- **Shell access**: launch with the `SHELL_INGRESS` connector among the ingress connectors (connectors are fixed at launch), mint a token with `aws lambda-microvms create-microvm-shell-auth-token --microvm-identifier <id> --expiration-in-minutes 15` (at most 60 minutes; needs `lambda:CreateMicrovmShellAuthToken`), and connect from the console's **Connect** button or a WebSocket client with the subprotocols `lambda-microvms`, `lambda-microvms.authentication.<token>` and `lambda-microvms.port.8022`. The shell runs in the application's container.

### Instance lifecycle and idle policy

An instance moves from `RUNNING` to `SUSPENDED` to `TERMINATED`. The launch call's `idlePolicy` sets two timers that run in sequence:

1. After `maxIdleDurationSeconds` (at most 28,800) without inbound requests, a `RUNNING` instance suspends: memory and disk are kept, and only snapshot storage is billed.
2. After `suspendedDurationSeconds` in `SUSPENDED`, it terminates; `0` terminates it on suspend.
3. With `autoResumeEnabled: true`, a request to a suspended instance resumes it; Lambda holds the request during the resume and returns `502` only if the resume fails. A terminated instance never resumes.

An `idlePolicy` needs all three fields, and Lambda fills in no defaults; without `idlePolicy`, instances never suspend or terminate on their own. `maximumDurationInSeconds` (1 to 28,800, `RUNNING` and `SUSPENDED` time together) ends an instance whatever its activity.

Idle means no inbound requests at the endpoint, not idle code: a worker that only polls a queue looks idle while it works. Pick the pattern by whether the instance's state is worth keeping:

- **One-shot work**: do the job and exit the process, which terminates the instance. Leave out `idlePolicy`, so the timer can't suspend the busy instance.
- **Sessions** (agent sessions, notebooks, per-user environments): launch with `autoResumeEnabled: true`, and treat `suspendedDurationSeconds` as how long a user can be away before the state is gone.
- **Orchestrated work**: suspend and resume from outside the instance when your code knows the boundaries, with `aws lambda-microvms suspend-microvm --microvm-identifier <id>` and `resume-microvm` (`lambda:SuspendMicrovm`, `lambda:ResumeMicrovm`). An instance can't suspend itself.

## Image versions and cleanup

Each deploy that changes a sandbox's artifact or settings builds a new image version. Launches without an `imageVersion` use the newest active version; older versions stay for instances that pin one. AWS limits the versions per image (50 by default, the **Versions per MicroVM Image** quota), so trim them with [`prune`](./prune.md#sandbox-image-versions):

```yaml
custom:
  prune:
    automatic: true # after every deploy
    number: 5 # keep the live version and 5 older ones
```

```bash
serverless prune -n 5 --sandbox echo
```

`prune` keeps the live version, versions that an instance runs or can resume from, and versions still building. A deploy that reaches the limit prints the `prune` command to run.

Uploaded zips need no setting: an image reads its zip only while it builds. Each deploy keeps the zips that the deployments `serverless deploy list` shows still point to, so `serverless rollback` works, plus zips uploaded within the last hour, and deletes the rest. The number of deployments kept is `provider.deploymentBucket.maxPreviousDeploymentArtifacts` (default `5`). On a versioned bucket, a delete adds a delete marker until a lifecycle rule expires the old object versions. `s3://` artifacts are never deleted.

## Configuration reference

Sandboxes are defined under the top-level `sandboxes` key, one entry per sandbox name. The name becomes part of resource names (`<service>-<name>-<stage>`) and logical IDs (`<Name>Image`). Only `artifact` is required.

| Key                                                      | Type                | Default                                                                                                                                                     | Description                                                                                                                                                                                   |
| -------------------------------------------------------- | ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `artifact`                                               | string              | **required**                                                                                                                                                | A local directory with a `Dockerfile`, relative to the service directory, or an `s3://` URI of a zip.                                                                                         |
| `package.patterns`                                       | list of globs       | none                                                                                                                                                        | Files of a local `artifact`, relative to the service directory, after the service-level patterns. See [Choosing the files](#choosing-the-files).                                              |
| `minimumMemory`                                          | number              | `2048`                                                                                                                                                      | Memory in MiB each instance is guaranteed: `512`, `1024`, `2048`, `4096` or `8192`. A floor, not a cap; it also sets the build's disk tier.                                                   |
| `description`                                            | string              | `<service> <name> sandbox (Serverless Framework)`                                                                                                           | The image's description.                                                                                                                                                                      |
| `environment`                                            | map                 | `provider.environment`                                                                                                                                      | Variables baked into the image, merged over `provider.environment`. Strings or CloudFormation references. See [Pass configuration to instances](#pass-configuration-to-instances).            |
| `osCapabilities`                                         | list                | `[]`                                                                                                                                                        | Additional OS capabilities; `all` (case-insensitive) is the accepted value.                                                                                                                   |
| `hooks`                                                  | map                 | none                                                                                                                                                        | `port` (1–65535, default `9000`) and `ready`, `validate`, `run`, `resume`, `suspend`, `terminate`, each `true` or `{ timeout: <seconds> }`. See [Lifecycle hooks](#lifecycle-hooks).          |
| `vpc`                                                    | map                 | none                                                                                                                                                        | `subnetIds` and `securityGroupIds` (both required), and `protocol`: `ipv4` (default) or `dualstack`. See [Connect a sandbox to your VPC](#connect-a-sandbox-to-your-vpc).                     |
| `iam.buildRole`, `iam.executionRole`, `iam.operatorRole` | map or ARN          | generated roles                                                                                                                                             | `statements`, `managedPolicies` and `permissionsBoundary` to extend a generated role, or an ARN or intrinsic to use an existing one. See [IAM roles for sandboxes](#iam-roles-for-sandboxes). |
| `observability`                                          | boolean or map      | `true`                                                                                                                                                      | `false` turns off metrics, alarms and the dashboard section. See [Logs and monitoring](#logs-and-monitoring).                                                                                 |
| `observability.logs.enabled`                             | boolean             | `true`                                                                                                                                                      | `false` turns off logging and everything that reads the log group.                                                                                                                            |
| `observability.logs.retentionDays`                       | number              | `14`                                                                                                                                                        | A CloudWatch Logs retention value: `1`, `3`, `5`, `7`, `14`, `30`, `60`, `90`, `120`, `150`, `180`, `365`, `400`, `545`, `731`, `1096`, `1827`, `2192`, `2557`, `2922`, `3288` or `3653`.     |
| `observability.logs.logGroup`                            | string              | `/aws/lambda-microvms/<service>-<name>-<stage>`                                                                                                             | The log group name.                                                                                                                                                                           |
| `observability.metrics.enabled`                          | boolean             | `true`                                                                                                                                                      | `false` drops the metric filters; `alarms` then can't be set.                                                                                                                                 |
| `observability.metrics.filters`                          | map of strings      | `errors` filter                                                                                                                                             | Filter name to CloudWatch Logs filter pattern. Replaces the default filter.                                                                                                                   |
| `observability.alarms.notify`                            | string or reference | none                                                                                                                                                        | SNS topic ARN or CloudFormation reference. Required when `alarms` is set; alarms also need metrics and logging on.                                                                            |
| `observability.alarms.thresholds.<filter>`               | map                 | `threshold: 5`, `period: 300`, `evaluationPeriods: 1`, `datapointsToAlarm: 1`, `comparisonOperator: GreaterThanThreshold`, `treatMissingData: notBreaching` | Per-filter alarm settings.                                                                                                                                                                    |
| `observability.dashboard.enabled`                        | boolean             | `true`                                                                                                                                                      | `false` leaves this sandbox out of the service dashboard.                                                                                                                                     |
| `tags`                                                   | map of strings      | none                                                                                                                                                        | Tags for the image, log group, roles, alarms and connector.                                                                                                                                   |

The [`serverless.yml` reference](./serverless.yml.md#aws-lambda-microvms-sandboxes) lists the same keys in one block.

## Limits and behavior

For each sandbox, `serverless deploy` creates:

| Logical ID                                          | Type                                                | When                                                      |
| --------------------------------------------------- | --------------------------------------------------- | --------------------------------------------------------- |
| `<Name>Image`                                       | `AWS::Lambda::MicrovmImage`                         | Always                                                    |
| `<Name>ImageBuildRole`, `<Name>ExecutionRole`       | `AWS::IAM::Role`                                    | Unless the role is an existing one                        |
| `<Name>Connector`, `<Name>ConnectorOperatorRole`    | `AWS::Lambda::NetworkConnector`, `AWS::IAM::Role`   | With `vpc` (the role unless it is an existing one)        |
| `<Name>LogGroup`                                    | `AWS::Logs::LogGroup`                               | Unless logging is off                                     |
| `<Name><Filter>MetricFilter`, `<Name><Filter>Alarm` | `AWS::Logs::MetricFilter`, `AWS::CloudWatch::Alarm` | One per filter; alarms with `alarms.notify`               |
| `SandboxesDashboard`                                | `AWS::CloudWatch::Dashboard`                        | One per service, when any sandbox has a dashboard section |

Stack outputs: `<Name>ImageIdentifier` (the image ARN, for `RunMicrovm`), `<Name>ExecutionRoleArn`, and with `vpc`, `<Name>ConnectorArn`.

- **Architecture**: images are built for ARM64 only.
- **Duration**: an instance lives at most 28,800 seconds (8 hours), running and suspended time together.
- **Quotas**: image versions per image (50 by default) and the account's memory across running and suspended instances per Region are Service Quotas you can raise ([scaling and concurrency](https://docs.aws.amazon.com/lambda/latest/dg/microvms-launching.html#microvms-launching-scaling)).
- **Cost**: running instances bill compute, suspended ones snapshot storage, terminated ones nothing.
- **Endpoints**: each instance has its own endpoint, with no load balancing across instances; every request needs an auth token.
- **Not for** event processing (use [functions](./functions.md)) or shared HTTP servers that scale with traffic (use [web apps](./web-apps.md)).

## Troubleshooting sandboxes

### Image build fails or `MicrovmImage` doesn't stabilize

The deploy rolls back when Lambda can't build the image. Read the build's reason:

```bash
aws lambda-microvms list-microvm-image-builds \
  --image-identifier <image-arn> --image-version <version> \
  --query 'items[].[architecture,buildState,stateReason]' --output table
```

- `CONTAINER_BUILD_FAILED`: the `Dockerfile` doesn't build. Run `docker build` on the artifact directory, and read the build lines in the log group.
- `DISK_STORAGE_FULL`: the image is larger than the disk of the `minimumMemory` tier. Shrink it (smaller base image, multi-stage build) or raise `minimumMemory`.
- `INTERNAL_PLATFORM_ERROR`: a platform failure unrelated to the artifact. Deploy again.

### `sandboxes: no Dockerfile found in artifact directory ...`

The local `artifact` directory has no `Dockerfile` at its root. Add one, or point `artifact` at a pre-built `s3://` zip. A missing directory gives `sandboxes: artifact directory not found: "..."`; the path is resolved from the service directory.

### `sandboxes.<name>.artifact must be a local directory or an s3:// URI ...`

```text
sandboxes.api.artifact must be a local directory or an s3:// URI (ECR/other URIs are not supported by Lambda MicroVMs)
```

`artifact` names a registry image. Use a directory with a `Dockerfile` that starts `FROM` that image.

### `Access denied invoking sandbox '<name>'...`

```text
Access denied invoking sandbox 'echo'. The caller identity needs lambda:RunMicrovm, GetMicrovm, CreateMicrovmAuthToken, TerminateMicrovm, iam:PassRole and lambda:PassNetworkConnector.
```

Grant the listed actions to the identity running `serverless invoke --sandbox`, as in [Invoking a sandbox](#invoking-a-sandbox).

### `unable to assume the provided NetworkConnectorOperatorRole`

The operator role doesn't trust `network-connectors.lambda.amazonaws.com`, or its trust policy has an `aws:SourceAccount` condition. Fix the existing role's trust policy, or remove `iam.operatorRole` to use the generated role.

### `Port 9100 is already in use for the local MicroVMs API...`

Another `serverless dev --sandbox` session or another program uses the port. Stop it, or run `serverless dev --sandbox <name> --port <port>`. Without a reachable Docker daemon, the command stops with `Docker is required for 'serverless dev --sandbox'`; start Docker.

## Examples

- [Sandboxes examples](https://github.com/serverless/examples/tree/v4/sandboxes): a minimal sandbox, a complete one with hooks, observability, IAM and tags, and a sandbox per agent session launched by a webhook.

## Related

- [Web Apps](./web-apps.md): HTTP servers as AWS Lambda Web Functions.
- [Prune](./prune.md#sandbox-image-versions): image version cleanup.
- [`serverless invoke`](../cli-reference/invoke.md) and [`serverless logs`](../cli-reference/logs.md): the `--sandbox` options.
- [`serverless dev`](../cli-reference/dev.md): the Dev Mode command.
