# The `sandboxes` config surface

Each entry under the top-level `sandboxes:` block describes one sandbox by
name. The schema is strict — `additionalProperties: false` at both the
per-sandbox level and inside every nested object (`hooks`, `vpc`, `iam`,
`observability`, and its sub-blocks). An unrecognized key is a validation
error, not a warning.

Names here differ from the `functions` block by design — `sandboxes` is not
`functions` with new labels, it is its own schema. In particular:
`minimumMemory` (not `memorySize`), and `vpc.subnetIds` / `vpc.securityGroupIds`
(not `subnets` / `securityGroups`). Don't carry a `functions` property name
over by analogy; check this table first.

## Properties

| Property | Type | Required | Default | Notes |
|---|---|---|---|---|
| `artifact` | string | yes | — | Local directory containing a `Dockerfile`, or an `s3://` zip URI. Any other URI form (e.g. an ECR reference) is rejected — Lambda MicroVMs does not support container-registry artifacts. |
| `minimumMemory` | enum | no | `2048` | One of `512 \| 1024 \| 2048 \| 4096 \| 8192` (MiB). vCPU count is memory-in-GB ÷ 2. Architecture is fixed at ARM64/Graviton. Instances may burst up to 4× their baseline vCPU. Disk scales with the tier: 8 GB disk at ≤2 GB memory, 16 GB disk at 4 GB memory, 32 GB disk at 8 GB memory. |
| `description` | string | no | `"<service> <name> sandbox (Serverless Framework)"` | Free-text image description. |
| `environment` | object (string values) | no | `{}` | Environment variables baked into the image at build time. Identical for every instance booted from that image — there is no per-instance environment override; instance-specific data goes through the `run` hook payload instead. |
| `tags` | object (string values) | no | `{}` | Applied to the sandbox's taggable resources. |
| `hooks` | object | no | — | See `## Hooks` below. |
| `vpc` | object | no | — | See `## VPC` below. |
| `observability` | boolean or object | no | on (equivalent to omitted/`true`) | See `## Observability` below. `false` disables the owned logging/metrics/dashboard layer entirely. |
| `iam` | object | no | — | See `## IAM` below. |

## Minimal config

```yaml
sandboxes:
  app:
    artifact: ./app
```

## Full-surface example

Mirrors the shape of the `complete` example in the examples gallery
(`https://github.com/serverless/examples/tree/v4/sandboxes/complete`) — every
top-level and nested property in one place, not a recommended starting point.

```yaml
sandboxes:
  app:
    artifact: ./app
    minimumMemory: 4096
    description: Interactive code-execution sandbox
    environment:
      LOG_LEVEL: debug
    tags:
      team: platform
    hooks:
      port: 9000
      ready: true
      validate:
        timeout: 30
      run:
        timeout: 5
      resume:
        timeout: 5
      suspend:
        timeout: 10
      terminate:
        timeout: 10
    vpc:
      subnetIds:
        - subnet-xxxxxxxx
      securityGroupIds:
        - sg-xxxxxxxx
      protocol: ipv4
    observability:
      logs:
        retentionDays: 30
      metrics:
        filters:
          errors: '%ERROR%'
      alarms:
        notify: arn:aws:sns:us-east-1:111122223333:sandbox-alerts
        thresholds:
          errors:
            threshold: 5
            period: 300
      dashboard:
        enabled: true
    iam:
      executionRole:
        statements:
          - Effect: Allow
            Action:
              - s3:GetObject
            Resource: arn:aws:s3:::example-bucket/*
```

## Hooks

`hooks` configures the HTTP endpoints your artifact exposes for the platform
to call back into, plus the `port` they listen on (default `9000` if
omitted).

Two lifecycle groups:

- **Build-time (image) hooks** — `ready`, `validate`. Called while the image
  is being built from your artifact.
- **Runtime (per-instance) hooks** — `run`, `resume`, `suspend`, `terminate`.
  Called against a running instance as it moves through its lifecycle.

Declaring **any** runtime hook auto-enables `ready` even if you didn't list
it explicitly — the platform needs a build-time readiness signal before it
will boot instances from that image.

Each hook's value is either `true` (enable with the default timeout) or an
object with a custom `{ timeout: <seconds> }`.

Handler contract: answer the hook's HTTP call with a fast `200` and do any
heavy work asynchronously after responding — don't block the response on
long-running setup. The `ready` hook is the one exception: it may respond
`503` to mean "not ready yet, retry me" and the platform will keep retrying
until the hook's timeout elapses.

## VPC

`vpc` attaches the sandbox to a network:

- `subnetIds` — subnets to place instances in. All subnets must belong to a
  single VPC.
- `securityGroupIds` — security groups to attach.
- `protocol` — `ipv4` or `dualstack`.

Pick subnets by **AZ ID** (e.g. `use1-az3`), not by availability-zone name —
AZ names are account-specific aliases and don't reliably map to the same
underlying AZ ID across accounts. Some AZs do not support MicroVMs, and AWS
does not publish a list of which ones — `use1-az3` in `us-east-1` is a
live-verified example of an unsupported AZ ID. If a deploy fails with a
capacity or placement error tied to a subnet, see `references/troubleshooting.md`
for the full diagnostic flow.

## Observability

Observability is **on by default** — omitting the key, or setting it to
`true`, gives you:

- A dedicated log group at `/aws/lambda-microvms/<image-name>`, retained for
  14 days.
- An error metric filter over that log group.
- A per-service CloudWatch dashboard.
- The dashboard's console URL printed at the end of `serverless deploy`.

Set `observability: false` to opt out of this layer entirely (the sandbox
still runs; you just lose the owned logging/metrics/dashboard resources).

To customize instead of disabling, use the nested object form:

- `logs.retentionDays` — override the 14-day default.
- `metrics.filters` — a map of filter name → CloudWatch Logs filter pattern,
  replacing the default error filter.
- `alarms.notify` — required to enable alarms at all; an SNS topic ARN (or
  equivalent reference) to notify.
- `alarms.thresholds` — per-filter overrides, each an object with
  `{ threshold, period }` (plus advanced fields like `evaluationPeriods`,
  `datapointsToAlarm`, `comparisonOperator`, `treatMissingData`).
- `dashboard.enabled` — turn the per-service dashboard off without touching
  logs or metrics.

## IAM

`iam.executionRole.statements` and `iam.executionRole.managedPolicies` are
merged into the least-privilege execution role the framework generates for
the sandbox — they extend it, they don't replace it. Add only the specific
per-sandbox statements your instance code needs (e.g. access to one bucket
or table); never point `executionRole` at a broad, pre-existing role as a
shortcut. The same shape (`statements` / `managedPolicies`) is also available
under `iam.buildRole` for permissions needed only during the image build.
