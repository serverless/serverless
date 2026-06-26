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

The Serverless Framework v4 `sandboxes` top-level property handles deployment and runtime invocation. `serverless deploy` builds the MicroVM image and registers it with AWS; `serverless invoke --sandbox <name>` starts a fresh instance, runs your request, and terminates the instance when done (see [Invoking a Sandbox](#invoking-a-sandbox)). Logs are accessible via `serverless logs --sandbox <name>` (see [Logs](#logs)).

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

---

## Configuration Reference

All sandboxes are defined under the top-level `sandboxes` key. Each key is the sandbox name; its value is a configuration object.

```yml
sandboxes:
  <name>:
    # required
    artifact: <string>

    # optional
    memory: 512 | 1024 | 2048 | 4096 | 8192
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
| `memory`         | number            | `2048`           | Minimum memory in MiB. Must be one of: `512`, `1024`, `2048`, `4096`, `8192`. The MicroVM image name is derived from the service name, sandbox key, and stage.                                                                                                                                                                                                                                                              |
| `description`    | string            | auto             | Human-readable description embedded in the CloudFormation resource.                                                                                                                                                                                                                                                                                                                                                         |
| `environment`    | object            | `{}`             | Environment variables injected into the MicroVM at runtime. Values must be strings.                                                                                                                                                                                                                                                                                                                                         |
| `osCapabilities` | array             | `[]`             | Additional OS capabilities granted to the container. Accepted value: `all` (case-insensitive).                                                                                                                                                                                                                                                                                                                              |
| `hooks`          | object            | `{}`             | Lifecycle hook configuration. See [Hooks](#hooks).                                                                                                                                                                                                                                                                                                                                                                          |
| `vpc`            | object            | —                | VPC egress configuration. See [Networking / VPC](#networking--vpc).                                                                                                                                                                                                                                                                                                                                                         |
| `iam`            | object            | —                | IAM role customisation. See [IAM](#iam).                                                                                                                                                                                                                                                                                                                                                                                    |
| `observability`  | boolean \| object | `true`           | Controls the owned log group, error metric filter, CloudWatch dashboard, and optional alarms. `true` (default) enables metrics and dashboard; `false` opts out of metrics and dashboard (log group is still created). Object form accepts `logs`, `metrics`, `alarms`, and `dashboard` sub-blocks. Alarms require `observability.alarms.notify` (SNS topic ARN or CloudFormation ref). See [Observability](#observability). |
| `tags`           | object            | —                | Key/value tags applied to every taggable resource the sandbox creates (image, log group, IAM roles, alarms, network connector). Values must be strings.                                                                                                                                                                                                                                                                                                                                 |

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

      # Image-build hooks — called once when the MicroVM image is built
      ready:
        timeout: 30 # seconds; default 30
      validate:
        timeout: 30 # seconds; default 30

      # Runtime hooks — called on each instance lifecycle event
      run:
        timeout: 2 # seconds; default 2
      resume:
        timeout: 2 # seconds; default 2
      suspend:
        timeout: 5 # seconds; default 5
      terminate:
        timeout: 5 # seconds; default 5
```

You can also enable a hook with just `true` to accept all defaults:

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

### Hook HTTP contract

The Lambda runtime posts to:

```
POST http://localhost:<port>/aws/lambda-microvms/runtime/v1/<hook-name>
```

Your server must respond with HTTP 200 within the configured timeout. A non-200 response or timeout causes the lifecycle step to fail. A minimal Python implementation:

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
      subnets:
        - subnet-0abc1234
        - subnet-0def5678
      securityGroups:
        - sg-0aabbccdd
      protocol: ipv4 # 'ipv4' (default) or 'dualstack'
```

| Property         | Type     | Default | Description                                            |
| ---------------- | -------- | ------- | ------------------------------------------------------ |
| `subnets`        | string[] | —       | List of subnet IDs for the network connector.          |
| `securityGroups` | string[] | —       | List of security group IDs for the network connector.  |
| `protocol`       | string   | `ipv4`  | IP protocol: `ipv4` or `dualstack` (case-insensitive). |

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

**Execution role** (`AWS::IAM::Role` — `<Name>ImageExecutionRole`)

Permissions:

- `logs:CreateLogGroup`, `logs:CreateLogStream`, `logs:PutLogEvents` on `/aws/lambda-microvms/*`

Both roles use a trust policy for `lambda.amazonaws.com` with an `aws:SourceAccount` condition to prevent confused-deputy attacks.

### Customising auto-generated roles

Pass an `iam.buildRole` or `iam.executionRole` customisation object to extend the generated role without replacing it:

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

Supported customisation keys:

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

| Resource                        | Type                            | Condition                                      |
| ------------------------------- | ------------------------------- | ---------------------------------------------- |
| `<Name>Image`                   | `AWS::Lambda::MicrovmImage`     | Always                                         |
| `<Name>ImageBuildRole`          | `AWS::IAM::Role`                | Unless `iam.buildRole` is an external ref      |
| `<Name>ImageExecutionRole`      | `AWS::IAM::Role`                | Unless `iam.executionRole` is an external ref  |
| `<Name>Connector`               | `AWS::Lambda::NetworkConnector` | Only when `vpc` is set                         |
| `<Name>ConnectorOperatorRole`   | `AWS::IAM::Role`                | Only when `vpc` is set                         |
| `<Name>ImageLogGroup`           | `AWS::Logs::LogGroup`           | Always                                         |
| `<Name>Image<Filter>MetricFilter` | `AWS::Logs::MetricFilter`     | One per `observability.metrics.filters` entry (default `errors`) |
| `<Name>Image<Filter>Alarm`      | `AWS::CloudWatch::Alarm`        | One per filter, only when `observability.alarms.notify` is set |
| `SandboxesDashboard`            | `AWS::CloudWatch::Dashboard`    | One **per service** (not per sandbox), when any sandbox has the dashboard enabled |

Stack outputs:

| Output key           | Value                                                  |
| -------------------- | ------------------------------------------------------ |
| `<Name>ImageArn`     | ARN of the `MicrovmImage` resource                     |
| `<Name>ConnectorArn` | ARN of the `NetworkConnector` (only when `vpc` is set) |

CloudWatch logs are always shipped to the owned log group `/aws/lambda-microvms/<image-name>` (default 14-day retention). See [Observability](#observability).

The MicroVM image is always built on `ARM_64` architecture. The base image is resolved to the latest `al2023` version at deploy time.

---

## Invoking a Sandbox

```bash
serverless invoke --sandbox <name> [--path <path>] [--method <method>] [--data '<body>'] [--port <port>]
```

`--sandbox <name>` is required and identifies which sandbox to invoke (analogous to `--function` for Lambda invocations). The framework:

1. Starts a fresh MicroVM instance using the sandbox's deployed image ARN and execution role.
2. Polls until the instance state is `RUNNING`.
3. Mints a short-lived auth token for the target port.
4. Sends the HTTP request through the AWS proxy.
5. Prints the response body.
6. **Always terminates the instance** when done, regardless of success or failure.

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

> **Note:** `--tail` follow mode is not yet supported. The command prints the recent log window and exits.

---

## Observability

Observability is **on by default**. Every sandbox automatically gets a CloudWatch log group, an error metric filter, and a section in the service's CloudWatch dashboard (one dashboard per service). You do not need to add anything to `serverless.yml` to enable monitoring.

### Log group

The framework creates and owns the `AWS::Logs::LogGroup` for each sandbox — `/aws/lambda-microvms/<image-name>` — with a default retention of **14 days**. Owning the group means retention is enforced and the group is removed when you run `serverless remove`. The group is created before the MicroVM image build runs so that retention applies from the first log event.

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

| Resource                        | Type                         | Condition                          |
| ------------------------------- | ---------------------------- | ---------------------------------- |
| `<Name>ImageLogGroup`           | `AWS::Logs::LogGroup`        | **Always**                         |
| `<Name>Image<Filter>MetricFilter` | `AWS::Logs::MetricFilter`  | One per `metrics.filters` entry (default `errors`) |
| `<Name>Image<Filter>Alarm`      | `AWS::CloudWatch::Alarm`     | One per filter, only when `alarms.notify` is set |
| `SandboxesDashboard`            | `AWS::CloudWatch::Dashboard` | One **per service** when any sandbox has the dashboard enabled |

### Limitations

**Silent process death is not detected.** The error metric filter matches log content. If the MicroVM process crashes without writing a log line containing `error`, `exception`, or `fail`, the alarm will not fire. Detecting hard-down instances requires a synthetic probe or a proxy-layer health check, which is out of scope for this release.

### Cost

Metric filters are free. Each derived metric costs approximately $0.30/month. CloudWatch **dashboards are free for the first three per account**, then approximately **$3/month each**. The framework creates **one dashboard per service** (shared by all its sandboxes), so a multi-sandbox service still only adds a single dashboard. If your account already has three or more dashboards, set `observability: false` or `dashboard.enabled: false` (on every sandbox) to avoid the charge.

---

## Local development (`serverless dev`)

Run a sandbox container locally for a fast inner loop:

```bash
serverless dev --sandbox app          # --sandbox optional when only one is defined
serverless dev --mode sandboxes       # equivalent; auto-detected when the service has only sandboxes
serverless dev --sandbox app --port 9090   # map the container's :8080 to a host port
```

`dev` builds the sandbox's `Dockerfile` locally, runs it as a container, maps the
app port (8080) to your host, and streams container logs. Press Ctrl-C to stop and
remove the container.

> **Note:** `dev` requires a local Docker daemon and a local `artifact` directory
> containing a `Dockerfile`. A sandbox whose `artifact` is an `s3://` zip cannot be
> run with `dev` — use a local directory for the dev loop.

> The dev loop already runs under the sandbox's real execution role (see [IAM
> emulation](#iam-emulation) below). Higher-fidelity features still in progress:
> the production proxy/auth contract and network egress isolation.

### Hot reloading

`serverless dev --sandbox <name>` watches the sandbox's build-context directory (the
`artifact` directory — the Dockerfile and your sources). When a file changes, the image
is rebuilt and the container is restarted automatically on the same port, so you can
iterate without re-running the command.

- Framework and tooling directories are ignored, including `.serverless`,
  `node_modules`, `.git`, virtualenv/cache directories, and test files
  (`*.test.js`, `*.spec.js`, `*_test.py`, `*.test.py`).
- If a rebuild fails (for example, a Docker build error), the previous container keeps
  running and the error is printed — the dev session stays up so you can fix the issue
  and save again.
- Press `Ctrl-C` to stop; the container is removed on exit.

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
- **Caveat:** an app that reads credentials directly from the instance metadata service
  (`169.254.169.254`) bypasses the injected credentials; only the AWS SDK default
  credential chain picks them up.

---

## Scripting Without the CLI

If you need to drive MicroVM instances from your own scripts or CI pipelines, the underlying AWS data-plane calls are:

1. **Start** — `aws lambda-microvms run-microvm --image-identifier <ImageArn> --execution-role-arn <ExecutionRoleArn> ...`
2. **Wait** — poll `aws lambda-microvms get-microvm --microvm-identifier <id>` until `state` is `RUNNING`
3. **Token** — `aws lambda-microvms create-microvm-auth-token --microvm-identifier <id> --allowed-ports '[{"port":8080}]' ...`
4. **Request** — `curl -H "X-aws-proxy-auth: <token>" -H "X-aws-proxy-port: 8080" "https://<endpoint>/hello"`
5. **Terminate** — `aws lambda-microvms terminate-microvm --microvm-identifier <id>`

The `<ImageArn>` is the `<Name>ImageArn` CloudFormation stack output. The execution role ARN is available in the stack resources as `<Name>ImageExecutionRole`.

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
    memory: 2048 # MiB
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
      subnets:
        - subnet-0abc1234
      securityGroups:
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
