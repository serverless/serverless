<!--
title: serverless agent inspect
description: Read the live AWS configuration of a deployed service's resources in one read-only call, as JSON for AI coding agents, by category or AWS service.
short_title: agent inspect
keywords:
  [
    'serverless agent inspect',
    'AI coding agents',
    'deployed AWS resources',
    'CloudFormation stack resources',
    'Lambda configuration',
    'IAM policy',
  ]
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/aws/cli-reference/agent-inspect)

<!-- DOCS-SITE-LINK:END -->

# serverless agent inspect

`serverless agent inspect` returns the live AWS configuration of a deployed service's resources as one JSON document, organized by the categories `serverless.yml` uses (functions, APIs, events, IAM, storage). It reads the service's CloudFormation stack and calls only read-only AWS APIs: it never creates, changes or deletes a resource, and never invokes a function. Use it when an AI coding agent debugs or operates a deployed service, instead of many `aws describe-*` calls; use [`serverless info`](./info.md) for the human summary of endpoints and functions.

```bash
serverless agent inspect
```

Without selection options, `serverless agent inspect` returns the index: every resource in the stack with its logical ID, physical ID, type and status, from one paginated `ListStackResources` call. Expand the categories or AWS services you need from there:

```bash
serverless agent inspect --functions
```

Run it in the service directory: it needs `serverless.yml` and the AWS credentials a deploy uses.

## Options

`serverless agent inspect` accepts these options:

| Option                                                                                                                                   | Alias | Value                     | Default                             | Required | Description                                                                                  |
| ---------------------------------------------------------------------------------------------------------------------------------------- | ----- | ------------------------- | ----------------------------------- | -------- | -------------------------------------------------------------------------------------------- |
| `--functions`, `--api`, `--events`, `--iam`, `--storage`, `--observability`, `--cdn`, `--identity`, `--iot`, `--sandboxes`, `--web-apps` |       | flag                      | off                                 | No       | Expand every resource in the category. Combine as many as you need.                          |
| `--all`                                                                                                                                  |       | flag                      | off                                 | No       | Expand every category.                                                                       |
| `--aws-services`                                                                                                                         |       | comma-separated tokens    | none                                | No       | Expand every resource of these AWS services, such as `lambda,iam,s3`.                        |
| `--name`                                                                                                                                 |       | CloudFormation logical ID | none                                | No       | Scope to this resource (repeatable). Alone, it selects the resource without a category flag. |
| `--format`                                                                                                                               |       | `json` or `yaml`          | `json`                              | No       | Output format. JSON is pretty-printed.                                                       |
| `--stage`                                                                                                                                | `-s`  | string                    | `provider.stage`, else `dev`        | No       | The stage of the deployed service.                                                           |
| `--region`                                                                                                                               | `-r`  | string                    | `provider.region`, else `us-east-1` | No       | The AWS Region of the deployed service.                                                      |
| `--aws-profile`                                                                                                                          |       | string                    | `provider.profile`                  | No       | The AWS profile whose credentials the command uses.                                          |
| `--config`                                                                                                                               | `-c`  | file path                 | `serverless.yml`                    | No       | The service configuration file.                                                              |

`serverless agent inspect` also accepts the options every command takes: `--param="key=value"` (repeatable), `--org`, `--app`, `--verbose`, `--debug` and `--help` (`-h`).

## How serverless agent inspect selects resources

Resources are selected along two axes, category flags and `--aws-services`. When both are given, the result is their union: `--functions --aws-services s3` expands every function and every S3 bucket.

### Category flags

The category flags group resources the way `serverless.yml` does:

| Flag              | Covers                                                                                                                                     |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `--functions`     | Lambda functions (with their versions, aliases, function URLs, resource policies and event source mappings) and layers                     |
| `--api`           | API Gateway REST APIs, API Gateway HTTP and WebSocket APIs, and Application Load Balancer target groups and listener rules                 |
| `--events`        | SNS topics, EventBridge rules and buses, Custom Event Bus subscribers and buses, Scheduler schedules, SQS queues, Kinesis stream consumers |
| `--iam`           | IAM roles (trust policy, inline and attached policies)                                                                                     |
| `--storage`       | S3 buckets, DynamoDB tables                                                                                                                |
| `--observability` | CloudWatch log groups (with metric and subscription filters), alarms, dashboards                                                           |
| `--cdn`           | CloudFront distributions and cache policies                                                                                                |
| `--identity`      | Cognito user pools (with their clients)                                                                                                    |
| `--iot`           | IoT topic rules and provisioning templates                                                                                                 |
| `--sandboxes`     | Lambda MicroVM images ([Sandboxes](../guide/sandboxes.md)); network connectors appear in the index only                                    |
| `--web-apps`      | Lambda Web Functions ([web apps](../guide/web-apps.md)): each function, its revisions and its endpoints                                    |
| `--all`           | Every category above                                                                                                                       |

A resource belongs to the category of its own type, not to the feature that created it: a function's execution role is under `--iam`, and its log group and alarms are under `--observability`.

### The --aws-services option

`--aws-services` selects by AWS service, as a comma-separated list:

```bash
serverless agent inspect --aws-services lambda,iam,s3
```

The tokens are `lambda`, `iam`, `apigateway`, `apigatewayv2`, `sns`, `eventbridge` (alias `events`), `eventbridgev2`, `scheduler`, `s3`, `dynamodb`, `sqs`, `logs`, `elbv2` (alias `alb`), `cloudfront`, `cognito-idp` (alias `cognito`), `iot`, `kinesis`, `cloudwatch`, `lambda-microvms` (aliases `microvms` and `sandboxes`) and `lambda-web`. Tokens are matched case-insensitively, and spaces and empty entries are ignored. An unknown token stops the command with an error that lists the valid tokens.

`eventbridge` covers EventBridge rules and Custom Event Bus - Classic buses (`AWS::Events::*`); `eventbridgev2` covers Custom Event Bus subscribers and buses (`AWS::EventsV2::*`), which EventBridge serves through a separate API. `--events` covers both. `lambda-microvms` covers MicroVM images only.

### The --name option

`--name` takes a CloudFormation logical ID, as the index lists it, such as `CreateOrderLambdaFunction`. It is repeatable and case-sensitive:

- With no category flag and no `--aws-services`, `--name` selects the named resources directly.
- With a category flag or `--aws-services`, `--name` narrows that selection to the named resources; a named resource outside it isn't added.

```bash
serverless agent inspect --name CreateOrderLambdaFunction
```

`--name` is checked against the whole stack, nested stacks included, and stops the command with an error when the logical ID doesn't exist (the error lists the valid IDs), when the resource's type isn't described on its own (the `other` bucket), or when the same logical ID exists in a parent and a nested stack. In that last case, select by category or `--aws-services` instead.

## Output of serverless agent inspect

`serverless agent inspect` writes exactly one document to standard output, pretty-printed JSON or, with `--format yaml`, YAML. Progress and warnings go to standard error. Categories come in a fixed order (`functions`, `iam`, `api`, `events`, `storage`, `observability`, `identity`, `iot`, `cdn`, `sandboxes`, `web-apps`, then `other`) and resources are sorted by logical ID, so the output is byte-stable across runs against unchanged infrastructure.

### Index result

The index has `"mode": "index"`, a `hint` listing the expansion options, and every category key, even when empty. A trimmed index:

```json
{
  "service": "orders-api",
  "stage": "dev",
  "region": "us-east-1",
  "stackName": "orders-api-dev",
  "mode": "index",
  "hint": "Expand with category flags (--functions, --api, --events, --iam, --storage, --observability, --cdn, --identity, --iot, --sandboxes, --web-apps), --aws-services <names>, or --all. Add --name <logicalId> to scope to one resource.",
  "resources": {
    "functions": [
      {
        "logicalId": "CreateOrderLambdaFunction",
        "physicalId": "orders-api-dev-createOrder",
        "type": "AWS::Lambda::Function",
        "status": "UPDATE_COMPLETE",
        "category": "functions",
        "awsService": "lambda",
        "stack": "orders-api-dev"
      }
    ],
    "iam": [
      {
        "logicalId": "IamRoleLambdaExecution",
        "physicalId": "orders-api-dev-us-east-1-lambdaRole",
        "type": "AWS::IAM::Role",
        "status": "CREATE_COMPLETE",
        "category": "iam",
        "awsService": "iam",
        "stack": "orders-api-dev"
      }
    ],
    "other": []
  }
}
```

`stack` names the stack the resource is in; resources of nested stacks are listed with their nested stack's name. The `other` bucket holds what isn't described on its own, with `category: "other"` and `awsService: null`: sub-resources described as part of their parent (Lambda permissions, versions and aliases, API Gateway methods, SNS subscriptions) and types outside the command's registry (for example Step Functions state machines, WAF web ACLs and custom resources).

### Expanded result

An expanded result has `service`, `stage`, `region`, `stackName` and `resources`, with no `mode`. `resources` is keyed by category, only the categories with selected resources, then by logical ID. Each resource holds the AWS SDK responses, one key per call: for a function, `configuration` (`GetFunction`), `functionUrlConfig`, `resourcePolicy`, `eventInvokeConfig`, `versions`, `aliases` and `eventSourceMappings`. Optional settings that aren't configured, such as a function URL, are left out. With `--functions` and without `--iam`, each function also has its execution role under `role`.

The responses are passed through without field curation, with these changes only:

- `$metadata` is removed.
- List calls that page with `NextToken`, `nextToken`, `Marker` and `IsTruncated` (IAM), or `position` (API Gateway) are read to the last page: the pages are merged and the tokens removed. A function's `versions`, `aliases` and `eventSourceMappings` hold the first page AWS Lambda returns; when Lambda has more, the response keeps its `NextMarker`.
- Dates are ISO-8601 strings.
- IAM policy documents are URL-decoded and parsed into objects; JSON strings such as Lambda, S3 and SQS `Policy`, SQS `RedrivePolicy` and CloudWatch `DashboardBody` are parsed too.
- `Code.Location`, the presigned download URL of a function's deployment package, is removed: it carries credentials and changes on every call.

### Results for a stage that isn't deployed

When the stack doesn't exist, `serverless agent inspect` exits 0 with `"mode": "not-deployed"`, an empty `resources` and a `hint` such as `No deployed stack found for stage "dev" in us-east-1. Run "serverless deploy --stage dev --region us-east-1" first, then re-run inspect.`

## Errors and exit codes

`serverless agent inspect` exits 0 on success, also when some resources could not be described. A resource whose describe failed keeps the keys of the calls that succeeded and gets an `error` string naming the failed call, such as `AccessDenied error calling GetPolicy: ...`; a resource without a physical ID (a failed or in-progress create) is `{ "error": "not deployed / no physical id" }`.

A fatal error exits non-zero. When it occurs while the command runs, the command first writes one error document to standard output:

```json
{
  "error": {
    "code": "AGENT_INSPECT_UNKNOWN_NAME",
    "message": "Unknown --name \"CreateOrder\". Valid logical IDs: CreateOrderLambdaFunction, IamRoleLambdaExecution, ServerlessDeploymentBucket.",
    "region": "us-east-1",
    "stage": "dev"
  }
}
```

`profile` is added when `--aws-profile` is given. The codes are `AGENT_INSPECT_UNKNOWN_AWS_SERVICE`, `AGENT_INSPECT_UNKNOWN_NAME`, `AGENT_INSPECT_AMBIGUOUS_NAME`, `AGENT_INSPECT_NAME_NOT_DESCRIBABLE`, `AGENT_INSPECT_UNKNOWN_FORMAT` (the document is then JSON), `AGENT_INSPECT_UNSUPPORTED_PROVIDER`, and, for an AWS call that fails, `AWS_<SERVICE>_<METHOD>_<AWS ERROR CODE>`, such as `AWS_CLOUD_FORMATION_LIST_STACK_RESOURCES_ACCESS_DENIED` for a denied `cloudformation:ListStackResources`, or `AWS_CREDENTIALS_NOT_FOUND` when no AWS credentials are found. An error that carries no code is `AGENT_INSPECT_ERROR`.

Errors from the CLI's checks before the command runs, such as an unknown option, a missing `serverless.yml` or `serverless agent inspect` at a [Compose](../../../guides/compose.md) root, print a message on standard error and nothing on standard output. In a Compose project, inspect one service from the root with `serverless <service> agent inspect`, or run the command in the service's directory.

## IAM permissions for serverless agent inspect

`serverless agent inspect` calls only read-only `Describe*`, `Get*` and `List*` AWS APIs. This policy covers every call it makes:

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
        "lambda:GetMicrovmImage",
        "lambda:GetPolicy",
        "lambda:GetWebFunction",
        "lambda:GetWebFunctionEndpoint",
        "lambda:GetWebFunctionRevision",
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
        "events:DescribeSubscriber",
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

- **API Gateway** authorizes its control-plane APIs by HTTP method, not by operation, for both REST (`apigateway`) and HTTP and WebSocket (`apigatewayv2`) APIs. Every call `serverless agent inspect` makes there is a `GET`, so `apigateway:GET` on the API Gateway management resources is the one action needed.
- The `events:` actions cover both EventBridge APIs: Custom Event Bus subscribers and buses (`eventbridgev2`) are read with `events:DescribeSubscriber` and `events:DescribeEventBus`.
- `cloudformation:ListStackResources` and `sts:GetCallerIdentity` are used on every run, for stack discovery and credential resolution.
- `lambda:GetWebFunction`, `lambda:GetWebFunctionRevision` and `lambda:GetWebFunctionEndpoint` describe web apps; `lambda:GetMicrovmImage` describes Sandboxes MicroVM images. Network connectors have no describe operation, so they need no action.
- To narrow the policy, replace the `Resource` wildcards with your stack's ARNs.

## Limits of serverless agent inspect

- **Only resources in the service's CloudFormation stack are described.** A resource the service references but doesn't own, such as a REST API imported with `provider.apiGateway.restApiId` or a shared Application Load Balancer listener, isn't expanded. Its ARN or ID still appears where an in-stack resource references it, such as a Lambda permission.
- **The output is raw AWS data and can be sensitive.** A function's configuration includes its environment variables in plain text, as `aws lambda get-function` returns them. Handle the output as you would any AWS describe output, and don't send it where your service's secrets don't belong.
- **Sandboxes network connectors** (`AWS::Lambda::NetworkConnector`) appear in the index with their logical ID, physical ID, type and status, and are never expanded. The images, execution and build roles, log groups, alarms and dashboards are described under `--sandboxes`, `--iam` and `--observability`.
- **CloudWatch log groups are looked up by prefix**, since the AWS API has no exact-name lookup. When one log group's name is a prefix of another's (`/aws/lambda/foo` and `/aws/lambda/foo-bar`), both can appear in that resource's `logGroups` result.

For the fields of each AWS response, see the API reference of that AWS service.

## Examples

### Expand the functions of a stage

```bash
serverless agent inspect --functions --stage prod --region eu-west-1
```

### Expand functions and S3 buckets

```bash
serverless agent inspect --functions --aws-services s3
```

### Inspect two resources by logical ID

```bash
serverless agent inspect --name CreateOrderLambdaFunction --name OrdersDynamoDbTable
```

### Get YAML instead of JSON

```bash
serverless agent inspect --functions --format yaml
```

### Expand every category

```bash
serverless agent inspect --all
```

## Related commands

- [`serverless info`](./info.md): print the service's endpoints, functions and stack outputs.
- [`serverless agent setup`](./agent-setup.md): install the Agent Skills and check the credentials an agent will use.
- [`serverless logs`](./logs.md): read a function's logs.
