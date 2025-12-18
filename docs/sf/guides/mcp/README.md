<!--
title: Serverless Framework - MCP Server
description: Overview of the Serverless MCP Server for Cursor, Windsurf, VSCode AI to interact with AWS serverless cloud infrastructure.
short_title: MCP Server Overview
menuText: Overview
menuOrder: 1
keywords:
  [
    'Serverless MCP',
    'AWS MCP',
    'AWS Lambda MCP',
    'AWS ECS MCP',
    'Cursor MCP',
    'Windsurf MCP',
    'MCP Server',
    'Model Context Protocol',
    'AI assistants',
    'AI agents',
    'cloud resources',
    'infrastructure',
    'AWS',
    'serverless applications',
  ]
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/guides/mcp/)

<!-- DOCS-SITE-LINK:END -->

![Serverless MCP](https://assets.serverless-extras.com/general/serverless-mcp-docs-header.png)

# Serverless MCP Server

The Serverless MCP Server is an implementation of the [Model Context Protocol (MCP)](https://mcp.so/) that provides a set of tools for working with cloud resources and services across multiple Infrastructure as Code (IaC) solutions. It enables AI assistants to interact with your cloud infrastructure, helping you diagnose issues, retrieve information, and understand your serverless applications.

::youtube{id="FW6IpZv_xUU"}

## Features

- **Multiple Transport Options**: Run the server using HTTP/SSE or stdio transport
- **Comprehensive Cloud Resource Information**: Detailed metrics, configurations, and logs for serverless functions, roles, queues, storage, and API resources
- **Infrastructure as Code Integration**: List and analyze resources defined in multiple IaC solutions including Serverless Framework, AWS CloudFormation, and SAM templates
- **Parallel Data Fetching**: Efficient retrieval of metrics and logs across multiple resources
- **Error Grouping and Analysis**: Intelligent aggregation of error logs for easier troubleshooting
- **Flexible Time Range Support**: Customizable time periods for metrics and logs analysis
- **Service Summary Tool**: Consolidated view of multiple resource types in a single request

## Getting Started

Install the Serverless Framework if you haven't already:

```bash
npm install -g serverless
```

Then, you configure the MCP Server in your host application:

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

For detailed setup instructions, see the [Setup Guide](./setup.md).

## Example Prompts

1. Provide a complete overview of my serverless application's resource relationships and data flows based on cloud data
2. Display the deployment history of my serverless application for the past 7 days
3. Identify which functions of my application have experienced the most errors
4. Analyze my CloudWatch Alarms history and highlight recurring issues
5. Detect unusual traffic patterns in my API Gateway during the past month
6. Examine my SQS queues and determine if any messages are stuck

## Best Practices

- **Always specify the profile explicitly** when using MCP tools, especially in environments with multiple AWS accounts or roles
- If the region is not specified in your service configuration, **always provide the region parameter**
- For Serverless Framework projects, check the `provider.region` setting in your infrastructure configuration file
- Use AWS SSO for enhanced security in enterprise environments
- Regularly rotate your access keys if using long-term credentials

## Next Steps

- [Available Tools](./tools.md): Explore the tools provided by the MCP Server
- [AWS Integration](./aws-integration.md): Learn how to configure AWS credentials
- [Setup](./setup.md): Learn how to set up the MCP Server in your AI assistant
