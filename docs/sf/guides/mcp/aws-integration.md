<!--
title: MCP Server AWS Credentials, Permissions and Costs
description: Which AWS profile, Region and credentials the serverless mcp tools use, the IAM policy they need, and which calls AWS charges for.
short_title: MCP Server AWS Access
keywords:
  [
    'serverless mcp AWS credentials',
    'MCP AWS profile',
    'AWS_PROFILE',
    'AWS_REGION',
    'IAM permissions',
    'AWS SSO',
    'CloudWatch Logs Insights cost',
  ]
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/guides/mcp/aws-integration/)

<!-- DOCS-SITE-LINK:END -->

# AWS credentials and permissions for the MCP server

The AWS tools of the Serverless Framework MCP server (`serverless mcp`) read your AWS account with the AWS SDK for JavaScript v3, using the profile and Region of each tool call. This page explains which credentials, profile and Region a call uses, the IAM permissions the tools need, and which calls AWS charges for. The MCP server for AI assistants is a different feature from MCP Servers, which deploys your own MCP server to AWS Lambda ([MCP Servers](../../providers/aws/guide/mcp.md)).

To set a default profile and Region for the tools, set them in the environment your MCP client starts the server with, for example in Cursor's `mcp.json`:

```json
{
  "mcpServers": {
    "serverless": {
      "command": "serverless",
      "args": ["mcp"],
      "env": {
        "AWS_PROFILE": "my-profile",
        "AWS_REGION": "us-east-1"
      }
    }
  }
}
```

[Set up the MCP server](./setup.md) shows the same settings for Claude Code, VS Code and other clients.

## Which AWS credentials the tools use

Each AWS tool takes optional `profile` and `region` parameters. With a `profile`, the tool uses that profile from `~/.aws/config` and `~/.aws/credentials`. Without one, it uses the SDK's default credential chain in the server's environment, in this order:

1. Environment variables `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` and `AWS_SESSION_TOKEN`. The SDK skips them when `AWS_PROFILE` is set.
2. The profile named by `AWS_PROFILE`, or the `default` profile, from the shared config and credentials files. This covers access keys, IAM Identity Center (SSO) profiles, role profiles, `credential_process`, and the sign-in session that `serverless login aws` saves.
3. A web identity token file (`AWS_WEB_IDENTITY_TOKEN_FILE`).
4. Container or EC2 instance credentials.

The server's environment is the one your MCP client starts it with (stdio transport) or your terminal's (SSE transport). Desktop apps started outside a terminal don't see variables exported in your shell profile, so set them in the client's `env` settings.

The tools don't use the credentials the Framework uses for deploys: `provider.profile` in `serverless.yml`, AWS credential resolvers and Serverless Framework Dashboard providers. `list-projects` reports `provider.profile` from `serverless.yml`, and the assistant passes it as `profile`.

## Which AWS Region the tools use

A tool resolves the Region in this order:

1. The tool's `region` parameter. The assistant takes it from the prompt, or from `provider.region` in `serverless.yml`, which `list-projects` reports.
2. The `AWS_REGION` environment variable.
3. The `region` of the selected profile in `~/.aws/config`.

When none is set, the tool returns this error, and the assistant asks you for the Region:

```text
AWS region is missing or invalid. Specify a valid region or configure a default region with 'aws configure'.
```

The tool descriptions ask the assistant to pass `region: us-east-1` when `serverless.yml` sets no `provider.region`, because the Framework deploys to `us-east-1` then. That `region` parameter wins over `AWS_REGION`, so for resources in another Region, name the Region in your prompt.

## Use an AWS SSO profile

To use IAM Identity Center (SSO), create a profile with the AWS CLI:

```bash
aws configure sso
```

The command writes a profile like this one to `~/.aws/config`:

```ini
[profile my-sso-profile]
sso_session = my-sso
sso_account_id = 123456789012
sso_role_name = ReadOnlyAccess
region = us-east-1

[sso-session my-sso]
sso_start_url = https://my-sso-portal.awsapps.com/start
sso_region = us-east-1
sso_registration_scopes = sso:account:access
```

Sign in before you use the tools, and again when the session expires:

```bash
aws sso login --profile my-sso-profile
```

Then pass `profile: my-sso-profile` in the prompt or set `AWS_PROFILE=my-sso-profile` in the client's `env`. To check which account and role a profile resolves to, run `aws sts get-caller-identity --profile my-sso-profile`. For other setups, see [Configure IAM Identity Center authentication with the AWS CLI](https://docs.aws.amazon.com/cli/latest/userguide/sso-configure-profile-token.html).

## IAM permissions

The tools call read-only AWS APIs. This policy allows every call they make:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "cloudformation:DescribeStackResources",
        "cloudformation:DescribeStackEvents",
        "lambda:GetFunction",
        "lambda:GetPolicy",
        "lambda:ListEventSourceMappings",
        "lambda:GetEventSourceMapping",
        "iam:GetRole",
        "iam:ListAttachedRolePolicies",
        "iam:ListRolePolicies",
        "iam:GetRolePolicy",
        "iam:GetPolicy",
        "iam:GetPolicyVersion",
        "sqs:ListQueues",
        "sqs:GetQueueAttributes",
        "s3:ListBucket",
        "s3:GetBucketLocation",
        "s3:GetBucketAcl",
        "s3:GetBucketPolicy",
        "s3:GetBucketVersioning",
        "s3:GetEncryptionConfiguration",
        "apigateway:GET",
        "dynamodb:DescribeTable",
        "dynamodb:DescribeContinuousBackups",
        "dynamodb:DescribeKinesisStreamingDestination",
        "dynamodb:DescribeTableReplicaAutoScaling",
        "dynamodb:DescribeTimeToLive",
        "dynamodb:GetResourcePolicy",
        "cloudwatch:GetMetricData",
        "cloudwatch:DescribeAlarms",
        "cloudwatch:DescribeAlarmHistory",
        "logs:DescribeLogGroups",
        "logs:FilterLogEvents",
        "logs:StartQuery",
        "logs:GetQueryResults"
      ],
      "Resource": "*"
    }
  ]
}
```

- `apigateway:GET` covers REST APIs and HTTP APIs; API Gateway uses the `apigateway` action prefix for both.
- To limit the tools to some resources, replace `"Resource": "*"` with their ARNs. Actions without resource-level permissions, such as `sqs:ListQueues` and `cloudwatch:GetMetricData`, need `"*"`.
- When a permission is missing, most tools report the denied part as an `error` field and return the rest.

- `aws-lambda-info` returns the function configuration, including environment variable values, to the assistant. Leave `lambda:GetFunction` out of the policy if those values must not reach it.

## AWS costs

The MCP server reads from your account and creates no resources. AWS charges for two kinds of calls the tools make:

- **CloudWatch Logs Insights queries**, per GB of data scanned. `aws-logs-search`, `aws-errors-info`, `aws-lambda-info` (for error patterns) and `service-summary` (for Lambda functions) run them. Data scanned by Logs Insights shares the CloudWatch Logs free tier with log ingestion and storage.
- **CloudWatch `GetMetricData` requests**, per metric requested, outside the CloudWatch free tier of API requests. `aws-lambda-info`, `aws-sqs-info`, `aws-s3-info`, `aws-rest-api-gateway-info`, `aws-http-api-gateway-info`, `aws-dynamodb-info` and `service-summary` request metrics.

`aws-logs-tail` reads logs with the `FilterLogEvents` API instead of a Logs Insights query. For current prices, see [Amazon CloudWatch pricing](https://aws.amazon.com/cloudwatch/pricing/).

Logs Insights charges depend on the data in the log groups and time range the query covers, not on search terms or result limits. To keep them low, query specific log groups over short time ranges; the tools default to the last 3 hours.

Before a Logs Insights query over more than 3 hours of log groups that store 1 GB or more in total, `aws-logs-search`, `aws-errors-info` and `aws-lambda-info` return a confirmation request with a token instead of results. `aws-logs-search` and `aws-errors-info` also ask before a query that starts more than 30 days ago. The assistant repeats the call with `confirmationToken` after you agree; each kind of confirmation applies once for the life of the server process.

## Troubleshoot AWS credential errors

The tools report AWS errors in their result: some as a message for you that names the profile used and tells the assistant to stop until you fix the credentials, others as an `error` field next to the resource. The AWS error text in either form tells you the cause:

| AWS error text                                   | Cause                                                                                                                 | Fix                                                                                                                                                              |
| ------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Could not load credentials from any providers`  | No credentials in the server's environment, or the `profile` doesn't exist in `~/.aws/config` or `~/.aws/credentials` | Check the profile name with `aws configure list-profiles`; configure one with `aws configure` or `aws configure sso`, or set `AWS_PROFILE` in the client's `env` |
| `Token has expired` or `ExpiredToken`            | An SSO or sign-in session ended                                                                                       | Run `aws sso login --profile <profile>` or `serverless login aws`                                                                                                |
| `Region is missing`                              | No `region` parameter, `AWS_REGION` or profile Region                                                                 | Name the Region in the prompt or set `AWS_REGION`                                                                                                                |
| `AccessDenied` or `is not authorized to perform` | The policy lacks an action from [IAM permissions](#iam-permissions)                                                   | Add the action to the user's or role's policy                                                                                                                    |
| `Stack with id ... does not exist`               | Wrong stack name, profile or Region                                                                                   | Check `stackName` and `region` in the `list-projects` result and the profile's account                                                                           |

To check the credentials the server will use, run `aws sts get-caller-identity --profile <profile>` with the same profile and environment.

## Related pages

- [MCP server for AI assistants](./README.md): what the server does and what it reads
- [Set up the MCP server](./setup.md): configuration for each client
- [MCP server tools reference](./tools.md): every tool's parameters and results
- [AWS credentials](../../providers/aws/guide/credentials.md): the credentials the Framework uses for deploys
