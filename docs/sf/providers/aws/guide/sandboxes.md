<!--
title: Serverless Framework - Sandboxes (AWS Lambda MicroVMs)
description: How to define, deploy, and invoke sandboxes (AWS Lambda MicroVMs) with the Serverless Framework
short_title: Sandboxes
keywords:
  [
    'Serverless Framework',
    'AWS Lambda',
    'MicroVMs',
    'Sandboxes',
    'Lambda MicroVMs',
  ]
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/aws/guide/sandboxes)

<!-- DOCS-SITE-LINK:END -->

# Sandboxes (AWS Lambda MicroVMs)

AWS Lambda MicroVMs let you run arbitrary container workloads inside isolated virtual machines managed by the Lambda data plane. Unlike standard Lambda functions, each MicroVM runs a full container image built from a `Dockerfile` you provide, exposes one or more HTTP ports to callers, and supports lifecycle hooks that fire at boot, suspend, and resume.

**When to use MicroVMs instead of standard Lambda:**

- Your workload requires OS-level isolation or privileged capabilities (`osCapabilities`).
- You need to serve requests on a persistent HTTP port (e.g., a long-lived web server).
- Your application startup is expensive and benefits from suspension/resumption rather than cold starts.
- You want to bring an existing containerised service to the Lambda data plane without restructuring it as a handler function.

The Serverless Framework v4 `sandboxes` top-level property handles deployment and runtime invocation. `serverless deploy` registers the MicroVM image with AWS, building it when the artifact changes — the artifact is content-addressed, so re-deploying an unchanged sandbox reuses the existing image instead of rebuilding. `serverless invoke --sandbox <name>` starts a fresh instance, runs your request, and terminates the instance when done (see [Invoking a Sandbox](#invoking-a-sandbox)). Logs are accessible via `serverless logs --sandbox <name>` (see [Logs](#logs)).

`serverless dev --sandbox` supports running sandboxes locally (see [Local development](#local-development-serverless-dev)).

---

## Quick Start

**1. Write a minimal `serverless.yml`:**

```yml
service: my-sandbox-service
frameworkVersion: '4'

provider:
  name: aws
  region: us-east-1

sandboxes:
  echo: # sandbox name — used in CloudFormation logical IDs
    artifact: ./app # local directory that contains a Dockerfile
```

**2. Create `./app/Dockerfile`** (path relative to `serverless.yml`):

```dockerfile
FROM public.ecr.aws/docker/library/python:3.11-slim
WORKDIR /app
COPY app.py .
EXPOSE 8080
CMD ["python", "app.py"]
```

**3. Deploy:**

```bash
serverless deploy
```

The framework zips `./app`, uploads it to the deployment bucket, resolves the latest al2023 base image, and creates (or updates) an `AWS::Lambda::MicrovmImage` CloudFormation resource.

> **If the image build fails or reports `NotStabilized`**, inspect the underlying build record for the specific reason:
>
> ```bash
> aws lambda-microvms list-microvm-image-builds \
>   --image-identifier <image-arn> --image-version <version> \
>   --query 'items[].[architecture,buildState,stateReason]' --output table
> ```
>
> `stateReason` names one of three causes:
>
> - **`CONTAINER_BUILD_FAILED`** — your `Dockerfile` doesn't build. Reproduce locally with `docker build` against the same artifact directory, and check the build logs in the sandbox's log group (`/aws/lambda-microvms/<image-name>`).
> - **`DISK_STORAGE_FULL`** — the built image exceeds the disk allotted for the sandbox's `minimumMemory` tier. Trim image layers (smaller base image, fewer installed packages, multi-stage builds) or raise `minimumMemory` to move to a larger disk tier.
> - **`INTERNAL_PLATFORM_ERROR`** — a platform-side failure unrelated to your artifact. Retry the deploy.

---

## Artifact

The `artifact` property tells the framework where to find your container source. It accepts two forms:

### Local directory

```yml
sandboxes:
  api:
    artifact: ./docker/api # path resolved relative to serverless.yml
```

The directory must exist and must contain a `Dockerfile`. The framework zips the entire directory, computes a SHA-256 content hash, and uploads the zip to the deployment bucket at:

```
serverless/<service>/<stage>/sandboxes/<name>-<sha256>.zip
```

The S3 key is content-addressed: re-deploying without changing the directory contents reuses the same key.

### S3 URI passthrough

```yml
sandboxes:
  api:
    artifact: s3://my-bucket/builds/api-v1.2.3.zip
```

When the value starts with `s3://` the framework passes the URI directly to CloudFormation as the `CodeArtifact.Uri`. No upload is performed.

### Snapshots and per-instance state

Every instance boots from a single snapshot captured when the image is built — there is no separate boot process per instance. One consequence follows directly from that: **any value your code generates at build time is baked into the snapshot and comes out identical across every instance**, including instances resumed later from the same snapshot. UUIDs, PRNG seeds, tokens, and similar one-time values must not be generated during the build (for example, in a `ready` or `validate` hook, or at container startup before the snapshot is taken) — generate them in the `run` hook instead, or per-call from a cryptographically secure random number generator (in Node.js, `crypto.randomUUID()` or `crypto.randomBytes()`, never a `Math.random()`-seeded value).

Outbound TCP connections are also killed on both `run` and `resume` — the platform doesn't preserve open sockets across either transition. The AWS SDKs retry transparently through this, so calls to AWS services generally just work; for other HTTP or database clients, make sure reconnect/retry is configured rather than assuming a long-lived connection survives a resume.

For CSPRNG guidance in other languages, see [AWS's MicroVMs image documentation](https://docs.aws.amazon.com/lambda/latest/dg/microvms-images.html).

---

## Configuration Reference

All sandboxes are defined under the top-level `sandboxes` key. Each key is the sandbox name; its value is a configuration object.

<!-- prettier-ignore -->
```yml
sandboxes:
  <name>:
    # required
    artifact: <string>

    # optional
    minimumMemory: 512 | 1024 | 2048 | 4096 | 8192
    description: <string>
    environment:
      KEY: value
    osCapabilities:
      - all
    hooks: { ... }
    vpc: { ... }
    iam: { ... }
    observability: # `true` (default) | `false` — or the object form shown below:
      logs:
        enabled: true                      # set false to disable MicroVM logging entirely
        retentionDays: 14                  # CloudWatch-allowed value; default 14
        logGroup: /my-org/sandboxes/<name> # optional: write logs to a custom group
      metrics:
        enabled: true
        filters:                           # one CloudWatch metric (+ alarm + dashboard
          errors: "<pattern>"              # series) per key; override `errors` or add
          warnings: "<pattern>"            # your own keys
      alarms:
        notify: <SNS ARN | CFN ref>        # required when alarms block is present
        thresholds:
          errors:
            threshold: 5
            period: 300
            evaluationPeriods: 1
            datapointsToAlarm: 1
            comparisonOperator: GreaterThanThreshold
            treatMissingData: notBreaching
      dashboard:
        enabled: true
    tags:
      Key: Value
```

| Property         | Type              | Default          | Description                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ---------------- | ----------------- | ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `artifact`       | string            | — **(required)** | Local directory path (contains `Dockerfile`) or `s3://` URI                                                                                                                                                                                                                                                                                                                                                                 |
| `minimumMemory`  | number            | `2048`           | Minimum memory in MiB the MicroVM is guaranteed (maps to `MinimumMemoryInMiB`) — a floor, not a cap. Must be one of: `512`, `1024`, `2048`, `4096`, `8192`.                                                                                                                                                                                                                                                                 |
| `description`    | string            | auto             | Human-readable description embedded in the CloudFormation resource.                                                                                                                                                                                                                                                                                                                                                         |
| `environment`    | object            | `{}`             | Environment variables injected into the MicroVM at runtime. Values must be strings. **Baked into the image snapshot at build time** — identical across every instance of that image version and persists across suspend/resume. Use it only for static, non-sensitive configuration. Per-instance data (session IDs, tenant IDs, and similar) has to travel through the launch call's `runHookPayload` instead. Real secrets shouldn't go in `environment` at all — fetch them at runtime through the execution role (Secrets Manager or SSM). See [Snapshots and per-instance state](#snapshots-and-per-instance-state). |
| `osCapabilities` | array             | `[]`             | Additional OS capabilities granted to the container. Accepted value: `all` (case-insensitive).                                                                                                                                                                                                                                                                                                                              |
| `hooks`          | object            | `{}`             | Lifecycle hook configuration. See [Hooks](#hooks).                                                                                                                                                                                                                                                                                                                                                                          |
| `vpc`            | object            | —                | VPC egress configuration. See [Networking / VPC](#networking--vpc).                                                                                                                                                                                                                                                                                                                                                         |
| `iam`            | object            | —                | IAM role customization. See [IAM](#iam).                                                                                                                                                                                                                                                                                                                                                                                    |
| `observability`  | boolean \| object | `true`           | Controls the owned log group, error metric filter, CloudWatch dashboard, and optional alarms. `true` (default) enables metrics and dashboard; `false` opts out of metrics and dashboard (log group is still created). Object form accepts `logs`, `metrics`, `alarms`, and `dashboard` sub-blocks. Alarms require `observability.alarms.notify` (SNS topic ARN or CloudFormation ref). See [Observability](#observability). |
| `tags`           | object            | —                | Key/value tags applied to every taggable resource the sandbox creates (image, log group, IAM roles, alarms, network connector). Values must be strings.                                                                                                                                                                                                                                                                     |

---

## Hooks

Hooks let the MicroVM notify your application at key points in its lifecycle. Your application must run an HTTP server (default port **9000**) that handles `POST` requests at the paths the Lambda runtime calls.

### Hook shape

Each hook is either `true` (enable with defaults) or an object with an optional `timeout` override. The hook-server `port` is set once for all hooks (see the `port` key below), not per hook:

```yml
sandboxes:
  api:
    artifact: ./app
    hooks:
      port: 9000 # port your app listens on for hook requests (default 9000)

      # Image-build hooks — called once when the MicroVM image is built.
      # Omit `timeout` to use the AWS default; set it to override (range 1–3600s).
      ready:
        timeout: 120 # give a slow boot more than the 60s AWS default
      validate:
        timeout: 30 # AWS default is only 1s — set this for real validation work

      # Runtime hooks — called on each instance lifecycle event.
      # Omit `timeout` to use the AWS default (1s); set it to override (range 1–60s).
      run:
        timeout: 5
      resume:
        timeout: 5
      suspend:
        timeout: 5
      terminate:
        timeout: 5
```

The framework sets no timeout of its own — omitting `timeout` leaves the
property unset so the AWS platform default applies (`ready` 60s; `validate`,
`run`, `resume`, `suspend`, and `terminate` 1s each). You can enable a hook
with just `true` to take those AWS defaults:

```yml
hooks:
  ready: true
  run: true
```

### Hook categories

| Category      | Hooks                                   | When called                          |
| ------------- | --------------------------------------- | ------------------------------------ |
| Image hooks   | `ready`, `validate`                     | During the MicroVM image build phase |
| Runtime hooks | `run`, `resume`, `suspend`, `terminate` | On each running MicroVM instance     |

> **Note:** Enabling any runtime hook (`run`, `resume`, `suspend`, or `terminate`) automatically enables the `ready` image hook as well.

> **Hooks are opt-in notifications, not the lifecycle itself.** A MicroVM still runs, suspends, resumes, and terminates whether or not you declare the matching hook — enabling a hook only means your application is _notified_ at that point. If you need to act on a transition (flush state on `terminate`, re-open connections on `resume`), you must declare that hook; otherwise the transition happens silently with no callback to your code.

> **Idempotency:** the platform may retry `suspend` and `terminate` hook calls under failure conditions — write handlers for those hooks so a repeated call is safe.

### Hook HTTP contract

The Lambda runtime posts to:

```
POST http://localhost:<port>/aws/lambda-microvms/runtime/v1/<hook-name>
```

Your server must respond with HTTP 200 within the configured timeout. A non-200 response or timeout causes the lifecycle step to fail. When you omit a hook's `timeout`, the AWS platform default applies — and those defaults are tight: `validate`, `run`, `resume`, `suspend`, and `terminate` each default to just **1 second** (`ready` gets 60). So **respond 200 promptly and do any heavy work asynchronously**, or raise the `timeout` for hooks that legitimately need longer — a handler that runs the actual workload before replying will otherwise trip the timeout and fail the step. Acknowledge first, then process. A minimal Python implementation:

```python
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

class HooksHandler(BaseHTTPRequestHandler):
    def do_POST(self):
        n = int(self.headers.get("Content-Length") or 0)
        self.rfile.read(n)                     # drain body
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", "2")
        self.end_headers()
        self.wfile.write(b"{}")

ThreadingHTTPServer(("0.0.0.0", 9000), HooksHandler).serve_forever()
```

---

## Networking / VPC

By default, sandboxes have outbound internet access through AWS's managed `INTERNET_EGRESS` connector. To route MicroVM traffic through your own VPC instead, add a `vpc` block:

```yml
sandboxes:
  api:
    artifact: ./app
    vpc:
      subnetIds:
        - subnet-0abc1234
        - subnet-0def5678
      securityGroupIds:
        - sg-0aabbccdd
      protocol: ipv4 # 'ipv4' (default) or 'dualstack'
```

| Property           | Type     | Default | Description                                            |
| ------------------ | -------- | ------- | ------------------------------------------------------ |
| `subnetIds`        | string[] | —       | List of subnet IDs for the network connector.          |
| `securityGroupIds` | string[] | —       | List of security group IDs for the network connector.  |
| `protocol`         | string   | `ipv4`  | IP protocol: `ipv4` or `dualstack` (case-insensitive). |

When `vpc` is set, the framework creates an `AWS::Lambda::NetworkConnector` and an associated operator IAM role (see [IAM](#iam)). The connector ARN is exported as a CloudFormation stack output for use by the data-plane run path.

> **Note:** Outbound internet access via `INTERNET_EGRESS` is always present during the image build phase regardless of `vpc` configuration.

---

## IAM

### Auto-generated roles

The framework creates two IAM roles per sandbox automatically:

**Build role** (`AWS::IAM::Role` — `<Name>ImageBuildRole`)

Permissions:

- `s3:GetObject` on the deployment bucket (to fetch the artifact zip)
- `logs:CreateLogGroup`, `logs:CreateLogStream`, `logs:PutLogEvents` on `/aws/lambda-microvms/*`

**Execution role** (`AWS::IAM::Role` — `<Name>ExecutionRole`)

Permissions:

- `logs:CreateLogGroup`, `logs:CreateLogStream`, `logs:PutLogEvents` on `/aws/lambda-microvms/*`

Both roles use a trust policy for `lambda.amazonaws.com` with an `aws:SourceAccount` condition to prevent confused-deputy attacks.

> **Extending the build role for non-default setups.** The generated build role grants `s3:GetObject` on the deployment bucket plus CloudWatch Logs — enough for the default Serverless deployment bucket (SSE-S3) and public or managed base images. Two setups need extra permissions, which you add via [`iam.buildRole.statements`](#customizing-auto-generated-roles):
>
> - **Deployment bucket encrypted with a customer-managed KMS key** → add `kms:Decrypt` (and `kms:DescribeKey`) on the key, otherwise the build fails fetching the artifact with `AccessDenied`.
> - **`Dockerfile` that builds `FROM` a private ECR image** → add `ecr:GetAuthorizationToken` (on `*`) plus `ecr:BatchGetImage` and `ecr:GetDownloadUrlForLayer` on the repository.

### Customizing auto-generated roles

Pass an `iam.buildRole` or `iam.executionRole` customization object to extend the generated role without replacing it:

```yml
sandboxes:
  api:
    artifact: ./app
    iam:
      buildRole:
        statements:
          - Effect: Allow
            Action: ['s3:GetObject']
            Resource: 'arn:aws:s3:::my-other-bucket/*'
        managedPolicies:
          - arn:aws:iam::aws:policy/AmazonS3ReadOnlyAccess
        permissionsBoundary: arn:aws:iam::123456789012:policy/MyBoundary

      executionRole:
        statements:
          - Effect: Allow
            Action: ['dynamodb:GetItem']
            Resource: !GetAtt MyTable.Arn
```

Supported customization keys:

| Key                   | Type   | Description                                                     |
| --------------------- | ------ | --------------------------------------------------------------- |
| `statements`          | array  | Additional IAM policy statements appended to the inline policy. |
| `managedPolicies`     | array  | Managed policy ARNs attached to the role.                       |
| `permissionsBoundary` | string | ARN of a permissions boundary policy.                           |

### Providing an external role

To skip role generation entirely and supply your own role, pass an ARN string or a CloudFormation intrinsic:

```yml
sandboxes:
  api:
    artifact: ./app
    iam:
      buildRole: arn:aws:iam::123456789012:role/MyBuildRole
      executionRole:
        Fn::ImportValue: SharedExecutionRoleArn
```

Supported forms: ARN string, `Ref`, `Fn::GetAtt`, `Fn::ImportValue`, `Fn::Sub`. When an external role is provided, no `AWS::IAM::Role` resource is created for that role.

---

## What the Framework Provisions

For each sandbox, `serverless deploy` creates the following CloudFormation resources:

"Image" marks the image and its build role; the execution role, log group, and metrics/alarms are named for what they are at runtime.

| Resource                      | Type                            | Condition                                                                         |
| ----------------------------- | ------------------------------- | --------------------------------------------------------------------------------- |
| `<Name>Image`                 | `AWS::Lambda::MicrovmImage`     | Always                                                                            |
| `<Name>ImageBuildRole`        | `AWS::IAM::Role`                | Unless `iam.buildRole` is an external ref                                         |
| `<Name>ExecutionRole`         | `AWS::IAM::Role`                | Unless `iam.executionRole` is an external ref                                     |
| `<Name>Connector`             | `AWS::Lambda::NetworkConnector` | Only when `vpc` is set                                                            |
| `<Name>ConnectorOperatorRole` | `AWS::IAM::Role`                | Only when `vpc` is set                                                            |
| `<Name>LogGroup`              | `AWS::Logs::LogGroup`           | Always                                                                            |
| `<Name><Filter>MetricFilter`  | `AWS::Logs::MetricFilter`       | One per `observability.metrics.filters` entry (default `errors`)                  |
| `<Name><Filter>Alarm`         | `AWS::CloudWatch::Alarm`        | One per filter, only when `observability.alarms.notify` is set                    |
| `SandboxesDashboard`          | `AWS::CloudWatch::Dashboard`    | One **per service** (not per sandbox), when any sandbox has the dashboard enabled |

Stack outputs (use these instead of hard-coding logical IDs):

| Output key               | Value                                                                                    |
| ------------------------ | ---------------------------------------------------------------------------------------- |
| `<Name>ImageIdentifier`  | Image identifier — pass to `RunMicrovm` / `list-microvms` as `imageIdentifier`           |
| `<Name>ExecutionRoleArn` | ARN of the role the running MicroVM assumes (pass to `RunMicrovm` as `executionRoleArn`) |
| `<Name>ConnectorArn`     | ARN of the egress `NetworkConnector` (only when `vpc` is set)                            |

CloudWatch logs are always shipped to the owned log group `/aws/lambda-microvms/<image-name>` (default 14-day retention). See [Observability](#observability).

The MicroVM image is always built on `ARM_64` architecture. The base image is resolved to the latest `al2023` version at deploy time.

---

## Invoking a Sandbox

```bash
serverless invoke --sandbox <name> [--path <path>] [--method <method>] [--data '<body>'] [--port <port>]
```

`--sandbox <name>` is required and identifies which sandbox to invoke (analogous to `--function` for Lambda invocations). The framework:

1. Starts a fresh MicroVM instance using the sandbox's deployed image ARN and execution role.
2. Verifies the instance is ready by sending an authenticated request with retry/backoff, rather than polling `get-microvm` for a `RUNNING` state — instance state is [eventually consistent](#eventual-consistency), so a `502` in the first seconds after launch is expected while the snapshot restores. Treat it as transient and retry rather than as a hard failure.
3. Mints a short-lived auth token for the target port.
4. Sends the HTTP request through the AWS proxy.
5. Prints the response body.
6. **Always terminates the instance** when done, regardless of success or failure.

The CLI launches this one-shot instance with an injected idle policy (`maxIdleDurationSeconds: 60`, `suspendedDurationSeconds: 0`, `autoResumeEnabled: false`), so even if the invoke is interrupted mid-flight, the instance self-terminates about a minute later — nothing to configure, nothing left running.

### Options

| Flag                | Default          | Description                                 |
| ------------------- | ---------------- | ------------------------------------------- |
| `--sandbox <name>`  | — **(required)** | Sandbox name as defined in `serverless.yml` |
| `--path <path>`     | `/`              | HTTP request path                           |
| `--method <method>` | `GET`            | HTTP method                                 |
| `--data '<body>'`   | —                | Request body (non-GET requests)             |
| `--port <port>`     | `8080`           | Container port to send the request to       |

### Examples

```bash
# GET / on port 8080 (defaults)
serverless invoke --sandbox echo

# GET a specific path
serverless invoke --sandbox echo --path /health

# POST with a JSON body
serverless invoke --sandbox echo --path /api/items --method POST --data '{"name":"widget"}'

# Non-default container port
serverless invoke --sandbox echo --path /metrics --port 9090
```

> **Caller IAM prerequisite:** the identity running `invoke` must have
> `lambda:RunMicrovm`, `lambda:GetMicrovm`, `lambda:CreateMicrovmAuthToken`,
> `lambda:TerminateMicrovm`, `iam:PassRole` (the execution role), and
> `lambda:PassNetworkConnector`. The framework does **not** create these permissions.

---

## Logs

```bash
serverless logs --sandbox <name>
```

Prints the recent window of log events from the sandbox's CloudWatch log group `/aws/lambda-microvms/<image-name>`. The output includes both image-build lines and runtime lines from MicroVM instances.

> **Note:** `serverless logs --sandbox` prints the recent log window and exits; it does not stream/follow (`--tail`).

---

## Observability

Observability is **on by default**. Every sandbox automatically gets a CloudWatch log group, an error metric filter, and a section in the service's CloudWatch dashboard (one dashboard per service). You do not need to add anything to `serverless.yml` to enable monitoring.

When a dashboard is created, `serverless deploy` prints its console URL in the deploy summary as a `dashboard` line, so you can open it straight from the terminal.

### Log group

The framework creates and owns the `AWS::Logs::LogGroup` for each sandbox — `/aws/lambda-microvms/<image-name>` — with a default retention of **14 days**. That 14-day default is the framework's choice for the group it owns, not an AWS default — a raw CloudWatch log group never expires on its own unless retention is set explicitly, so this is the framework applying a sane default on your behalf. `retentionDays` overrides it. Owning the group means retention is enforced and the group is removed when you run `serverless remove`. The group is created before the MicroVM image build runs so that retention applies from the first log event.

The log group is created whenever logging is enabled (the default) — including when `observability: false`, which only opts out of the metrics/dashboard/alarms layer. To customize retention, or to turn MicroVM logging off entirely:

```yml
sandboxes:
  api:
    artifact: ./app
    observability:
      logs:
        retentionDays: 30
        logGroup: /my-org/sandboxes/api # optional: write logs to a custom group
        # enabled: false                # or disable MicroVM logging completely
```

`retentionDays` must be one of the values accepted by CloudWatch Logs (e.g. `1`, `3`, `5`, `7`, `14`, `30`, `60`, `90`, `120`, `150`, `180`, `365`, etc.).

`logGroup` overrides the destination group name end-to-end: the MicroVM's `Logging` config points at it, the owned `AWS::Logs::LogGroup` is created with that name, the build/execution roles are scoped to exactly that group, and the metric filters and dashboard read from it.

When `logs.enabled: false`, the MicroVM image is built with `Logging: { Disabled: true }`, the owned log group is not created, and the metric filters, alarms, and dashboard (which read from that group) are skipped.

### Error metric and dashboard

When observability is on (the default), the framework also creates:

- An `AWS::Logs::MetricFilter` per `metrics.filters` entry. The default `errors` filter counts log lines containing `error`, `exception`, or `fail` (case-insensitive) and publishes them to a CloudWatch metric in the `ServerlessFramework/Sandboxes` namespace, named `<image-name>-errors` (custom filters use `<image-name>-<filter-key>`). Like AWS Lambda's own `Errors` metric, it is sparse — a data point is emitted only when matching lines occur — so alarms default to `treatMissingData: notBreaching`.
- **One `AWS::CloudWatch::Dashboard` per service** (`<service>-<stage>-sandboxes`), with a section per sandbox. Each section has: log volume (incoming bytes on the left axis, events on the right), the filter-derived metrics (with a horizontal threshold band per filter when alarms are configured), a "MicroVMs created" bar chart (distinct log streams = instances), a recent-logs table, a recent-errors table, and — when alarms are set — an alarm status widget. Multiple sandboxes share the one dashboard.

Set `observability: false` to opt out of both the metric filter and the dashboard. The log group is still created.

```yml
sandboxes:
  api:
    artifact: ./app
    observability: false # no metric filter, no dashboard; log group still created
```

Or disable just the dashboard while keeping the metric:

```yml
sandboxes:
  api:
    artifact: ./app
    observability:
      dashboard:
        enabled: false
```

### Alarms

Alarms are **off by default** and require an explicit `notify` target. Add an `alarms` block with `notify` set to an SNS topic ARN (or a CloudFormation intrinsic that resolves to one):

```yml
sandboxes:
  api:
    artifact: ./app
    observability:
      alarms:
        notify: arn:aws:sns:us-east-1:123456789012:my-alerts
```

This creates an `AWS::CloudWatch::Alarm` for the error metric with these defaults:

| Setting                | Default                            |
| ---------------------- | ---------------------------------- |
| Threshold              | `5` (errors per evaluation period) |
| Period                 | `300` s                            |
| Evaluation periods     | `1`                                |
| Datapoints to alarm    | `1`                                |
| Comparison             | `GreaterThanThreshold`             |
| Missing data treatment | `notBreaching`                     |

Override any of these under `alarms.thresholds.errors`:

```yml
observability:
  alarms:
    notify: arn:aws:sns:us-east-1:123456789012:my-alerts
    thresholds:
      errors:
        threshold: 10
        period: 60
        evaluationPeriods: 3
        datapointsToAlarm: 2
```

Providing an `alarms` block without `notify` is a validation error — the framework rejects the configuration rather than creating an alarm with no action.

You can also use a CloudFormation reference if the SNS topic is defined elsewhere in the same stack:

```yml
observability:
  alarms:
    notify: !Ref AlertTopic
```

### CloudFormation resources emitted

| Resource                     | Type                         | Condition                                                      |
| ---------------------------- | ---------------------------- | -------------------------------------------------------------- |
| `<Name>LogGroup`             | `AWS::Logs::LogGroup`        | **Always**                                                     |
| `<Name><Filter>MetricFilter` | `AWS::Logs::MetricFilter`    | One per `metrics.filters` entry (default `errors`)             |
| `<Name><Filter>Alarm`        | `AWS::CloudWatch::Alarm`     | One per filter, only when `alarms.notify` is set               |
| `SandboxesDashboard`         | `AWS::CloudWatch::Dashboard` | One **per service** when any sandbox has the dashboard enabled |

### How error detection works

The error metric is derived from **log content** — it counts log lines matching your filter patterns (by default `error`, `exception`, or `fail`). This catches errors your application logs. To also detect a process that exits without logging anything, add a synthetic canary or a proxy-layer health check alongside the log-based metric.

### Cost

Metric filters are free. Each derived metric costs approximately $0.30/month. CloudWatch **dashboards are free for the first three per account**, then approximately **$3/month each**. The framework creates **one dashboard per service** (shared by all its sandboxes), so a multi-sandbox service still only adds a single dashboard. If your account already has three or more dashboards, set `observability: false` or `dashboard.enabled: false` (on every sandbox) to avoid the charge.

---

## Local development (`serverless dev`)

Run a sandbox locally for a fast inner loop. `serverless dev --sandbox` builds your sandbox image
from its `Dockerfile` and starts a local, SDK-compatible **AWS Lambda MicroVMs control-plane** (see
[AWS API emulation](#aws-api-emulation) below) that launches MicroVM instances as Docker containers
on demand:

```bash
serverless dev --sandbox app          # --sandbox optional when only one is defined
serverless dev --mode sandboxes       # equivalent; auto-detected when the service has only sandboxes
serverless dev --sandbox app --port 9300   # control-plane endpoint port (default 9100)
```

The control-plane endpoint is **stable across runs** (default `http://127.0.0.1:9100`) and
customizable with `--port`, so the address your code targets doesn't change between sessions. If the
port is already in use, `dev` exits with a clear error so you can pick another; run two sandboxes at
once by giving each its own `--port`. Press Ctrl-C to stop.

> **Note:** `dev` requires a local Docker daemon and a local `artifact` directory
> containing a `Dockerfile`. A sandbox whose `artifact` is an `s3://` zip cannot be
> run with `dev` — use a local directory for the dev loop.

> The dev loop runs under the sandbox's real execution role (see [IAM
> emulation](#iam-emulation) below). It does not reproduce the production
> proxy/auth path or network egress isolation, so validate those against a
> deployed sandbox.

### Hot reloading

`serverless dev --sandbox <name>` watches the sandbox's build-context directory (the
`artifact` directory — the Dockerfile and your sources). When a file changes, the image
is rebuilt; the **next** `RunMicrovm` launches a fresh container from the updated image
(already-running instances keep the image they started with), so you can iterate without
re-running the command.

- Framework and tooling directories are ignored, including `.serverless`,
  `node_modules`, `.git`, virtualenv/cache directories, and test files
  (`*.test.js`, `*.spec.js`, `*_test.py`, `*.test.py`).
- If a rebuild fails (for example, a Docker build error), running instances keep working
  and the error is printed — the dev session stays up so you can fix the issue and save
  again.
- Press `Ctrl-C` to stop.

### IAM emulation

By default, `serverless dev --sandbox <name>` runs the local container **as the
sandbox's deployed execution role**: it assumes that role via STS and injects the
temporary credentials into the container, so AWS calls from your app use the same
permissions they will have in production — real `AccessDenied` errors surface in dev
instead of after deploy.

- The sandbox must already be deployed (the execution role must exist to assume it).
- To make the assume work, the command temporarily adds your local identity to the
  execution role's trust policy (a statement tagged `ServerlessSandboxesLocalDevPolicy`)
  and removes it again when you stop with `Ctrl-C`. This needs `iam:GetRole`,
  `iam:UpdateAssumeRolePolicy`, and `sts:AssumeRole` permission.
- If the role cannot be assumed (not deployed, missing permissions, etc.), dev prints a
  notice and falls back to your ambient AWS credentials so the loop keeps working.
- Pass `--no-assume-role` to skip emulation and run with your ambient credentials.
- If `dev` is killed abruptly (e.g. `SIGKILL` rather than `Ctrl-C`), the temporary trust statement isn't removed; it's cleaned up — or reused without duplication — on the next `dev` run. Until then, your local identity remains able to assume the execution role.
- **Caveat:** an app that reads credentials directly from the instance metadata service
  (`169.254.169.254`) bypasses the injected credentials; only the AWS SDK default
  credential chain picks them up.

### AWS API emulation

`serverless dev --sandbox <name>` starts a local, SDK-compatible **AWS Lambda MicroVMs control-plane** on
localhost, backed by Docker. Your own orchestration code — anything that drives `LambdaMicrovmsClient` — can
run unchanged against it: `RunMicrovm` → `GetMicrovm` → `CreateMicrovmAuthToken` → call the instance
endpoint → `TerminateMicrovm`.

On start, `dev` prints the endpoint (stable default port `9100`; change with `--port`):

```
Local MicroVMs API: http://127.0.0.1:9100 (Ctrl-C to stop)
Point your code at it: export AWS_ENDPOINT_URL_LAMBDA_MICROVMS=http://127.0.0.1:9100
  (or pass endpoint: 'http://127.0.0.1:9100' to LambdaMicrovmsClient)
```

- Each `RunMicrovm` starts a **fresh container** from the current image and returns a **unique** `endpoint`;
  `TerminateMicrovm` stops it.
- **Endpoint format:** locally the `endpoint` is a ready-to-use plain-HTTP URL like
  `http://127.0.0.1:<port>` — **use it as-is**. (In production `endpoint` is a bare HTTPS hostname you
  prepend `https://` to; locally it's HTTP so there's no TLS/cert setup and no
  `NODE_TLS_REJECT_UNAUTHORIZED`. If your code hardcodes `https://${endpoint}`, point it at the value the
  emulator returns instead.) Still send `X-aws-proxy-auth` + `X-aws-proxy-port` as in production.
- **Idle lifecycle** mirrors production: the emulator honors the `idlePolicy` you pass to `RunMicrovm`
  (`maxIdleDurationSeconds`, `suspendedDurationSeconds`, `autoResumeEnabled`). An idle instance is suspended
  (`docker pause`) and then terminated; with `autoResumeEnabled`, traffic resumes a suspended instance. So
  an instance you forget to terminate is reaped automatically instead of lingering.
- The endpoint enforces the production proxy contract: it requires the `X-aws-proxy-auth` token from
  `CreateMicrovmAuthToken` (`403` otherwise), routes by `X-aws-proxy-port` (default `8080`), strips
  `x-aws-proxy-*`, and injects `x-amzn-requestid`.
- **Hot reload** rebuilds the image on file changes; **new** `RunMicrovm` calls pick up the rebuild
  (already-running instances keep their image).
- **IAM emulation** still applies — each container runs as the assumed execution role unless
  `--no-assume-role`.

The emulator does not validate request signatures and does not emulate network isolation or service quotas.

---

## Scripting Without the CLI

If you need to drive MicroVM instances from your own scripts or CI pipelines, the underlying AWS data-plane calls are:

1. **Start** — `aws lambda-microvms run-microvm --image-identifier <ImageArn> --execution-role-arn <ExecutionRoleArn> ...`
2. **Wait** — verify readiness by sending an authenticated request to the instance's endpoint with retry/backoff (see [Eventual consistency](#eventual-consistency) below) rather than polling `get-microvm` for `state: RUNNING`
3. **Token** — `aws lambda-microvms create-microvm-auth-token --microvm-identifier <id> --allowed-ports '[{"port":8080}]' ...`
4. **Request** — `curl -H "X-aws-proxy-auth: <token>" -H "X-aws-proxy-port: 8080" "https://<endpoint>/hello"`
5. **Terminate** — `aws lambda-microvms terminate-microvm --microvm-identifier <id>`

The `<ImageArn>` value is the `<Name>ImageIdentifier` CloudFormation stack output (despite the CLI flag name, it takes the image identifier). The execution role ARN is the `<Name>ExecutionRoleArn` stack output.

> **Caller IAM — passing network connectors:** `run-microvm` attaches network connectors to each instance (an HTTP-ingress connector so the platform can deliver hooks and proxy requests, plus any egress connector), and the caller must be allowed to pass each one. Grant `lambda:PassNetworkConnector` for every connector ARN you attach — for example `arn:aws:lambda:<region>:aws:network-connector:aws-network-connector:HTTP_INGRESS` and `…:INTERNET_EGRESS`. A missing grant surfaces as an `AccessDeniedException` that names `PassNetworkConnector` and the specific connector; add the permission for the named connector to resolve it. This is in addition to `iam:PassRole` for the execution role.

### Eventual consistency

After launching an instance, don't poll `get-microvm` waiting for a ready state — its `state` field is [eventually consistent](https://docs.aws.amazon.com/lambda/latest/dg/microvms-images.html) and can lag behind reality. Instead, verify readiness by sending an authenticated request against the instance's endpoint with retry/backoff, and treat a successful response as the readiness signal. A `502` in the first few seconds after launch is expected while the snapshot restores — retry rather than treating it as a hard failure.

### Shell access

To get an interactive shell inside a running instance, launch it with the `SHELL_INGRESS` connector attached — `arn:aws:lambda:<region>:aws:network-connector:aws-network-connector:SHELL_INGRESS` in the instance's ingress network connectors. Connectors are fixed at launch, so include this up front if you expect to need shell access; you can't attach it to an already-running instance.

Mint a shell token:

```bash
aws lambda-microvms create-microvm-shell-auth-token \
  --microvm-identifier <microvm-id> --expiration-in-minutes 15
```

Then connect either via the AWS console's "Connect" button on the MicroVM detail page, or any WebSocket client using subprotocols `lambda-microvms`, `lambda-microvms.authentication.<token>`, and `lambda-microvms.port.8022`.

The shell lands in the same container as your application — same filesystem, processes, and network. The caller additionally needs `lambda:CreateMicrovmShellAuthToken`. Treat the token as a secret: keep the expiration short.

### Instance lifecycle and idle policy

A running instance moves through `RUNNING → SUSPENDED → TERMINATED`. The **idle policy** you pass to `run-microvm` controls the two automatic gates between those states — they run **in sequence**, not as alternatives:

<!-- prettier-ignore -->
```
            idle for maxIdleDurationSeconds          suspended for suspendedDurationSeconds
   RUNNING ─────────────────────────────────▶ SUSPENDED ──────────────────────────────────▶ TERMINATED
      ▲                                            │
      └──────────── request arrives ──────────────┘   (only when autoResumeEnabled: true)
```

| Field                      | Meaning                                                                | AWS default |
| -------------------------- | ---------------------------------------------------------------------- | ----------- |
| `maxIdleDurationSeconds`   | How long an instance may stay idle while `RUNNING` before it suspends  | 300         |
| `suspendedDurationSeconds` | How long an instance stays `SUSPENDED` before it terminates            | 300         |
| `autoResumeEnabled`        | Whether inbound traffic resumes a suspended instance back to `RUNNING` | —           |

So an idle instance is reclaimed after roughly `maxIdleDurationSeconds + suspendedDurationSeconds`. Pass `maximumDurationInSeconds` (max **28,800** — 8 hours) as a hard ceiling that applies regardless of activity.

> **"Idle" means no inbound traffic at the MicroVM's endpoint URL — not "no code running."** AWS measures idle time by requests arriving at the endpoint, so the timer resets on each request and is unaffected by what your code is doing. A worker that does only outbound work (for example, polls a queue, runs a task, then exits) looks idle to the policy even while it is busy. For workers like that, rely on the process exiting — or on `maximumDurationInSeconds` — to end the instance, and give `maxIdleDurationSeconds` enough headroom that an actively-working instance is never suspended out from under itself.

Setting `suspendedDurationSeconds: 0` skips the suspended window entirely — the instance terminates immediately on suspend instead of waiting there. And `autoResumeEnabled` only revives a `SUSPENDED` instance; it never brings back one that has already reached `TERMINATED`.

### Worker patterns

Which of these applies to your worker depends on one question: **will this instance be needed again, and is its in-memory/disk state worth keeping?** While suspended, full memory and disk state is preserved and compute billing stops — you pay only snapshot storage — so suspension is the tool for "yes"; exiting/terminating is the tool for "no".

**One-shot — exit when done.** For a worker that handles exactly one unit of work and never needs its state again, do the work and exit the process; a process exit terminates the instance immediately regardless of idle policy. Don't lean on the idle policy here — it cuts both ways for an outbound-only worker, since the idle timer only sees inbound traffic: it never fires on its own, but it can also fire against you, suspending a busy instance mid-work once `maxIdleDurationSeconds` elapses. Either omit `idlePolicy` from the `run-microvm` call to turn off automatic suspension entirely, or set `maxIdleDurationSeconds` above the longest unit of work.

**Session — suspend on idle, auto-resume on traffic.** For an instance that serves inbound requests with gaps between them (an agent session, a notebook/REPL, a per-user dev environment), suspension is the point of MicroVMs — don't exit between requests. Launch with `idlePolicy: { autoResumeEnabled: true, ... }`: after `maxIdleDurationSeconds` without inbound traffic the instance suspends, and the next inbound request resumes it automatically — the platform holds that request during the resume and delivers it once the app is back, returning `502` only if the resume itself fails. Treat `suspendedDurationSeconds` as the session-retention window: how long a user can stay away before the instance terminates and its state is gone for good.

**Orchestrated — explicit suspend/resume.** When your own code knows the activity boundaries better than the idle timer does (an agent waiting on human approval, a worker paused between queue drains), drive the lifecycle directly from outside the instance:

```bash
aws lambda-microvms suspend-microvm --microvm-identifier <id>  # state kept, compute billing stops
aws lambda-microvms resume-microvm  --microvm-identifier <id>  # continues exactly where it left off
```

This works even for outbound-only workers whose idle timer never fires. The call must come from outside the instance — there is no self-suspend from inside a MicroVM. This requires `lambda:SuspendMicrovm` / `lambda:ResumeMicrovm` on the caller.

Across all three patterns, `maximumDurationInSeconds` (max **28,800** seconds, counted across `RUNNING` **and** `SUSPENDED` time combined) remains the hard ceiling — after that the instance terminates regardless of activity.

---

## Cleanup

Remove all sandbox resources (MicroVM image, IAM roles, network connector, and the rest of the CloudFormation stack):

```bash
serverless remove
```

> **Note:** Terminate any running MicroVM instances before removing the stack. Active instances reference the `MicrovmImage` resource and may block deletion.

---

## Complete Example

```yml
service: my-sandbox-service
frameworkVersion: '4'

provider:
  name: aws
  region: us-east-1

sandboxes:
  api:
    artifact: ./app # directory with a Dockerfile
    minimumMemory: 2048 # MiB
    description: 'HTTP API sandbox'
    environment:
      LOG_LEVEL: info
      PORT: '8080'
    hooks:
      port: 9000 # hook server port inside the container
      ready: true # image-build hook with defaults
      run:
        timeout: 2 # runtime hook: called on each new instance
    vpc:
      subnetIds:
        - subnet-0abc1234
      securityGroupIds:
        - sg-0aabbccdd
      protocol: ipv4
    iam:
      executionRole:
        statements:
          - Effect: Allow
            Action: ['dynamodb:GetItem', 'dynamodb:PutItem']
            Resource: !GetAtt DataTable.Arn
    tags:
      team: platform
      env: production
```
