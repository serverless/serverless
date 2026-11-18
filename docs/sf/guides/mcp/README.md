<!--
title: MCP Server for AI Assistants
description: Run serverless mcp so Claude Code, Cursor, VS Code and other AI assistants can inspect your AWS resources, search logs and read the Framework docs.
short_title: MCP Server
keywords:
  [
    'Serverless MCP',
    'serverless mcp',
    'MCP server for AWS',
    'Model Context Protocol',
    'Claude Code MCP',
    'Cursor MCP',
    'VS Code MCP',
    'AI agents',
    'AWS Lambda debugging',
    'CloudWatch Logs',
  ]
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/guides/mcp/)

<!-- DOCS-SITE-LINK:END -->

# MCP Server for AI assistants

The Serverless Framework MCP server (`serverless mcp`) is a local [Model Context Protocol](https://modelcontextprotocol.io/) server for AI assistants and IDEs such as Claude Code, Cursor and VS Code. Its tools let the assistant find your services, inspect their deployed AWS resources, search CloudWatch logs and read the Framework documentation. It is a different feature from MCP Servers, which deploys your own MCP server to AWS Lambda: for that, see [MCP Servers](../../providers/aws/guide/mcp.md).

## Quick start

You need the Serverless Framework CLI and AWS credentials that can read your account ([AWS credentials and permissions for the MCP server](./aws-integration.md)).

1. Install the CLI:

   ```bash
   npm i -g serverless
   ```

2. Register the server with your assistant. In Claude Code, run:

   ```bash
   claude mcp add serverless -- serverless mcp
   ```

   Most other clients take the same command in a JSON file, under their `mcpServers` key:

   ```json
   {
     "mcpServers": {
       "serverless": {
         "command": "serverless",
         "args": ["mcp"]
       }
     }
   }
   ```

   [Set up the MCP server](./setup.md) gives the exact file and format for Cursor, VS Code, Devin Desktop (Windsurf) and Claude Desktop.

3. Ask the assistant about your service, for example: "Which functions of my-service in us-east-1 had the most errors in the last 3 hours?"

The client starts `serverless mcp` itself and talks to it over standard input and output. You don't run the command in a terminal.

## What the MCP server reads and changes

- **No service files required.** `serverless mcp` runs in any directory, without a `serverless.yml` and without a Serverless Framework sign-in.
- **AWS credentials.** The AWS tools use the AWS SDK's default credential chain with the `profile` and `region` each tool call passes. They don't read `provider.profile` or `provider.region` from `serverless.yml` and don't use the credential resolvers or Dashboard providers the Framework uses for deploys. [AWS credentials and permissions for the MCP server](./aws-integration.md) explains which profile and Region a call uses.
- **Read-only AWS calls.** Every AWS call reads configuration, metrics or logs; the server creates, changes and deletes nothing in your account. CloudWatch Logs Insights queries and `GetMetricData` requests are charged by AWS ([costs](./aws-integration.md#aws-costs)).
- **Local files.** `list-projects` searches the directories the assistant passes and reads the `serverless.yml` files it finds. The `docs` tool reads the documentation bundled with the installed CLI. The server writes no files.
- **Usage events.** When the CLI is signed in to the Serverless Framework, each tool call sends a usage event with the tool name and your user and org IDs.

## Tools

The server registers 16 tools. [MCP server tools reference](./tools.md) lists every parameter and return value.

| Tool                        | What it returns                                                                                                                              |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `list-projects`             | Serverless Framework, CloudFormation and AWS SAM projects in the given directories, with service name, stage, Region, profile and stack name |
| `list-resources`            | The resources of a deployed CloudFormation stack                                                                                             |
| `service-summary`           | Details, metrics and logs for many resources of a stack in one call                                                                          |
| `deployment-history`        | Completed deployments of a stack in a 7-day window                                                                                           |
| `aws-lambda-info`           | Lambda function configuration, policies, event source mappings, metrics and error patterns                                                   |
| `aws-iam-info`              | IAM roles with their trust, managed and inline policies                                                                                      |
| `aws-sqs-info`              | SQS queue attributes and metrics                                                                                                             |
| `aws-s3-info`               | S3 bucket location, ACL, policy, versioning, encryption and metrics                                                                          |
| `aws-rest-api-gateway-info` | REST API configuration and metrics                                                                                                           |
| `aws-http-api-gateway-info` | HTTP API configuration and metrics                                                                                                           |
| `aws-dynamodb-info`         | DynamoDB table configuration and metrics                                                                                                     |
| `aws-logs-search`           | Log events matching search terms, from a CloudWatch Logs Insights query                                                                      |
| `aws-logs-tail`             | Log events from `FilterLogEvents`, the last 15 minutes by default                                                                            |
| `aws-errors-info`           | Error messages grouped by pattern                                                                                                            |
| `aws-cloudwatch-alarms`     | CloudWatch alarms and their state history                                                                                                    |
| `docs`                      | Pages of the Serverless Framework documentation                                                                                              |

The tool descriptions guide the assistant through an order: `list-projects` first, with your confirmation of the directories to search, then `list-resources` or `service-summary`, then the per-service and log tools. Only `list-resources` refuses to run before `list-projects`; the resource and log tools take names you give directly. Log queries that can be costly return a confirmation request before they run.

For the errors of one Lambda function, the tools take the function's log group, `/aws/lambda/<function name>` unless the function sets its own:

- `aws-errors-info` groups the error messages by pattern, with counts and examples.
- `aws-logs-search` with `errorsOnly: true` returns the individual log events, oldest first. Its `limit` keeps the oldest matches in the time range, so for the latest errors, narrow `startTime`.

## Example prompts

- Provide a complete overview of my serverless application's resource relationships and data flows based on cloud data.
- Display the deployment history of my serverless application for the past 7 days.
- Identify which functions of my application have experienced the most errors.
- Analyze my CloudWatch alarm history and highlight recurring issues.
- Examine my SQS queues and determine if any messages are stuck.

Name the AWS profile and Region in the prompt, or keep them in `serverless.yml` where the assistant finds them through `list-projects`. Without them, the tools use the `AWS_PROFILE` and `AWS_REGION` environment variables of the server process, or your `default` profile. A Region the assistant passes wins over `AWS_REGION` ([AWS profile and Region for the MCP server](./setup.md#aws-profile-and-region-for-the-mcp-server)).

## Video walkthrough

The "Serverless MCP - Introduction" video shows the MCP server in an IDE: [watch it on YouTube](https://www.youtube.com/watch?v=FW6IpZv_xUU).

::youtube{id="FW6IpZv_xUU"}

## Related pages

- [Set up the MCP server](./setup.md): configuration for each client, the SSE transport and connecting from code
- [MCP server tools reference](./tools.md): every tool's parameters and results
- [AWS credentials and permissions for the MCP server](./aws-integration.md): profiles, Regions, the IAM policy and costs
- [Agent Skills](../agent-skills.md): teach coding agents to build and deploy with the Framework
