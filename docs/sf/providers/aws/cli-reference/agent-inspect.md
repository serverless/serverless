<!--
title: Serverless Framework Commands - AWS Lambda - Agent Inspect
description: Give an AI coding agent the live AWS configuration of a deployed service's resources in one read-only call.
short_title: Commands - Agent Inspect
keywords:
  [
    'Serverless',
    'Framework',
    'AWS',
    'Lambda',
    'Agent Inspect',
    'AI Agents',
    'CloudFormation',
    'IAM Policy',
  ]
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/aws/cli-reference/agent-inspect)

<!-- DOCS-SITE-LINK:END -->

# AWS - Agent Inspect

`serverless agent inspect` gives an AI coding agent the live AWS
configuration of a deployed service's resources in one read-only call. An
agent debugging or operating a service from a terminal would otherwise have
to issue dozens of separate `aws describe-*` calls and reassemble the
logical-to-physical mapping itself; `agent inspect` does that in a single
command, organized by the same logical model the framework uses in
`serverless.yml`.

By default it returns a cheap categorized index — every deployed resource
with its logical ID, physical ID, type, and status — with no per-resource
AWS calls. You expand only the categories or services you actually need,
which keeps the call fast and the output bounded.

This command is entirely **read-only**: it never creates, modifies, or
deletes anything, and it never invokes a function.

## Usage

The bare command returns the index:

```bash
serverless agent inspect
```

Expand a category to get the full, raw AWS configuration for every resource
in it:

```bash
serverless agent inspect --functions
```

Expand by AWS service instead of (or in addition to) category:

```bash
serverless agent inspect --aws-services lambda,iam
```

Category flags and `--aws-services` combine as a **union** — this returns
every Lambda resource plus every S3 resource:

```bash
serverless agent inspect --functions --aws-services s3
```

Narrow to one or more named resources with repeatable `--name`:

```bash
serverless agent inspect --name createOrder --name getOrder
```

Get human-friendly YAML instead of JSON:

```bash
serverless agent inspect --functions --format yaml
```

Expand every supported category in one call:

```bash
serverless agent inspect --all
```

### Sample index output

A trimmed example of the bare-command envelope:

```json
{
  "service": "orders-api",
  "stage": "dev",
  "region": "us-east-1",
  "stackName": "orders-api-dev",
  "mode": "index",
  "hint": "Expand with category flags (--functions, --api, --events, --iam, --storage, --observability, --cdn, --identity, --iot, --sandboxes), --aws-services <names>, or --all. Add --name <logicalId> to scope to one resource.",
  "resources": {
    "functions": [
      {
        "logicalId": "CreateOrderLambdaFunction",
        "physicalId": "orders-api-dev-createOrder",
        "type": "AWS::Lambda::Function",
        "status": "UPDATE_COMPLETE",
        "awsService": "lambda"
      }
    ],
    "iam": [
      {
        "logicalId": "IamRoleLambdaExecution",
        "physicalId": "orders-api-dev-us-east-1-lambdaRole",
        "type": "AWS::IAM::Role",
        "status": "CREATE_COMPLETE",
        "awsService": "iam"
      }
    ],
    "other": []
  }
}
```

Every category key is always present, even when empty, so the shape is
stable across services. Resources of a type `agent inspect` doesn't
describe (e.g. Step Functions state machines, WAF web ACLs, custom
resources) still show up, listed under `other` with just their ID, type,
and status.

## Options

- `--functions`, `--api`, `--events`, `--iam`, `--storage`,
  `--observability`, `--cdn`, `--identity`, `--iot`, `--sandboxes` Expand a
  resource category (combinable; see the Selection model section below).
- `--all` Expand every category.
- `--aws-services` Comma-separated AWS service names to expand (see the
  Selection model section below).
- `--name` Logical ID of a single resource to inspect. Repeatable.
- `--format` Output format: `json` (default, pretty-printed) or `yaml`.
- `--stage` The stage of the deployed service to inspect. Defaults to the
  resolved stage from your configuration, or `dev`.
- `--region` The region of the deployed service to inspect. Defaults to the
  provider region, or `us-east-1`.
- `--aws-profile` The AWS profile to authenticate with, overriding the
  default resolution order.

## Selection model

Resources are selected along two independent axes that both filter the same
internal resource registry. Either axis, or both together, may be used —
when both are given, the result is their **union**, not their intersection.

### Axis 1: category flags

Coarse, framework-shaped groupings. Combine as many as you like.

| Flag              | Covers                                                                                         |
| ----------------- | ---------------------------------------------------------------------------------------------- |
| `--functions`     | Lambda functions (+ versions/aliases/URLs/permissions/event source mappings), layers           |
| `--api`           | API Gateway REST, API Gateway HTTP/WebSocket, and Application Load Balancer front doors        |
| `--events`        | SNS topics, EventBridge rules/buses, Scheduler schedules, SQS queues, Kinesis stream consumers |
| `--iam`           | IAM roles (assume-role policy, inline + attached policies)                                     |
| `--storage`       | S3 buckets, DynamoDB tables                                                                    |
| `--observability` | CloudWatch log groups (+ filters), alarms, dashboards                                          |
| `--cdn`           | CloudFront distributions + cache policies                                                      |
| `--identity`      | Cognito user pools (+ clients)                                                                 |
| `--iot`           | IoT topic rules + provisioning templates                                                       |
| `--sandboxes`     | Lambda MicroVM images + network connectors (Sandboxes, a preview feature)                      |
| `--all`           | Every category above                                                                           |

A resource's supporting infrastructure is categorized by its own type, not
lumped under the parent feature — a function's execution role appears under
`--iam`, and its log group and alarms appear under `--observability`, not
under `--functions`.

### Axis 2: `--aws-services`

Fine-grained selection by AWS SDK service name, as a comma-separated list:

```bash
serverless agent inspect --aws-services lambda,iam,s3
```

Supported tokens: `lambda`, `iam`, `apigateway`, `apigatewayv2`, `sns`,
`eventbridge` (alias `events`), `scheduler`, `s3`, `dynamodb`, `sqs`, `logs`,
`elbv2` (alias `alb`), `cloudfront`, `cognito-idp` (alias `cognito`), `iot`,
`kinesis`, `cloudwatch`.

An unknown token produces a structured error listing the supported service
names — it never silently ignores a typo. Whitespace and trailing commas
are trimmed, and tokens are matched case-insensitively.

Sandboxes (Lambda MicroVMs) resources appear in the index and under
`--sandboxes`, but are not describable in this preview, so
`lambda-microvms` (and its aliases `microvms`/`sandboxes`) is not a valid
`--aws-services` token.

### `--name`

`--name <logicalId>` is repeatable (`--name A --name B` unions the two).
Combined with an axis flag, it narrows the selection to just that resource
within the expanded category. Used **alone**, with no axis flags, it
auto-selects that resource's registry entry — you don't need to also pass
its category or service:

```bash
serverless agent inspect --name createOrder
```

An unknown logical ID produces a structured error listing the valid IDs in
the stack. A `--name` that matches a resource type outside the registry
(the `other` bucket) errors explaining that the type isn't describable.

## Output contract

- **Format:** pretty-printed JSON by default; `--format yaml` gives a
  human-friendly alternate. JSON is the default because it's lossless for
  IAM policy documents, ARNs, and numeric-looking IDs, and it's what an
  agent (and `jq`) expects.
- Exactly **one JSON (or YAML) document** is written to stdout — nothing
  else. Progress and warnings go to stderr only.
- Top level is keyed by category, then by logical resource name, with the
  resource's merged raw AWS SDK response(s) underneath. There is no field
  curation — you get what the underlying `Describe*`/`Get*` calls return
  (with a small set of mechanical normalizations: `$metadata` stripped,
  dates as ISO-8601 strings, and IAM/JSON policy documents decoded and
  parsed into objects instead of left as URL-encoded strings).
- **Exit code 0** on success, including when individual resources failed to
  describe — those show up as `{ "error": "..." }` in their slot rather
  than aborting the run. Partial data is a successful inspect.
- **Non-zero exit** only for fatal problems: an unknown flag, an unknown
  `--aws-services` token, an unknown `--name`, a non-AWS provider, or a
  stack that hasn't been deployed. Fatal errors emit a single structured
  JSON error object on stdout before the non-zero exit.
- **Deterministic ordering:** categories appear in a fixed order and
  resources are sorted by logical ID, so output is byte-stable across runs
  against unchanged infrastructure — useful if you want to diff or cache
  results.

## IAM permissions

`agent inspect` only calls read-only `Describe*`/`Get*`/`List*` AWS APIs —
never anything that creates, modifies, or deletes a resource. The policy
below is the minimal set of actions it needs, generated directly from the
command's internal resource registry (the same table that decides which SDK
calls each resource type triggers), so it can't drift out of sync with what
the command actually calls.

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "AgentInspectDiscovery",
      "Effect": "Allow",
      "Action": ["cloudformation:ListStackResources", "sts:GetCallerIdentity"],
      "Resource": "*"
    },
    {
      "Sid": "AgentInspectLambda",
      "Effect": "Allow",
      "Action": [
        "lambda:GetFunction",
        "lambda:GetFunctionEventInvokeConfig",
        "lambda:GetFunctionUrlConfig",
        "lambda:GetLayerVersion",
        "lambda:GetLayerVersionPolicy",
        "lambda:GetPolicy",
        "lambda:ListAliases",
        "lambda:ListEventSourceMappings",
        "lambda:ListVersionsByFunction"
      ],
      "Resource": "*"
    },
    {
      "Sid": "AgentInspectIam",
      "Effect": "Allow",
      "Action": [
        "iam:GetPolicy",
        "iam:GetPolicyVersion",
        "iam:GetRole",
        "iam:GetRolePolicy",
        "iam:ListAttachedRolePolicies",
        "iam:ListRolePolicies"
      ],
      "Resource": "*"
    },
    {
      "Sid": "AgentInspectApiGateway",
      "Effect": "Allow",
      "Action": "apigateway:GET",
      "Resource": "arn:aws:apigateway:*::/*"
    },
    {
      "Sid": "AgentInspectAlb",
      "Effect": "Allow",
      "Action": [
        "elasticloadbalancing:DescribeRules",
        "elasticloadbalancing:DescribeTargetGroupAttributes",
        "elasticloadbalancing:DescribeTargetGroups",
        "elasticloadbalancing:DescribeTargetHealth"
      ],
      "Resource": "*"
    },
    {
      "Sid": "AgentInspectEventBridge",
      "Effect": "Allow",
      "Action": [
        "events:DescribeEventBus",
        "events:DescribeRule",
        "events:ListTargetsByRule"
      ],
      "Resource": "*"
    },
    {
      "Sid": "AgentInspectSns",
      "Effect": "Allow",
      "Action": [
        "sns:GetTopicAttributes",
        "sns:ListSubscriptionsByTopic",
        "sns:ListTagsForResource"
      ],
      "Resource": "*"
    },
    {
      "Sid": "AgentInspectScheduler",
      "Effect": "Allow",
      "Action": "scheduler:GetSchedule",
      "Resource": "*"
    },
    {
      "Sid": "AgentInspectSqs",
      "Effect": "Allow",
      "Action": "sqs:GetQueueAttributes",
      "Resource": "*"
    },
    {
      "Sid": "AgentInspectS3",
      "Effect": "Allow",
      "Action": [
        "s3:GetBucketAcl",
        "s3:GetBucketCORS",
        "s3:GetBucketLocation",
        "s3:GetBucketNotification",
        "s3:GetBucketPolicy",
        "s3:GetBucketPublicAccessBlock",
        "s3:GetBucketTagging",
        "s3:GetBucketVersioning",
        "s3:GetEncryptionConfiguration",
        "s3:GetLifecycleConfiguration"
      ],
      "Resource": "*"
    },
    {
      "Sid": "AgentInspectDynamoDb",
      "Effect": "Allow",
      "Action": [
        "dynamodb:DescribeContinuousBackups",
        "dynamodb:DescribeTable",
        "dynamodb:DescribeTimeToLive"
      ],
      "Resource": "*"
    },
    {
      "Sid": "AgentInspectLogs",
      "Effect": "Allow",
      "Action": [
        "logs:DescribeLogGroups",
        "logs:DescribeMetricFilters",
        "logs:DescribeSubscriptionFilters",
        "logs:ListTagsLogGroup"
      ],
      "Resource": "*"
    },
    {
      "Sid": "AgentInspectCloudWatch",
      "Effect": "Allow",
      "Action": ["cloudwatch:DescribeAlarms", "cloudwatch:GetDashboard"],
      "Resource": "*"
    },
    {
      "Sid": "AgentInspectCognito",
      "Effect": "Allow",
      "Action": [
        "cognito-idp:DescribeUserPool",
        "cognito-idp:DescribeUserPoolClient",
        "cognito-idp:ListUserPoolClients"
      ],
      "Resource": "*"
    },
    {
      "Sid": "AgentInspectIot",
      "Effect": "Allow",
      "Action": ["iot:DescribeProvisioningTemplate", "iot:GetTopicRule"],
      "Resource": "*"
    },
    {
      "Sid": "AgentInspectKinesis",
      "Effect": "Allow",
      "Action": "kinesis:DescribeStreamConsumer",
      "Resource": "*"
    },
    {
      "Sid": "AgentInspectCloudFront",
      "Effect": "Allow",
      "Action": ["cloudfront:GetCachePolicy", "cloudfront:GetDistribution"],
      "Resource": "*"
    }
  ]
}
```

Notes on this policy:

- **API Gateway is one action, not one per operation.** Both the REST
  (`apigateway`) and HTTP/WebSocket (`apigatewayv2`) control planes are
  authorized through the `execute-api`/`apigateway` IAM action namespace by
  HTTP verb, not by SDK operation name — every read call `agent inspect`
  makes against either API type is an HTTP `GET`, so `apigateway:GET` is the
  correct (and only) action needed, scoped to the API Gateway management
  resource ARN pattern shown above. There is no `apigateway:GetRestApi` or
  `apigateway:GetResources` action to grant individually.
- `sts:GetCallerIdentity` and `cloudformation:ListStackResources` are
  included because credential resolution and stack discovery run
  unconditionally, before any category or service is selected.
- **Sandboxes (Lambda MicroVMs) resources currently show up in the index
  only** — see Notes and limitations below — so no IAM actions for them are
  listed here yet. When they become describable, their registry entries gain
  a `calls` list and this policy gains the matching actions; nothing else
  about the policy changes.
- Tighten the `Resource` field to your account/stack's specific ARNs if you
  want a narrower policy than the wildcard shown here — `agent inspect`
  itself doesn't require account-wide access, this is simply the broadest
  form that's guaranteed to work regardless of resource naming.

## Notes and limitations

- **Only resources inside the service's CloudFormation stack are
  described.** A resource your service references but doesn't own — for
  example a REST API imported via `provider.apiGateway.restApiId`, or a
  shared Application Load Balancer listener — is not in the stack, so
  `agent inspect` does not expand it. Its ARN or ID still appears wherever
  the in-stack resource that references it would normally show one (e.g. a
  Lambda permission), just not as its own expanded entry.
- **Output is raw AWS data and may be sensitive.** Because there's no field
  curation, a Lambda function's configuration includes its environment
  variables in plaintext, and `GetFunction` includes a short-lived,
  presigned download URL for the deployment package. This is the same data
  `aws lambda get-function` would return — treat `agent inspect` output
  with the same care you'd give any other AWS describe call's output, and
  don't pipe it somewhere that isn't trusted with your service's secrets.
- **Sandboxes (Lambda MicroVMs) is a preview feature.** Its resources
  (`AWS::Lambda::MicrovmImage`, `AWS::Lambda::NetworkConnector`) appear in
  the index — logical ID, physical ID, type, status — but are not yet
  expandable with `--sandboxes` or `--aws-services lambda-microvms`. Their
  supporting resources (execution/build IAM roles, log groups, alarms,
  dashboards) are still fully describable under `--iam` and
  `--observability` as usual.
- **CloudWatch log group lookup is prefix-based, not exact.** The
  underlying AWS API has no exact-name lookup for a single log group, only
  a prefix match. If one of your log groups' names is itself a prefix of a
  sibling's (for example `/aws/lambda/foo` and `/aws/lambda/foo-bar`), both
  may appear in that resource's `logGroups` result.
- For AWS service-level semantics and full field reference of any given
  `Describe*`/`Get*` call, see the [AWS SDK and API
  documentation](https://docs.aws.amazon.com/) for that service —
  `agent inspect` passes through what AWS returns.

## More agent tooling

To teach an AI coding agent how to work with your service in the first
place, install the Framework's bundled [Agent
Skills](../../../guides/agent-skills.md) with
[`serverless agent skills install`](agent-skills-install.md).
