<!--
title: Serverless Framework - MCP Server Tools
description: Available tools in the Serverless MCP Server for Cursor, Windsurf, VSCode AI assistants to interact with your AWS infrastructure
short_title: MCP Server Tools
menuText: Tools
menuOrder: 2
keywords:
  [
    'Serverless MCP',
    'AWS MCP',
    'AWS Lambda MCP',
    'AWS ECS MCP',
    'Cursor MCP',
    'Windsurf MCP',
    'VScode MCP',
    'MCP Server',
    'Model Context Protocol',
    'AI assistants',
    'AI agents',
    'cloud resources',
    'infrastructure',
    'AWS',
    'serverless applications',
    'AWS integration',
    'AWS credentials',
    'IAM permissions',
    'AWS SSO'
  ]
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/guides/mcp/tools/)

<!-- DOCS-SITE-LINK:END -->

# MCP Server Tools

The Serverless MCP Server provides a comprehensive set of tools for working with cloud resources and services. These tools allow AI assistants to retrieve detailed information about your serverless applications and cloud infrastructure across multiple Infrastructure as Code (IaC) solutions.

## Cross-Cloud Infrastructure Tools

1. `list-projects`
   - Lists all serverless projects found in the workspace
   - Inputs:
     - `workspaceRoots` (string[]): Array of root directories to search in
     - `userConfirmed` (boolean): Confirmation that user has approved the search
   - Returns: List of serverless projects with their locations, types, and configuration details

2. `list-resources`
   - Lists all resources defined in your infrastructure configuration
   - Inputs:
     - `serviceName` (string): Name of the service
     - `serviceType` (string): Type of service ("serverless-framework", "terraform", "cloudformation")
     - `region` (string, optional): AWS region
     - `profile` (string, optional): AWS profile name
   - Returns: Comprehensive list of resources (Lambda functions, API Gateway endpoints, DynamoDB tables, S3 buckets, IAM roles, event sources), resource types and identifiers, configuration details, relationships between resources

3. `service-summary`
   - Provides a comprehensive summary of your entire serverless service in a single API call
   - Inputs:
     - `serviceType` (string): Cloud service provider ('aws', 'gcp', 'azure')
     - `resources` (array, optional): Array of resource objects with id and type. Not required if serviceWideAnalysis is true.
     - `serviceWideAnalysis` (boolean, optional): Set to true to automatically fetch and analyze ALL resources in the service
     - `serviceName` (string, optional): Required if serviceWideAnalysis is true. For Serverless Framework, use "serviceName-stageName" format. For CloudFormation, use the exact stack name.
     - `cloudProvider` (string, optional): Required if serviceWideAnalysis is true. Specifies the cloud service provider ("aws")
     - `startTime` (string, optional): Start time for metrics and logs (ISO date or timestamp)
     - `endTime` (string, optional): End time for metrics and logs (ISO date or timestamp)
     - `period` (number, optional): Period for metrics in seconds (min 60, must be a multiple of 60, default 3600)
     - `region` (string, optional): AWS region
     - `profile` (string, optional): AWS profile name
   - Returns: Consolidated view of multiple cloud resources, detailed information for each resource, metrics and logs, configuration details

4. `deployment-history`
   - Retrieves deployment history for cloud infrastructure services
   - Inputs:
     - `serviceName` (string): Name of the service
     - `serviceType` (string): Type of service ("serverless-framework", "cloudformation")
     - `endDate` (string, optional): End date for deployment history (ISO format)
     - `region` (string, optional): AWS region
     - `profile` (string, optional): AWS profile name
   - Returns: Chronological history of stack events including resource creation, updates, and deletions

5. `docs`
   - Access comprehensive, always up-to-date documentation for Serverless Framework (sf) and Serverless Container Framework (scf) including code examples and usage patterns
   - Inputs:
     - `product` (string): Product to get documentation for. Must be one of: sf, scf
     - `paths` (string[], optional): Array of document paths to retrieve multiple documents in a single request. Paths are relative to the product base directory. If not provided, lists all available documents.
   - Returns: Documentation content or directory listing, including markdown content of requested documents, tree-like structure of available documentation, suggestions for alternative paths when requested documents don't exist

## Cloud Provider Tools

### AWS Tools

### AWS Service Information Tools

1. `aws-lambda-info`
   - Diagnoses AWS Lambda performance issues and configuration details
   - Inputs:
     - `functionNames` (string[]): Array of Lambda function names or ARNs
     - `startTime` (string, optional): Start time for metrics and logs (ISO date or timestamp)
     - `endTime` (string, optional): End time for metrics and logs (ISO date or timestamp)
     - `period` (number, optional): Period for metrics in seconds (min 60, must be a multiple of 60, default 3600)
     - `region` (string, optional): AWS region
     - `profile` (string, optional): AWS profile name
   - Returns: Detailed configuration, performance metrics, error logs, event source mappings, resource-based policies

2. `aws-iam-info`
   - Retrieves detailed information about AWS IAM roles and policies
   - Inputs:
     - `roleNames` (string[]): Array of IAM role names
     - `region` (string, optional): AWS region
     - `profile` (string, optional): AWS profile name
   - Returns: Complete role details, trust policies, managed policies, inline policies, permission boundaries, last used information

3. `aws-sqs-info`
   - Provides comprehensive information about AWS SQS queues
   - Inputs:
     - `queueNames` (string[]): Array of SQS queue names or URLs
     - `startTime` (string, optional): Start time for metrics (ISO date or timestamp)
     - `endTime` (string, optional): End time for metrics (ISO date or timestamp)
     - `period` (number, optional): Period for metrics in seconds (min 60, must be a multiple of 60, default 3600)
     - `region` (string, optional): AWS region
     - `profile` (string, optional): AWS profile name
   - Returns: Queue attributes, CloudWatch metrics, message processing rates, dead-letter queue configurations, visibility timeout and retention settings

4. `aws-s3-info`
   - Retrieves detailed information about AWS S3 buckets
   - Inputs:
     - `bucketNames` (string[]): Array of S3 bucket names
     - `startTime` (string, optional): Start time for metrics (ISO date or timestamp)
     - `endTime` (string, optional): End time for metrics (ISO date or timestamp)
     - `period` (number, optional): Period for metrics in seconds (min 60, must be a multiple of 60, default 3600)
     - `region` (string, optional): AWS region
     - `profile` (string, optional): AWS profile name
   - Returns: Bucket configuration, ACLs, policies, CORS settings, versioning status, website configuration, encryption settings, lifecycle rules, CloudWatch metrics

5. `aws-rest-api-gateway-info`
   - Diagnoses AWS REST API Gateway performance issues and configuration details
   - Inputs:
     - `apiIds` (string[]): Array of REST API Gateway API IDs
     - `startTime` (string, optional): Start time for metrics (ISO date or timestamp)
     - `endTime` (string, optional): End time for metrics (ISO date or timestamp)
     - `period` (number, optional): Period for metrics in seconds (min 60, must be a multiple of 60, default 3600)
     - `region` (string, optional): AWS region
     - `profile` (string, optional): AWS profile name
   - Returns: API configuration, stages, resources, methods, integrations, deployments, API keys, usage plans, VPC links, integration configurations, method-level settings

6. `aws-http-api-gateway-info`
   - Diagnoses AWS HTTP API Gateway performance issues and configuration details
   - Inputs:
     - `apiIds` (string[]): Array of HTTP API Gateway API IDs
     - `startTime` (string, optional): Start time for metrics (ISO date or timestamp)
     - `endTime` (string, optional): End time for metrics (ISO date or timestamp)
     - `period` (number, optional): Period for metrics in seconds (min 60, must be a multiple of 60, default 3600)
     - `region` (string, optional): AWS region
     - `profile` (string, optional): AWS profile name
   - Returns: Comprehensive metrics, API configuration, routes, integrations, stages, authorizers, deployments, logging configuration

7. `aws-dynamodb-info`
   - Retrieves detailed information about AWS DynamoDB tables
   - Inputs:
     - `tableNames` (string[]): Array of DynamoDB table names
     - `startTime` (string, optional): Start time for metrics (ISO date or timestamp)
     - `endTime` (string, optional): End time for metrics (ISO date or timestamp)
     - `period` (number, optional): Period for metrics in seconds (min 60, must be a multiple of 60, default 3600)
     - `region` (string, optional): AWS region
     - `profile` (string, optional): AWS profile name
   - Returns: Comprehensive metrics, latency statistics, table configuration, provisioned capacity details, global and local secondary indexes, stream settings

### AWS Logging and Monitoring Tools

1. `aws-logs-search`
   - Searches logs across multiple AWS CloudWatch Log Groups using CloudWatch Logs Insights
   - Inputs:
     - `logGroupIdentifiers` (string[]): Array of CloudWatch Log Group names or ARNs
     - `searchTerms` (string, optional): Search terms to filter logs
     - `startTime` (string, optional): Start time for logs (ISO date or timestamp)
     - `endTime` (string, optional): End time for logs (ISO date or timestamp)
     - `limit` (number, optional): Maximum number of log events to retrieve per log group
     - `region` (string, optional): AWS region
     - `profile` (string, optional): AWS profile name
   - Returns: Filtered log events matching the search criteria, organized by log group

2. `aws-logs-tail`
   - Retrieves the most recent logs from AWS CloudWatch Log Groups
   - Inputs:
     - `logGroupIdentifiers` (string[]): Array of CloudWatch Log Group names or ARNs
     - `filterPattern` (string, optional): Pattern to filter logs by
     - `startTime` (string, optional): Start time for logs (ISO date or timestamp)
     - `endTime` (string, optional): End time for logs (ISO date or timestamp)
     - `limit` (number, optional): Maximum number of log events to retrieve per log group
     - `region` (string, optional): AWS region
     - `profile` (string, optional): AWS profile name
   - Returns: Recent log events from the specified log groups

3. `aws-cloudwatch-alarms`
   - Gets information about AWS CloudWatch Alarms and their history
   - Inputs:
     - `alarmNames` (string[], optional): Array of CloudWatch alarm names
     - `alarmNamePrefix` (string, optional): Prefix to filter CloudWatch alarms by name
     - `alarmState` (string, optional): State to filter alarms by ("OK", "ALARM", "INSUFFICIENT_DATA", "all")
     - `startDate` (string, optional): Start date for alarm history (ISO date or timestamp)
     - `endDate` (string, optional): End date for alarm history (ISO date or timestamp)
     - `region` (string, optional): AWS region
     - `profile` (string, optional): AWS profile name
   - Returns: Alarm details, current state, configuration, and state change history

4. `aws-errors-info`
   - Analyzes AWS CloudWatch logs to identify and group similar error patterns
   - Inputs:
     - `startTime` (string, optional): Start time for logs (ISO date or timestamp)
     - `endTime` (string, optional): End time for logs (ISO date or timestamp)
     - `logGroupIdentifiers` (string[], optional): Array of CloudWatch Log Group names/ARNs
     - `serviceWideAnalysis` (boolean, optional): Flag to analyze all logs for a service
     - `serviceName` (string, optional): Required if serviceWideAnalysis is true
     - `serviceType` (string, optional): Required if serviceWideAnalysis is true ("serverless-framework" or "cloudformation")
     - `maxResults` (number, optional): Limit for the number of error groups to return
     - `confirmationToken` (string, optional): Required for timeframes longer than 3 hours
     - `region` (string, optional): AWS region
     - `profile` (string, optional): AWS profile name
   - Returns: Grouped error patterns with similarity matching, frequency statistics, example log entries for each error group, timeline of error occurrences
