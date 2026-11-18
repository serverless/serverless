<!--
title: MCP Server Tools Reference
description: Every tool of the serverless mcp server, with its exact name, parameters, defaults and results, for AI assistants that call them.
short_title: MCP Server Tools
keywords:
  [
    'serverless mcp tools',
    'list-projects',
    'list-resources',
    'service-summary',
    'aws-lambda-info',
    'aws-logs-search',
    'aws-errors-info',
    'MCP tool parameters',
  ]
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/guides/mcp/tools/)

<!-- DOCS-SITE-LINK:END -->

# MCP server tools reference

The Serverless Framework MCP server (`serverless mcp`) registers the 16 tools on this page. Each entry gives the tool's exact name, its parameters and what it returns. The MCP server for AI assistants is a different feature from MCP Servers, which deploys your own MCP server to AWS Lambda ([MCP Servers](../../providers/aws/guide/mcp.md)).

A typical session calls the tools in this order:

1. `list-projects` with the directories to search, after the user confirms them, and `userConfirmed: true`.
2. `list-resources` or `service-summary` with the stack name and Region that `list-projects` reported.
3. The per-service tools (`aws-lambda-info` and the others) and the log tools for the resources found.

```json
{
  "name": "list-resources",
  "arguments": {
    "serviceName": "my-service-dev",
    "serviceType": "serverless-framework",
    "region": "us-east-1",
    "profile": "my-profile"
  }
}
```

## Conventions shared by all tools

- **Results.** Each tool returns MCP `content` with one or more `text` items, most holding JSON. A failed call sets `isError: true` and explains the error in the text. An AWS credentials or Region error comes back as a message for the user that names the profile used.
- **`region` and `profile`.** Every tool except `list-projects` and `docs` takes an optional `region` (string, such as `us-east-1`) and `profile` (string, a profile in `~/.aws/config` or `~/.aws/credentials`). Without them, the tool uses `AWS_REGION`, `AWS_PROFILE` and the default AWS credential chain of the server process. The tools don't read `serverless.yml` for them. [AWS credentials and permissions for the MCP server](./aws-integration.md) describes the resolution order.
- **Times.** Time parameters take ISO 8601 date-time strings, such as `2026-10-01T00:00:00Z`. Defaults are relative to the time of the call.
- **Metric periods.** `period` is in seconds: at least 60, a multiple of 60, and large enough that the time range has at most 300 data points (a 30-day range needs at least `8640`).
- **Stack names.** `serviceName` in `list-resources`, `service-summary`, `deployment-history` and `aws-errors-info` is a CloudFormation stack name. For a Serverless Framework service it is `<service>-<stage>`, such as `my-service-dev`, unless `provider.stackName` sets another name; `list-projects` reports it as `stackName`.
- **Cost confirmation.** `aws-logs-search`, `aws-errors-info` and `aws-lambda-info` run CloudWatch Logs Insights queries, which AWS charges per GB scanned. A query over more than 3 hours of log groups that store 1 GB or more in total returns a confirmation request with a token instead of results; `aws-logs-search` and `aws-errors-info` also ask before a query that starts more than 30 days ago. After the user agrees, repeat the call with the same parameters and `confirmationToken` set to the token. Each kind of confirmation applies once for the life of the server process.

## Project and stack tools

### `list-projects`

Finds projects in the given directories: `serverless.yml` files (type `serverless-framework`), `.yml` and `.yaml` files containing `AWSTemplateFormatVersion` (type `cloudformation`) and files containing `AWS::Serverless-2016-10-31` (type `sam`). It skips `node_modules` and `.git`. Call it before `list-resources`, and only after the user confirms the directories to search.

| Parameter        | Type     | Required         | Description                                                                                                                |
| ---------------- | -------- | ---------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `workspaceRoots` | string[] | Yes              | Absolute paths of the directories to search                                                                                |
| `userConfirmed`  | boolean  | Yes, in practice | Set to `true` after the user confirms `workspaceRoots`. Without it, the tool returns an error asking for that confirmation |

Returns JSON with:

- `projects`: each with `type`, `path` and `configFile`. Serverless Framework projects also have `serviceDetails` with `serviceName`, `stage` (default `dev`), `profile`, `region`, `stackName` and, for values that contain `${...}` variables, `variableWarnings`. The values are read from the file as written; variables are not resolved.
- `projectsByType`, `multipleFound` and `message`.

### `list-resources`

Lists the resources of a deployed stack with CloudFormation `DescribeStackResources`. It returns an error until `list-projects` has run in the same server session.

| Parameter     | Type   | Required | Description                                             |
| ------------- | ------ | -------- | ------------------------------------------------------- |
| `serviceName` | string | Yes      | The stack name                                          |
| `serviceType` | string | Yes      | `serverless-framework`, `cloudformation` or `terraform` |
| `region`      | string | No       | AWS Region                                              |
| `profile`     | string | No       | AWS profile                                             |

Returns the stack's resources as CloudFormation reports them: `LogicalResourceId`, `PhysicalResourceId`, `ResourceType`, `ResourceStatus` and related fields. With `serviceType: terraform`, it returns the `terraform state list` and `terraform state show` commands to run in the project instead of calling AWS. A stack that doesn't exist returns an error that asks the user to check the stack name, profile and Region.

### `service-summary`

Fetches, in one call, the same details the per-service tools return for many resources: either the resources you list or every supported resource of a stack.

| Parameter             | Type                                        | Required                             | Default     | Description                                                                                                                                                                                 |
| --------------------- | ------------------------------------------- | ------------------------------------ | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `cloudProvider`       | string                                      | Yes                                  |             | `aws`                                                                                                                                                                                       |
| `resources`           | array of `{ "id": string, "type": string }` | Unless `serviceWideAnalysis` is true |             | `type` is `lambda`, `iam`, `sqs`, `s3`, `restapigateway`, `httpapigateway` or `dynamodb`; `id` is the function name or ARN, role name, queue name or URL, bucket name, API ID or table name |
| `serviceWideAnalysis` | boolean                                     | No                                   | `false`     | Analyze every Lambda function, IAM role, SQS queue, S3 bucket, REST API, HTTP API and DynamoDB table of the stack                                                                           |
| `serviceName`         | string                                      | When `serviceWideAnalysis` is true   |             | The stack name                                                                                                                                                                              |
| `startTime`           | string                                      | No                                   | 3 hours ago | Start of metrics and logs                                                                                                                                                                   |
| `endTime`             | string                                      | No                                   | Now         | End of metrics and logs                                                                                                                                                                     |
| `period`              | number                                      | No                                   | `3600`      | Metric period in seconds                                                                                                                                                                    |
| `region`              | string                                      | No                                   |             | AWS Region                                                                                                                                                                                  |
| `profile`             | string                                      | No                                   |             | AWS profile                                                                                                                                                                                 |

Returns an array with one result per resource. With `serviceWideAnalysis`, it returns `{ "metadata": { "serviceName", "resourceCount", "resourceTypes", ... }, "resources": [...] }`. A resource that fails has an `error` field; the others still return.

### `deployment-history`

Lists the completed deployments of a stack: its stack-level `CREATE_COMPLETE` and `UPDATE_COMPLETE` events in the 7 days before `endDate`.

| Parameter     | Type   | Required | Default | Description                                |
| ------------- | ------ | -------- | ------- | ------------------------------------------ |
| `serviceName` | string | Yes      |         | The stack name                             |
| `serviceType` | string | Yes      |         | `serverless-framework` or `cloudformation` |
| `endDate`     | string | No       | Now     | End of the 7-day window                    |
| `region`      | string | No       |         | AWS Region                                 |
| `profile`     | string | No       |         | AWS profile                                |

Returns JSON with `service`, `serviceType`, `region`, `timeRange`, `totalEvents` and `eventsByDay`, where each event has `timestamp`, `logicalId`, `resourceType`, `status`, `statusReason` and `physicalId`.

## AWS resource tools

The resource tools accept several names or IDs per call and return a JSON array with one result per resource. A resource that can't be read has `status: "error"` and an `error` message; a part of a result that can't be read, such as metrics denied by IAM, has its own `error` field.

The metric tools share these parameters:

| Parameter   | Type   | Required | Default                                          | Description              |
| ----------- | ------ | -------- | ------------------------------------------------ | ------------------------ |
| `startTime` | string | No       | 24 hours ago (3 hours ago for `aws-lambda-info`) | Start of metrics         |
| `endTime`   | string | No       | Now                                              | End of metrics           |
| `period`    | number | No       | `3600`                                           | Metric period in seconds |
| `region`    | string | No       |                                                  | AWS Region               |
| `profile`   | string | No       |                                                  | AWS profile              |

### `aws-lambda-info`

Diagnoses Lambda functions. Takes the shared metric parameters and:

| Parameter           | Type     | Required | Description                                                                                                                                                                       |
| ------------------- | -------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `functionNames`     | string[] | Yes      | Function names, or names with a version or alias (`my-function:v1`). The tool looks up metrics and the log group by the part before the first `:`, so pass names rather than ARNs |
| `confirmationToken` | string   | No       | Token from a previous call that asked for cost confirmation                                                                                                                       |

Returns, per function: the `GetFunction` result (configuration, including environment variable values, and code location), the resource-based policy, event source mappings, CloudWatch metrics, and `errorLogs` with error patterns from the function's log group. The error-pattern query is a CloudWatch Logs Insights query over at most the last 7 days of the time range.

### `aws-iam-info`

Reads IAM roles and their policies.

| Parameter   | Type     | Required | Description                          |
| ----------- | -------- | -------- | ------------------------------------ |
| `roleNames` | string[] | Yes      | Role names, each up to 64 characters |
| `region`    | string   | No       | AWS Region                           |
| `profile`   | string   | No       | AWS profile                          |

Returns, per role: the role details, trust policy, attached managed policies with their policy documents, and inline policies.

### `aws-sqs-info`

Reads SQS queues. Takes the shared metric parameters and `queueNames` (string[], required): queue names or queue URLs.

Returns, per queue: all queue attributes, including the redrive policy, visibility timeout and retention period, and CloudWatch metrics such as `ApproximateNumberOfMessages`, `NumberOfMessagesSent`, `NumberOfMessagesReceived` and `NumberOfMessagesDeleted`.

### `aws-s3-info`

Reads S3 buckets. Takes the shared metric parameters and `bucketNames` (string[], required).

Returns, per bucket: `location`, `acl`, `policy`, `versioning`, `encryption` and CloudWatch `metrics`.

### `aws-rest-api-gateway-info`

Reads API Gateway REST APIs. Takes the shared metric parameters and `apiIds` (string[], required): REST API IDs.

Returns, per API: the API configuration, stages, resources and methods with their integrations, deployments, API keys, usage plans, VPC links and CloudWatch metrics.

### `aws-http-api-gateway-info`

Reads API Gateway HTTP APIs. Takes the shared metric parameters and `apiIds` (string[], required, at least one): HTTP API IDs.

Returns, per API: the API configuration, routes, integrations, stages, authorizers, deployments, logging configuration and CloudWatch metrics such as request count, latency and 4XX and 5XX errors.

### `aws-dynamodb-info`

Reads DynamoDB tables. Takes the shared metric parameters and `tableNames` (string[], required, at least one).

Returns, per table: `tableDetails` (keys, capacity, indexes and stream settings), `continuousBackups`, `kinesisStreamingDestination`, `tableReplicaAutoScaling`, `timeToLive`, `resourcePolicy` and CloudWatch `metrics`.

## Log and alarm tools

### `aws-logs-search`

Searches log events across log groups with one CloudWatch Logs Insights query. The query sorts matches oldest first and then applies `limit`, so when more events match than `limit`, it returns the oldest ones in the time range; for the latest events, narrow `startTime`. AWS charges for the data the query scans.

| Parameter             | Type     | Required | Default     | Description                                                                                                                             |
| --------------------- | -------- | -------- | ----------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `logGroupIdentifiers` | string[] | Yes      |             | Log group names, such as `/aws/lambda/my-service-dev-hello`, or ARNs                                                                    |
| `searchTerms`         | string[] | No       |             | Terms matched as case-insensitive regular expressions; an event matches when it matches any term                                        |
| `errorsOnly`          | boolean  | No       | `false`     | Also match events containing common error words (`error`, `exception`, `fail`, `timeout` and others). Combined with `searchTerms` by OR |
| `startTime`           | string   | No       | 3 hours ago | Start of the search                                                                                                                     |
| `endTime`             | string   | No       | Now         | End of the search                                                                                                                       |
| `limit`               | number   | No       | `100`       | Maximum number of events the query returns, 1 to 100                                                                                    |
| `confirmationToken`   | string   | No       |             | Token from a previous call that asked for cost confirmation                                                                             |
| `region`              | string   | No       |             | AWS Region                                                                                                                              |
| `profile`             | string   | No       |             | AWS profile                                                                                                                             |

Returns a summary (`timeRange`, `logGroupsCount`, `totalEvents`, `statistics`) and a `timeline` of `events`, each with `timestamp`, `logGroupName`, `logStream` and `message`.

### `aws-logs-tail`

Reads log events with the CloudWatch Logs `FilterLogEvents` API, which is not a Logs Insights query. It reads each log group oldest first from `startTime` and stops at `limit` events, so when the range holds more events, it returns the oldest ones; for the latest events, narrow `startTime`.

| Parameter             | Type     | Required | Default        | Description                                                                                                                                                          |
| --------------------- | -------- | -------- | -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `logGroupIdentifiers` | string[] | Yes      |                | Log group names or ARNs                                                                                                                                              |
| `filterPattern`       | string   | No       |                | A [CloudWatch Logs filter pattern](https://docs.aws.amazon.com/AmazonCloudWatch/latest/logs/FilterAndPatternSyntax.html), such as `ERROR` or `{ $.level = "error" }` |
| `startTime`           | string   | No       | 15 minutes ago | Start of the range                                                                                                                                                   |
| `endTime`             | string   | No       | Now            | End of the range                                                                                                                                                     |
| `limit`               | number   | No       | `100`          | Maximum number of events per log group, 1 to 100                                                                                                                     |
| `region`              | string   | No       |                | AWS Region                                                                                                                                                           |
| `profile`             | string   | No       |                | AWS profile                                                                                                                                                          |

Returns JSON with `timeRange`, `metadata` (`logGroupsProcessed`, `logGroupsWithErrors`, `totalEvents`), `logGroups` (each with `logStreams` and their `events`: `timestamp`, `message`, `eventId`) and `errors` for log groups that couldn't be read.

### `aws-errors-info`

Groups similar error messages with a CloudWatch Logs Insights pattern query. AWS charges for the data the query scans.

| Parameter             | Type     | Required                             | Default     | Description                                                                                                                                  |
| --------------------- | -------- | ------------------------------------ | ----------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `logGroupIdentifiers` | string[] | Unless `serviceWideAnalysis` is true |             | Log group names or ARNs                                                                                                                      |
| `serviceWideAnalysis` | boolean  | No                                   | `false`     | Analyze the log groups of the stack: its `AWS::Logs::LogGroup` resources and the log groups of its Lambda functions, REST APIs and HTTP APIs |
| `serviceName`         | string   | When `serviceWideAnalysis` is true   |             | The stack name                                                                                                                               |
| `serviceType`         | string   | When `serviceWideAnalysis` is true   |             | `serverless-framework` or `cloudformation`                                                                                                   |
| `startTime`           | string   | No                                   | 3 hours ago | Start of the analysis                                                                                                                        |
| `endTime`             | string   | No                                   | Now         | End of the analysis                                                                                                                          |
| `maxResults`          | integer  | No                                   | `100`       | Maximum number of error groups, 1 to 100                                                                                                     |
| `confirmationToken`   | string   | No                                   |             | Token from a previous call that asked for cost confirmation                                                                                  |
| `region`              | string   | No                                   |             | AWS Region                                                                                                                                   |
| `profile`             | string   | No                                   |             | AWS profile                                                                                                                                  |

Returns a `summary` (`totalErrors`, `uniqueErrorGroups`, `timeRange`, `statistics`) and `errorGroups`, each with its `pattern`, count and up to 3 example messages.

### `aws-cloudwatch-alarms`

Reads CloudWatch alarms and their state-change history. Pass `alarmNames`, `alarmNamePrefix` or both.

| Parameter         | Type     | Required                                  | Default      | Description                                 |
| ----------------- | -------- | ----------------------------------------- | ------------ | ------------------------------------------- |
| `alarmNames`      | string[] | One of `alarmNames` and `alarmNamePrefix` |              | Alarm names                                 |
| `alarmNamePrefix` | string   | One of `alarmNames` and `alarmNamePrefix` |              | Alarm name prefix                           |
| `alarmState`      | string   | No                                        | `all`        | `OK`, `ALARM`, `INSUFFICIENT_DATA` or `all` |
| `startDate`       | string   | No                                        | 24 hours ago | Start of the history                        |
| `endDate`         | string   | No                                        | Now          | End of the history                          |
| `region`          | string   | No                                        |              | AWS Region                                  |
| `profile`         | string   | No                                        |              | AWS profile                                 |

Returns a summary (`timeRange`, `totalAlarms`, `stateDistribution`) and the alarms with their configuration, current state and history.

## Documentation tool

### `docs`

Returns pages of the Serverless Framework documentation bundled with the installed CLI, so the pages match the CLI version the server runs.

| Parameter | Type     | Required | Description                                                                                                                                                                                   |
| --------- | -------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `product` | string   | Yes      | `sf`                                                                                                                                                                                          |
| `paths`   | string[] | No       | Page paths relative to the docs root, such as `guides/mcp/README.md` or `providers/aws/events/sqs.md`; a leading `sf/` is accepted. A directory path returns its listing and every page in it |

Without `paths`, the tool returns the tree of all pages. With `paths`, it returns each page's markdown. For a path that doesn't exist, it lists the pages of the nearest existing directory. The same pages are available in a terminal with [`serverless agent docs`](../../providers/aws/cli-reference/agent-docs.md).

## Related pages

- [MCP server for AI assistants](./README.md): what the server does and what it reads
- [Set up the MCP server](./setup.md): configuration for each client
- [AWS credentials and permissions for the MCP server](./aws-integration.md): profiles, Regions, the IAM policy and costs
