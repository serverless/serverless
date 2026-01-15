# Serverless MCP Server

An MCP server for interacting with cloud services and infrastructure as code (IaC) platforms, enabling AI agents to gather detailed information about serverless applications and cloud resources for debugging and troubleshooting.

## Features

- **Comprehensive Cloud Resource Information**: Detailed metrics, configurations, and logs for serverless functions, roles, queues, storage, and API resources
- **Infrastructure as Code Integration**: Support for Serverless Framework, CloudFormation, AWS SAM, and Terraform resources
- **Parallel Data Fetching**: Efficient retrieval of metrics and logs across multiple resources
- **Error Grouping and Analysis**: Intelligent aggregation of error logs for easier troubleshooting
- **Flexible Time Range Support**: Customizable time periods for metrics and logs analysis
- **Service Summary Tool**: Consolidated view of multiple resource types in a single request

## Tools

#### `list-projects`

Lists all serverless projects found in the workspace. This tool must be used before `list-resources` to identify available projects.

**Inputs:**

- `workspaceRoots` (string[]): Array of root directories to search in. Each should be an absolute path to a directory containing your project files.
- `userConfirmed` (boolean): Set to true only after explicitly asking the user for permission to search the workspace paths AND receiving confirmation.

**Returns:** Information about found serverless projects, including their locations and service names

#### `list-resources`

Get resources associated with a serverless service for debugging and troubleshooting

**Inputs:**

- `serviceName` (string): Service name to get resources for
- `serviceType` (enum): Type of service ("serverless-framework", "cloudformation", "terraform")
- `region` (optional string): Region to use. Defaults to the default region from environment if not provided.
- `profile` (optional string): Profile to use for credentials. Defaults to the default profile from environment if not provided.

**Returns:** List of deployed resources with their types and physical IDs

#### `service-summary`

Provides a consolidated view of multiple cloud resources in a single request. This tool is the fastest and most efficient way to get a complete overview of your entire serverless application in a single API call.

**Inputs:**

- `serviceType` (enum): Cloud provider ("aws", "gcp", "azure")
- `resources` (optional object[]): Resources to analyze with their types and IDs. Not required if serviceWideAnalysis is true.
- `serviceWideAnalysis` (optional boolean): Set to true to automatically fetch and analyze ALL resources in the specified service.
- `serviceName` (optional string): Required if serviceWideAnalysis is true. For Serverless Framework, use "serviceName-stageName" format (e.g., "my-service-dev"). For CloudFormation, use the exact stack name.
- `cloudProvider` (optional enum): Required if serviceWideAnalysis is true. Specifies the cloud service provider ("aws").
- `startTime` (optional string): Start time for metrics. Can be an ISO date string or timestamp in milliseconds.
- `endTime` (optional string): End time for metrics. Can be an ISO date string or timestamp in milliseconds.
- `period` (optional number): Period for metrics in seconds
- `region` (optional string): Region to use. Defaults to the default region from environment if not provided.
- `profile` (optional string): Profile to use for credentials. Defaults to the default profile from environment if not provided.

**Returns:** Consolidated information about all requested resources

#### `docs`

Access comprehensive, always up-to-date documentation for Serverless Framework (sf) and Serverless Container Framework (scf). This tool provides a tree-like view of all available documentation when no paths are specified, allows browsing directory contents, and retrieves full markdown content for specific documents including code examples and usage patterns.

**Inputs:**

- `product` (enum): Product to get documentation for. Must be one of: sf, scf.
- `paths` (optional string[]): Array of document paths to retrieve MULTIPLE documents in a single request. Paths are relative to the product base directory. If not provided, lists all available documents.

**Returns:** Documentation content or directory listing, including:

- Markdown content of requested documents
- Tree-like structure of available documentation when no specific paths are requested
- Suggestions for alternative paths when requested documents don't exist
- Multiple document contents when multiple paths are specified

### AWS Services

#### `aws-lambda-info`

Get detailed information about AWS Lambda functions for debugging and troubleshooting serverless applications. Use this tool when Lambda functions are not working as expected to diagnose issues with configuration, permissions, or event source mappings.

**Inputs:**

- `functionNames` (string[]): Names or ARNs of Lambda functions. Accepts various formats: function name (e.g., "my-function"), function with alias (e.g., "my-function:v1"), full ARN, or partial ARN.
- `startTime` (optional string): Start time for metrics and logs. Can be an ISO date string or timestamp in milliseconds. Defaults to 24 hours ago if not provided.
- `endTime` (optional string): End time for metrics and logs. Can be an ISO date string or timestamp in milliseconds. Defaults to current time if not provided.
- `period` (optional number): Period for metrics in seconds (minimum 60, must be a multiple of 60). Defaults to 3600 seconds (1 hour).
- `region` (optional string): Region to use. Defaults to the default region from environment if not provided.
- `profile` (optional string): Profile to use for credentials. Defaults to the default profile from environment if not provided.

**Returns:** Function configurations, metrics, and grouped error logs, including:

- Configuration details (environment variables, execution role, etc.)
- CloudWatch metrics (Invocations, Errors, Throttles, Duration, ConcurrentExecutions, etc.)
- Error logs grouped by similarity for easier troubleshooting

#### `aws-iam-info`

Analyze IAM roles and their policies to identify permission issues. Use this tool when you need to analyze role configurations, attached managed policies, and inline policies.

**Inputs:**

- `roleNames` (string[]): Names of IAM roles. Each role name must consist of upper and lowercase alphanumeric characters with no spaces.
- `region` (optional string): Region to use. Defaults to the default region from environment if not provided.
- `profile` (optional string): Profile to use for credentials. Defaults to the default profile from environment if not provided.

**Returns:** Role details including:

- Role configuration
- Trust policies
- Attached managed policies with their documents
- Inline policies

#### `aws-sqs-info`

Examine SQS queues for messaging issues. Use this tool when SQS queues are not working as expected to diagnose issues with configuration, message processing, or dead letter queues.

**Inputs:**

- `queueNames` (string[]): Names or URLs of SQS queues. Accepts both queue names (e.g., "my-queue") or full queue URLs.
- `startTime` (optional string): Start time for metrics. Can be an ISO date string or timestamp in milliseconds. Defaults to 24 hours ago if not provided.
- `endTime` (optional string): End time for metrics. Can be an ISO date string or timestamp in milliseconds. Defaults to current time if not provided.
- `period` (optional number): Period for metrics in seconds (minimum 60, must be a multiple of 60). Defaults to 3600 seconds (1 hour).
- `region` (optional string): Region to use. Defaults to the default region from environment if not provided.
- `profile` (optional string): Profile to use for credentials. Defaults to the default profile from environment if not provided.

**Returns:** Queue attributes and metrics, including:

- Queue configuration (visibility timeout, message retention period, etc.)
- Dead letter queue configuration
- CloudWatch metrics (ApproximateNumberOfMessages, SentMessageSize, etc.)

#### `aws-s3-info`

Examine S3 bucket configurations and access controls. Use this tool when S3 buckets are not working as expected to diagnose issues with configuration, permissions, or access control.

**Inputs:**

- `bucketNames` (string[]): Names of S3 buckets
- `startTime` (optional string): Start time for metrics. Can be an ISO date string or timestamp in milliseconds. Defaults to 24 hours ago if not provided.
- `endTime` (optional string): End time for metrics. Can be an ISO date string or timestamp in milliseconds. Defaults to current time if not provided.
- `period` (optional number): Period for metrics in seconds (minimum 60, must be a multiple of 60). Defaults to 3600 seconds (1 hour).
- `region` (optional string): Region to use. Defaults to the default region from environment if not provided.
- `profile` (optional string): Profile to use for credentials. Defaults to the default profile from environment if not provided.

**Returns:** Bucket configuration, permissions, and metrics, including:

- Bucket configuration (location, ACL settings, policy)
- Encryption status, versioning configuration, and public access settings
- CloudWatch metrics (BucketSizeBytes, NumberOfObjects, AllRequests, etc.)

#### `aws-rest-api-gateway-info`

Analyze API Gateway configurations and endpoints. Use this tool when API Gateway endpoints are not working as expected to diagnose issues with configuration, resources, methods, or integrations.

**Inputs:**

- `apiIds` (string[]): IDs of REST API Gateways
- `startTime` (optional string): Start time for metrics. Can be an ISO date string or timestamp in milliseconds. Defaults to 24 hours ago if not provided.
- `endTime` (optional string): End time for metrics. Can be an ISO date string or timestamp in milliseconds. Defaults to current time if not provided.
- `period` (optional number): Period for metrics in seconds (minimum 60, must be a multiple of 60). Defaults to 3600 seconds (1 hour).
- `region` (optional string): Region to use. Defaults to the default region from environment if not provided.
- `profile` (optional string): Profile to use for credentials. Defaults to the default profile from environment if not provided.

**Returns:** API stages, resources, methods, and integrations, including:

- API configuration (name, description, endpoint configuration)
- Stages, resources, methods, and integrations
- Deployments, API keys, usage plans, and VPC links
- CloudWatch metrics (Count, Latency, IntegrationLatency, 4XXError, 5XXError, etc.)

#### `aws-http-api-gateway-info`

Diagnose HTTP API Gateway performance issues and configuration details. Use this tool when HTTP API endpoints are experiencing latency or errors, you need to analyze API request volume and error rates, investigate integration configurations, or verify routes, integrations, and authorizers.

**Inputs:**

- `apiIds` (string[]): HTTP API Gateway API IDs to get information about. You can get these from the list-resources tool.
- `startTime` (optional string): Start time for CloudWatch metrics. Can be an ISO date string or timestamp in milliseconds. Defaults to 24 hours ago if not provided.
- `endTime` (optional string): End time for CloudWatch metrics. Can be an ISO date string or timestamp in milliseconds. Defaults to current time if not provided.
- `period` (optional number): Period for CloudWatch metrics in seconds (minimum 60, default 3600). This is the granularity of the metric data points.
- `region` (optional string): Region to use. Defaults to the default region from environment if not provided.
- `profile` (optional string): Profile to use for credentials. Defaults to the default profile from environment if not provided.

**Returns:** Comprehensive HTTP API Gateway information, including:

- Complete API configuration with routes, integrations, and stages
- Authorizer configurations and deployment details
- Logging configuration and access settings
- Performance metrics including request counts, latency statistics, and error rates
- Integration latency and detailed route configurations

#### `aws-dynamodb-info`

Get detailed information about DynamoDB tables for debugging and troubleshooting serverless applications. This tool performs parallel API calls to efficiently retrieve comprehensive table information in a single request. Use this tool when DynamoDB tables are not working as expected to diagnose issues with configuration, throughput, or performance.

**Inputs:**

- `tableNames` (string[]): Array of DynamoDB table names to get information about.
- `startTime` (optional string): Start time for metrics. Can be an ISO date string or timestamp in milliseconds. Defaults to 24 hours ago if not provided.
- `endTime` (optional string): End time for metrics. Can be an ISO date string or timestamp in milliseconds. Defaults to current time if not provided.
- `period` (optional number): Period for metrics in seconds (minimum 60, must be a multiple of 60). Defaults to 3600 seconds (1 hour).
- `region` (optional string): Region to use. Defaults to the default region from environment if not provided.
- `profile` (optional string): Profile to use for credentials. Defaults to the default profile from environment if not provided.

**Returns:** Table configurations and metrics, including:

- Table configuration details (throughput, keys, indexes, etc.)
- Continuous backup information (point-in-time recovery status)
- Kinesis streaming destination details
- Resource policies attached to the table
- Performance metrics (read/write capacity, throttling events, latency)
- Stream metrics (if enabled)
- Error and system failure metrics
- Table replica auto-scaling settings
- Time-To-Live settings

#### `deployment-history`

Retrieves deployment history for cloud infrastructure services. Use this tool when you need to understand recent changes to your infrastructure, investigate when and why resources were created/updated/deleted, or correlate infrastructure changes with application issues.

**Inputs:**

- `serviceName` (string): Name of the service to get history for. For Serverless Framework projects, this must include the stage name (e.g., "my-service-dev"). For CloudFormation, use the exact stack name.
- `serviceType` (enum): Type of service ("serverless-framework" or "cloudformation").
- `endDate` (optional string): End date for deployment history in ISO format. If not provided, current time will be used. History will be retrieved for 7 days prior to this date.
- `region` (optional string): Region to use. Defaults to the default region from environment if not provided.
- `profile` (optional string): Profile to use for credentials. Defaults to the default profile from environment if not provided.

**Returns:** Deployment history information, including:

- Chronological list of stack-level events grouped by day
- Details of successful stack creation and update events with timestamps
- Status information and reason messages for completed operations
- Physical and logical resource identifiers for the stack

### `aws-logs-search`

Searches logs across multiple AWS CloudWatch Log Groups simultaneously using CloudWatch Logs Insights. This tool allows you to find and analyze log entries that match your search criteria across your entire AWS infrastructure.

**Inputs:**

- `logGroupIdentifiers` (string[]): Array of CloudWatch Log Group names or ARNs to search within.
- `searchTerms` (optional string): Search terms to filter logs. Multiple terms can be separated by spaces. Any of the terms can be present in a log entry for it to match (OR logic). Examples: "ERROR", "timed out", or specific request IDs like "1a2b3c4d-5e6f".
- `startTime` (optional string): Optional start time for logs. Defaults to 3 hours ago if not provided.
- `endTime` (optional string): Optional end time for logs. Defaults to current time if not provided.
- `limit` (optional number): Optional limit for the number of log events to return. Default is 100.
- `region` (optional string): Region to use. Defaults to the default region from environment if not provided.
- `profile` (optional string): Profile to use for credentials. Defaults to the default profile from environment if not provided.

**Returns:** Log search results, including:

- Timeline of events across multiple log groups in chronological order
- Log entries matching the search terms
- Summary of log sources and event counts

Common use cases include tracking request IDs across multiple Lambda functions, finding error patterns across services, or monitoring deployments across your serverless stack.

### `aws-logs-tail`

Retrieves the most recent logs from AWS CloudWatch Log Groups using the FilterLogEvents API. This tool is free to use (unlike CloudWatch Logs Insights) but less scalable for large volumes of logs.

**Inputs:**

- `logGroupIdentifiers` (string[]): Array of CloudWatch Log Group names or ARNs to search within.
- `filterPattern` (optional string): Optional pattern to filter logs by. Follows CloudWatch filter pattern syntax. Examples: "ERROR", "[timestamp, requestId, level=ERROR, message]", or "{ $.errorCode = \"NotFound\" }".
- `startTime` (optional string): Optional start time for logs. Defaults to 15 minutes ago if not provided.
- `endTime` (optional string): Optional end time for logs. Defaults to current time if not provided.
- `limit` (optional number): Optional limit for the number of log events to return. Default is 100.
- `region` (optional string): Region to use. Defaults to the default region from environment if not provided.
- `profile` (optional string): Profile to use for credentials. Defaults to the default profile from environment if not provided.

**Returns:** Recent log events, including:

- Log entries from the specified log groups
- Timestamp and stream information for each log entry
- Summary of log sources and event counts

Ideal for debugging recent Lambda executions or checking the latest logs from services. The filterPattern parameter supports CloudWatch Logs filter pattern syntax as described in the [AWS documentation](https://docs.aws.amazon.com/AmazonCloudWatch/latest/logs/FilterAndPatternSyntax.html)

#### `aws-errors-info`

Analyze AWS CloudWatch logs to identify and group similar error patterns. Use this tool when you need to understand recurring error patterns across your serverless application, identify the most frequent errors affecting your system, analyze error trends over time, or troubleshoot complex issues spanning multiple Lambda functions or services.

**Inputs:**

- `startTime` (optional string): Start time for logs. Can be an ISO date string or timestamp in milliseconds. Defaults to 3 hours ago if not provided.
- `endTime` (optional string): End time for logs. Can be an ISO date string or timestamp in milliseconds. Defaults to current time if not provided.
- `logGroupIdentifiers` (optional string[]): Array of CloudWatch Log Group names/ARNs to search within. Optional if serviceWideAnalysis is true.
- `serviceWideAnalysis` (optional boolean): Boolean flag to analyze all logs for a service. If true, serviceName and serviceType must be provided.
- `serviceName` (optional string): Required if serviceWideAnalysis is true. Format follows list-resources convention.
- `serviceType` (optional enum): Required if serviceWideAnalysis is true. The type of service to analyze logs for ("serverless-framework" or "cloudformation").
- `maxResults` (optional number): Limit for the number of error groups to return. Default is 100.
- `confirmationToken` (optional string): Required for timeframes longer than 3 hours.
- `region` (optional string): Region to use. Defaults to the default region from environment if not provided.
- `profile` (optional string): Profile to use for credentials. Defaults to the default profile from environment if not provided.

**Returns:** Error analysis results, including:

- Grouped error patterns with similarity matching
- Frequency statistics for each error pattern
- Example log entries for each error group
- Timeline of error occurrences
- Source log groups for each error

#### `aws-cloudwatch-alarms`

Get information about AWS CloudWatch Alarms and their history. This tool helps monitor the health of your AWS resources by retrieving alarm configurations, current states, and state change history.

**Inputs:**

- `alarmNames` (optional string[]): Array of CloudWatch alarm names to retrieve. Either alarmNames or alarmNamePrefix must be provided.
- `alarmNamePrefix` (optional string): Prefix to filter CloudWatch alarms by name. Either alarmNames or alarmNamePrefix must be provided.
- `alarmState` (optional enum): Alarm state to filter by (OK, ALARM, INSUFFICIENT_DATA, all). Default is "all".
- `startDate` (optional string): Start date for alarm history. Can be an ISO date string or timestamp in milliseconds. Defaults to 24 hours ago if not provided.
- `endDate` (optional string): End date for alarm history. Can be an ISO date string or timestamp in milliseconds. Defaults to current time if not provided.
- `region` (optional string): Region to use. Defaults to the default region from environment if not provided.
- `profile` (optional string): Profile to use for credentials. Defaults to the default profile from environment if not provided.

**Returns:** CloudWatch alarm information, including:

- Alarm configurations (name, description, threshold, comparison operator)
- Current alarm states and reasons
- Metric information (namespace, name, dimensions, statistic)
- Alarm state change history
- Actions configured for different alarm states

## Getting Started

To run the MCP server locally, follow these steps:

```bash
npm install
```

To start the server, run the following command:

```bash
npm start
```

This will start the MCP server on the default port (3001). You can specify a different port by setting the `PORT` environment variable:

```bash
PORT=8080 npm start
```

## Credentials

### AWS

This server uses the default AWS credentials chain to access AWS resources. The AWS SDK for JavaScript v3 checks credential providers in the following order:

1. Environment variables (`AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`)
2. AWS SSO credentials
3. AWS shared credentials and config files (`~/.aws/credentials` and `~/.aws/config`)

#### Setting Up AWS Credentials

If you haven't configured AWS credentials yet, the easiest way is to use the AWS CLI:

```bash
# Configure standard AWS credentials
aws configure
```

This interactive wizard will prompt you for:

- AWS Access Key ID
- AWS Secret Access Key
- Default region name
- Default output format

You can also set up named profiles:

```bash
# Configure a named profile
aws configure --profile my-profile-name
```

The credentials will be stored in `~/.aws/credentials` and the configuration in `~/.aws/config`.

#### AWS Profiles

If you have multiple AWS profiles configured, you should explicitly specify which profile to use when running MCP tools. Each tool accepts a `profile` parameter that can be used to specify the AWS profile name.

```bash
# List available AWS profiles
aws configure list-profiles
```

If no profile is specified, the default profile will be used. The default profile is either the profile named "default" or the profile specified by the `AWS_PROFILE` environment variable.

#### AWS SSO Support

The MCP server supports AWS SSO credentials. There are two ways to configure AWS SSO:

##### Option 1: Manual Configuration

Manually edit your AWS config file (`~/.aws/config`) to add an SSO profile:

```ini
[profile my-sso-profile]
sso_start_url = https://my-sso-portal.awsapps.com/start
sso_region = us-east-1
sso_account_id = 123456789012
sso_role_name = SSOReadOnlyRole
region = us-west-2
```

##### Option 2: AWS CLI Configuration Wizard

Use the AWS CLI to set up SSO automatically:

```bash
aws configure sso
```

Follow the prompts to enter your SSO start URL, region, account ID, and role name.

#### Using AWS SSO

After configuring SSO, you need to:

1. Log in to AWS SSO:

   ```bash
   aws sso login --profile my-sso-profile
   ```

2. Specify the SSO profile when using MCP tools:

   ```json
   profile: "my-sso-profile"
   ```

#### AWS Regions

Most MCP tools require an AWS region. You can specify the region in several ways:

1. In your service configuration file (e.g., `serverless.yml` for Serverless Framework projects)
2. As a parameter when using MCP tools (`region: "us-east-1"`)
3. In your AWS config file (`~/.aws/config`)
4. Via the `AWS_REGION` environment variable

#### Best Practices

- **Always specify the profile explicitly** when using MCP tools, especially in environments with multiple AWS accounts or roles
- If the region is not specified in your service configuration, **always provide the region parameter**
- For Serverless Framework projects, check the `provider.region` setting in your `serverless.yml` file
- If you encounter credential errors, verify that your credentials are valid and that you have the necessary permissions

For more details, see the [AWS SDK documentation on standardized credentials](https://docs.aws.amazon.com/sdkref/latest/guide/standardized-credentials.html).

## Integration with Cursor

To use this MCP server with Cursor:

1. Start the server using `npm start`
2. Configure it in Cursor's MCP Servers settings page with the following details:
   - **Name**: serverless
   - **Type**: sse
   - **Server URL**: `http://localhost:3001/sse`

## Using with the MCP Client

You can use this server with any MCP client, including the official MCP client library. Here's an example of how to connect to the server using the MCP client:

```javascript
const { createClient } = require('@mcp/client')

// Create a client that connects to the server
const client = createClient({
  url: 'http://localhost:3001',
})

// Call the list-resources tool
client
  .callTool('list-resources', {
    serviceName: 'my-service',
    serviceType: 'serverless-framework',
  })
  .then((result) => {
    console.log('Resources:', result)
  })
  .catch((error) => {
    console.error('Error:', error)
  })
```
