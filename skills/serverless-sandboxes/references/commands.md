# CLI commands for sandboxes

Two command surfaces apply to a sandbox: the Serverless Framework CLI
(deploy, invoke, logs, dev, rollback, remove) and the AWS CLI against the
Lambda MicroVMs and Lambda control planes (`aws lambda-microvms`,
`aws lambda-core`) for direct instance and connector operations.

## Framework CLI

### `serverless deploy`

Builds the sandbox's image in the cloud — this is a real Firecracker
snapshot build and takes minutes, not seconds. Let it run; the in-cloud
build continues even if you kill the CLI — retrying can't speed it up and
may collide with the in-progress stack update.

If the sandbox's `observability` block has its dashboard enabled, the
deploy summary includes a `dashboard:` line with the CloudWatch console URL
for the service-level dashboard. A bare `serverless package` never triggers
this — the dashboard URL only appears on `deploy`.

Artifacts are content-addressed: deploying again with no change to the
uploaded zip or Dockerfile content is a no-op and skips the rebuild. Any
change to the artifact — even one that produces byte-identical output under
a different reference — is enough to trigger a new build.

If a deploy fails on the image build, inspect the underlying build record
for the specific error code:

```bash
aws lambda-microvms list-microvm-image-builds \
  --image-identifier <image-arn> --image-version <version> \
  --query 'items[].[architecture,buildState,stateReason]' --output table
```

`stateReason` carries the specific error; cross-reference
`references/troubleshooting.md`.

### `serverless invoke --sandbox <name> [--method GET --path /]`

```bash
serverless invoke --sandbox app --method GET --path /health
```

`--sandbox <name>` is required on every call, even when the service defines
only one sandbox — there is no implicit default the way there can be for a
single function. Omitting it fails with a "specify which sandbox" error
listing the available names.

Each invocation launches a fresh MicroVM instance, waits for it to reach
`RUNNING`, sends the one HTTP request, and terminates the instance
afterward — it is not a way to reach a long-lived, already-running
instance. Use `--method` (default `GET`) and `--path` (default `/`) to
shape the request; pass `--data` for a body on non-`GET` methods. `--port`
selects which container port to call (default `8080`).

The framework launches this one-shot instance with an injected idle policy
(`maxIdleDurationSeconds: 60`, `suspendedDurationSeconds: 0`,
`autoResumeEnabled: false`), so even if the CLI is interrupted mid-invoke
the instance self-terminates about a minute later — nothing to configure,
nothing leaks.

### `serverless logs --sandbox <name> [--startTime 30m]`

```bash
serverless logs --sandbox app
serverless logs --sandbox app --startTime 30m
```

`--sandbox <name>` is required, same rule as `invoke`. The default window
is the **last 10 minutes** — pass `--startTime` to widen it, either as a
relative offset (e.g. `30m`, `2h`, `1d`) or an absolute timestamp. There is
no `--tail`/follow mode for sandbox logs: passing `--tail` is accepted but
ignored with a warning, and the command always prints the resolved window
and exits rather than streaming.

The log group also receives the in-cloud image-build transcript alongside your application's runtime stdout and stderr, so build output (e.g., Docker BuildKit stages) may appear interleaved with your container's request logs — match on your application's own log lines when judging behavior.

### `serverless dev --sandbox <name>`

Runs the sandbox locally against an emulator instead of deploying. See
`references/dev-mode.md` for the full loop (piping output, driving the
emulator with the AWS CLI, reading the log markers, IAM emulation).

### `serverless deploy list` / `serverless rollback --timestamp <ts>`

```bash
serverless deploy list
serverless rollback --timestamp <ts>
```

Both work for sandboxes with no special casing — they use the same
deployment-history mechanism as the rest of the framework. Because
artifacts are content-addressed, old images are not deleted as new ones are
deployed; they accumulate and remain available to roll back to until
`serverless remove` tears down the stack.

### `serverless remove`

Tears down the sandbox's stack, including the log group the sandbox owns
(the CloudWatch log group is a stack resource, not retained separately —
removing the stack removes the logs with it).

Terminate any running MicroVM instances first. An instance that is still
`RUNNING` or `SUSPENDED` references the image it was launched from, and an
active reference can block the image resource from being deleted during
stack removal. Use `aws lambda-microvms list-microvms` to find instances
against the sandbox's image and `terminate-microvm` on each before removing.

### `serverless info --json`

Every sandbox exposes its stack outputs under the logical ID of its image
and execution role, not a fixed name — read them instead of hard-coding a
logical ID that can change between services:

- `<Name>ImageIdentifier` — the image ARN. Pass this value as
  `imageIdentifier` to `run-microvm`, `get-microvm`, and `list-microvms
  --image-identifier`.
- `<Name>ExecutionRoleArn` — the IAM role instances of this sandbox run as.

```bash
serverless info --json | jq -r '.outputs[] | select(.OutputKey=="<Name>ImageIdentifier").OutputValue'
```

Substitute the sandbox's actual logical-ID prefix for `<Name>` — it derives
from the sandbox name, not a constant string.

## AWS CLI

### `aws lambda-microvms`

Direct control-plane operations against MicroVM instances and images. All
of these accept `--endpoint-url` (or `AWS_ENDPOINT_URL_LAMBDA_MICROVMS`) to
target the local `dev` emulator instead of the real service — see
`references/dev-mode.md`.

- **`run-microvm`** — launch a new instance from an image identifier.
  Returns `microvmId`, `state`, and the proxied `endpoint`.
- **`get-microvm --microvm-identifier <id>`** — fetch current state. On an
  unexpected `TERMINATED` state, check `stateReason` — it names which hook
  failed (or which idle/duration limit was hit) rather than leaving you to
  guess.
- **`list-microvms --image-identifier <arn> --query 'items[].[microvmId,state]'`**
  — list instances for a given image. The response's list key is `items`
  (not `microvms` or `instances`) — the `--query` above reflects that.
- **`suspend-microvm`** / **`resume-microvm`** — manually move an instance
  between `RUNNING` and `SUSPENDED` outside the automatic idle policy.
- **`terminate-microvm --microvm-identifier <id>`** — stop an instance for
  good; do this before `serverless remove` for any instance still
  referencing the sandbox's image.
- **`create-microvm-auth-token --microvm-identifier <id> --expiration-in-minutes <n> --allowed-ports <spec>`**
  — mint the token required in the `X-aws-proxy-auth` header to call an
  instance's endpoint directly.
- **`run-microvm --logging '{"cloudWatch":{"logGroup":"..."}}'`** —
  redirects a single instance's runtime logs to a custom log group.

Every image version bills snapshot storage for as long as it exists,
including `INACTIVE` ones — prune old versions with
`delete-microvm-image-version`. The last remaining version can only be
removed via `delete-microvm-image`.

### Shell access (debugging a running instance)

To get an interactive shell inside a running instance of your deployed
sandbox, launch it with the `SHELL_INGRESS` connector attached —
`arn:aws:lambda:<region>:aws:network-connector:aws-network-connector:SHELL_INGRESS`
in `ingressNetworkConnectors`. Connectors are fixed at launch: you can't add
this to an already-running instance, so include it up front if you expect
to need shell access.

Mint a shell token:

```bash
aws lambda-microvms create-microvm-shell-auth-token \
  --microvm-identifier <microvm-id> --expiration-in-minutes 15
```

Then connect either via the AWS console's "Connect" button on the MicroVM
detail page, or any WebSocket client using subprotocols
`lambda-microvms`, `lambda-microvms.authentication.<token>`,
`lambda-microvms.port.8022`.

The shell lands in the same container as your application — same
filesystem, processes, network. Caller IAM additionally needs
`lambda:CreateMicrovmShellAuthToken`. Treat the token as a secret: keep the
expiration short (≤60 min).

### `aws lambda-core create-network-connector`

Creates an `AWS::Lambda::NetworkConnector` for VPC egress independently of
a `serverless deploy` (the framework creates one automatically when a
sandbox's `vpc` block is set — see `references/config.md`). The operator
role that calls this needs the `AWSLambdaNetworkConnectorOperatorPolicy`
managed policy attached.
