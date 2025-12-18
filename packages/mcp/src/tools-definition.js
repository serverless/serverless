import { z } from 'zod'
import { getIacResources } from './tools/list-resources.js'
import { getLambdaInfo } from './tools/aws/lambda-info.js'
import { getIamInfo } from './tools/aws/iam-info.js'
import { getSqsInfo } from './tools/aws/sqs-info.js'
import { getS3Info } from './tools/aws/s3-info.js'
import { getRestApiGatewayInfo } from './tools/aws/rest-api-gateway-info.js'
import { getHttpApiGatewayInfo } from './tools/aws/http-api-gateway-info.js'
import { getDynamoDBInfo } from './tools/aws/dynamodb-info.js'
import { getServiceSummary } from './tools/service-summary.js'
import { listProjects } from './tools/list-projects.js'
import { getLogsSearch } from './tools/aws/aws-logs-search.js'
import { getLogsTail } from './tools/aws/aws-logs-tail.js'
import { getCloudWatchAlarmsInfo } from './tools/aws/aws-cloudwatch-alarms.js'
import { getDeploymentHistory } from './tools/deployment-history.js'
import { getAwsErrorsInfo } from './tools/aws/errors-info.js'
import { getDocs } from './tools/docs.js'

// Standard guidance for handling AWS credentials errors
const AWS_CREDENTIALS_ERROR_HANDLING =
  '⚠️ HANDLING CREDENTIALS ERRORS ⚠️\n' +
  'If you encounter ANY AWS credentials errors (e.g., "Region is missing", "Access Denied", "Invalid credentials", "Could not load credentials from any providers"):\n' +
  '1. CLEARLY explain the specific error that occurred and what it means\n' +
  '2. ALWAYS inform the user which profile and region were used in the failed request\n' +
  '3. DO NOT attempt to use ANY profile unless EXPLICITLY provided by the user - NEVER try random profiles\n' +
  '4. Ask the user to EXPLICITLY specify which profile and region they want to use\n' +
  '5. If credentials appear to be misconfigured, provide guidance: "You may need to configure your AWS credentials by running `aws configure` and following the prompts"\n' +
  '6. WAIT for the user to EXPLICITLY provide a profile name before trying again\n' +
  '7. DO NOT switch to using AWS CLI commands for subsequent requests just because the tool encountered credentials errors'

// Common parameters for cloud provider tools
export const regionParam = z
  .string()
  .optional()
  .describe(
    'BEFORE USING THIS TOOL, check if region is specified in the service configuration. ' +
      'For Serverless Framework, the region may be specified in the serverless.yml file. Check provider.region in the file. ' +
      'If provider.region is not specified in Serverless Framework configuration, this parameter must be set to `us-east-1`.',
  )

export const profileParam = z
  .string()
  .optional()
  .describe(
    'Profile used for configuration of cloud provider credentials.' +
      'BEFORE USING THIS TOOL, check if profile is specified in the service configuration.' +
      'For Serverless Framework, the profile may be specified in the serverless.yml file. Check provider.profile in the file.' +
      'If not provided, the profile from environment will be used.',
  )

/**
 * Register all tools on the provided server instance
 * @param {McpServer} server - The MCP server instance to register tools on
 */
export function registerTools(server) {
  // Helper functions for dynamic date generation
  const getNow = () => new Date()
  const getThreeHoursAgo = () => new Date(Date.now() - 3 * 60 * 60 * 1000)
  const getTwentyFourHoursAgo = () => new Date(Date.now() - 24 * 60 * 60 * 1000)
  const getFifteenMinutesAgo = () => new Date(Date.now() - 15 * 60 * 1000)

  // Get today's date in ISO format for examples
  const getTodayDate = () => {
    const today = new Date()
    // Return the full ISO string which includes the correct timezone (Z indicates UTC)
    return today.toISOString()
  }

  // Today's date for AI to reference
  const todayDate = getTodayDate()

  // Register the resources listing tool for debugging serverless applications
  server.tool(
    'list-resources',
    '⚠️ MANDATORY PREREQUISITE: You MUST ALWAYS run the list-projects tool FIRST before using this tool! ⚠️\n\n' +
      'Lists all cloud resources associated with a serverless service.\n\n' +
      'REQUIRED WORKFLOW:\n' +
      '1. FIRST: Run the list-projects tool to identify all serverless projects in the workspace\n' +
      '2. If multiple projects are found, explicitly ask the user which project to use\n' +
      '3. ALWAYS confirm with the user which service they want information about, even if only one project is found\n' +
      "4. NEVER assume which service the user is interested in - if it is not completely clear from the user's request, you MUST ask for clarification\n" +
      '5. Check if stage, region, and profile are specified in the service configuration - if found, USE THESE VALUES in subsequent tool requests\n' +
      '6. ONLY THEN use this list-resources tool with the confirmed project information\n\n' +
      AWS_CREDENTIALS_ERROR_HANDLING +
      '\n\n' +
      'This tool adapts to different infrastructure types: for Serverless Framework or CloudFormation services, it queries the actual deployed resources; for Terraform projects, it provides instructions on how to list resources using terraform state commands. This tool helps identify specific resources (Lambda functions, IAM roles, etc.) that you can then investigate in detail with other specialized tools.',
    {
      serviceName: z
        .string()
        .describe(
          '⚠️ SERVICE NAME REQUIREMENTS BY PROJECT TYPE ⚠️\n\n' +
            '=== FOR SERVERLESS FRAMEWORK PROJECTS ===\n' +
            '• FORMAT: "serviceName-stageName" (REQUIRED)\n' +
            '• EXAMPLES:\n' +
            '  ✓ CORRECT: "my-service-dev", "superapp-platform-prod"\n' +
            '  ✗ INCORRECT: "superapp-platform" (missing stage)\n' +
            '• The stage name (e.g., "dev", "prod", "staging") MUST be included\n\n' +
            'HOW TO FIND THE STAGE NAME:\n' +
            '1. Open the serverless.yml file for the project\n' +
            '2. Look for provider.stage in the file (e.g., provider: { stage: "dev" })\n' +
            '3. If provider.stage is not specified, use "dev" (the default)\n' +
            '4. If you cannot determine the stage, ask the user which stage to check\n\n' +
            '=== FOR CLOUDFORMATION PROJECTS ===\n' +
            '• You MUST ask the user for the exact CloudFormation stack name\n' +
            '• CloudFormation stack names are case-sensitive\n' +
            '• Example: "my-application-stack"\n\n' +
            '=== FOR TERRAFORM PROJECTS ===\n' +
            '• Provide the name of the Terraform project\n' +
            '• Example: "my-terraform-project"\n\n' +
            'ALWAYS ask for clarification if you are unsure which service name to use.',
        ),
      serviceType: z
        .enum(['serverless-framework', 'terraform', 'cloudformation'])
        .describe(
          'The type of service to get resources for. Currently supported: "serverless-framework", ' +
            '"cloudformation", and "terraform". If you are not sure which type to use, ask the user.',
        ),
      region: regionParam,
      profile: profileParam,
    },
    async (params) => {
      return await getIacResources(params)
    },
  )

  // Register the AWS Lambda information tool for debugging and troubleshooting Lambda functions
  server.tool(
    'aws-lambda-info',
    'Provides comprehensive diagnostics for AWS Lambda functions by fetching configuration details, resource policies, event source mappings, CloudWatch metrics, and error logs. USE THIS TOOL WHEN: (1) Lambda functions are failing, timing out, or returning errors, (2) You need to analyze function performance metrics like invocation count, duration, and error rate, (3) You need to investigate error logs with detailed stack traces and error patterns, (4) You need to understand Lambda configuration details like memory allocation, timeout settings, and environment variables, (5) You need to examine event source mappings connecting your Lambda to services like SQS, DynamoDB streams, or Kinesis, or (6) You need to review resource-based policies controlling who can invoke your function. The tool automatically groups similar errors to help identify recurring issues and accepts function names in various formats including aliases and ARNs.\n\n' +
      AWS_CREDENTIALS_ERROR_HANDLING,
    {
      functionNames: z
        .array(z.string())
        .describe(
          'Array of Lambda function names or ARNs to get information about. ' +
            'Accepts various formats: function name (e.g., "my-function"), function with alias (e.g., "my-function:v1"), ' +
            'full ARN (e.g., "arn:aws:lambda:us-west-2:123456789012:function:my-function"), ' +
            'or partial ARN (e.g., "123456789012:function:my-function"). ' +
            'You can append a version number or alias to any of the formats.',
        ),
      startTime: z
        .string()
        .optional()
        .default(() => getThreeHoursAgo().toISOString())
        .describe(
          `Optional start time for CloudWatch metrics and error logs. Can be an ISO date string (e.g., "${todayDate}") ` +
            'or a timestamp in milliseconds. If not provided, defaults to 3 hours ago.',
        ),
      endTime: z
        .string()
        .optional()
        .default(() => getNow().toISOString())
        .describe(
          'Optional end time for CloudWatch metrics and error logs. Can be an ISO date string (e.g., "2023-01-01T00:00:00Z") ' +
            `or a timestamp in milliseconds. Today's date is ${todayDate}. If not provided, defaults to current time.`,
        ),
      period: z
        .number()
        .min(60)
        .default(3600)
        .optional()
        .describe(
          'Optional period for CloudWatch metrics in seconds (minimum 60, default 3600). ' +
            'This is the granularity of the metric data points. Must be a multiple of 60 seconds. ' +
            'Default is 3600 seconds (1 hour).',
        ),
      region: regionParam,
      profile: profileParam,
      confirmationToken: z
        .string()
        .optional()
        .describe(
          'Confirmation token for historical or extended timeframe queries. This is provided by the tool when confirmation is needed.',
        ),
    },
    async (params) => {
      return await getLambdaInfo(params)
    },
  )

  // Register the AWS IAM information tool for debugging and troubleshooting IAM roles and policies
  server.tool(
    'aws-iam-info',
    'Analyzes AWS IAM roles and their policies to identify permission issues. USE THIS TOOL WHEN: (1) You encounter "Access Denied" errors in your serverless application, (2) Lambda functions or other resources cannot access AWS services they need, (3) You need to verify the exact permissions a role has, or (4) You need to understand trust relationships between services. The tool retrieves complete role details including trust policies (who can assume the role), all attached managed policies, and inline policies with their full JSON documents. This detailed policy analysis is essential for resolving permission-related errors in serverless applications.\n\n' +
      AWS_CREDENTIALS_ERROR_HANDLING,
    {
      roleNames: z
        .array(
          z
            .string()
            .regex(/[\w+=,.@-]+/)
            .max(64),
        )
        .describe(
          'Array of IAM role names to get information about. ' +
            'Each role name must consist of upper and lowercase alphanumeric characters with no spaces. ' +
            'You can also include any of the following characters: _+=,.@- ' +
            'Maximum length of each role name is 64 characters.',
        ),
      region: regionParam,
      profile: profileParam,
    },
    async (params) => {
      return await getIamInfo(params)
    },
  )

  // Register the AWS SQS information tool for debugging and troubleshooting SQS queues
  server.tool(
    'aws-sqs-info',
    'Diagnoses AWS SQS queue issues and message processing problems. USE THIS TOOL WHEN: (1) Messages are not being processed correctly or are stuck in queues, (2) You need to check queue depths and processing rates over time, (3) You need to verify dead-letter queue configurations, or (4) You need to understand queue attributes like visibility timeout and message retention. The tool accepts both queue names and full queue URLs, retrieves all queue attributes including redrive policies, and collects CloudWatch metrics such as ApproximateNumberOfMessages, NumberOfMessagesSent, NumberOfMessagesReceived, and NumberOfMessagesDeleted. Especially valuable for debugging Lambda functions triggered by SQS events.\n\n' +
      AWS_CREDENTIALS_ERROR_HANDLING,
    {
      queueNames: z
        .array(z.string())
        .describe(
          'Array of SQS queue names or URLs to get information about. ' +
            'Accepts both queue names (e.g., "my-queue") or full queue URLs (e.g., "https://sqs.us-west-2.amazonaws.com/123456789012/my-queue").',
        ),
      startTime: z
        .string()
        .optional()
        .default(() => getTwentyFourHoursAgo().toISOString())
        .describe(
          `Optional start time for CloudWatch metrics. Can be an ISO date string (e.g., "${todayDate}") ` +
            'or a timestamp in milliseconds. If not provided, defaults to 24 hours ago.',
        ),
      endTime: z
        .string()
        .optional()
        .default(() => getNow().toISOString())
        .describe(
          'Optional end time for CloudWatch metrics. Can be an ISO date string (e.g., "2023-01-01T00:00:00Z") ' +
            `or a timestamp in milliseconds. Today's date is ${todayDate}. If not provided, defaults to current time.`,
        ),
      period: z
        .number()
        .min(60)
        .default(3600)
        .optional()
        .describe(
          'Optional period for CloudWatch metrics in seconds (minimum 60, default 3600). ' +
            'This is the granularity of the metric data points. Must be a multiple of 60 seconds. ' +
            'Default is 3600 seconds (1 hour).',
        ),
      region: regionParam,
      profile: profileParam,
    },
    async (params) => {
      return await getSqsInfo(params)
    },
  )

  // Register the AWS S3 information tool for debugging and troubleshooting S3 buckets
  server.tool(
    'aws-s3-info',
    'Examines AWS S3 bucket configurations and access controls. USE THIS TOOL WHEN: (1) Files cannot be uploaded or downloaded from buckets, (2) You need to verify bucket permissions and policies, (3) You need to check bucket encryption settings, or (4) You need to analyze bucket metrics like request counts and error rates. The tool retrieves complete bucket configuration including ACLs, policies, CORS settings, versioning status, website configuration, encryption settings, lifecycle rules, and logging configuration. It also collects CloudWatch metrics such as AllRequests, GetRequests, PutRequests, and 4xxErrors to help identify access issues and usage patterns.\n\n' +
      AWS_CREDENTIALS_ERROR_HANDLING,
    {
      bucketNames: z
        .array(z.string())
        .describe('Array of S3 bucket names to get information about.'),
      startTime: z
        .string()
        .optional()
        .default(() => getTwentyFourHoursAgo().toISOString())
        .describe(
          `Optional start time for CloudWatch metrics. Can be an ISO date string (e.g., "${todayDate}") ` +
            'or a timestamp in milliseconds. If not provided, defaults to 24 hours ago.',
        ),
      endTime: z
        .string()
        .optional()
        .default(() => getNow().toISOString())
        .describe(
          'Optional end time for CloudWatch metrics. Can be an ISO date string (e.g., "2023-01-01T00:00:00Z") ' +
            `or a timestamp in milliseconds. Today's date is ${todayDate}. If not provided, defaults to current time.`,
        ),
      period: z
        .number()
        .min(60)
        .default(3600)
        .optional()
        .describe(
          'Optional period for CloudWatch metrics in seconds (minimum 60, default 3600). ' +
            'This is the granularity of the metric data points. Must be a multiple of 60 seconds. ' +
            'Default is 3600 seconds (1 hour).',
        ),
      region: regionParam,
      profile: profileParam,
    },
    async (params) => {
      return await getS3Info(params)
    },
  )

  // Register the AWS REST API Gateway information tool for debugging and troubleshooting API Gateway APIs
  server.tool(
    'aws-rest-api-gateway-info',
    'Troubleshoots AWS REST API Gateway endpoints and configurations. USE THIS TOOL WHEN: (1) API endpoints return unexpected errors or responses, (2) You need to verify API resource paths and methods, (3) You need to check Lambda integrations with API Gateway, or (4) You need to understand API authorization and throttling settings. The tool provides comprehensive details by fetching multiple API components in parallel, including stages, resources, methods, integrations, deployments, API keys, usage plans, and VPC links. For each resource, it retrieves detailed integration configurations including URI endpoints, request/response mapping templates, content handling settings, and authorization methods. The tool also collects method-level settings like API key requirements, throttling limits, and caching configurations.\n\n' +
      AWS_CREDENTIALS_ERROR_HANDLING,
    {
      apiIds: z
        .array(z.string())
        .describe(
          'Array of REST API Gateway API IDs to get information about.',
        ),
      startTime: z
        .string()
        .optional()
        .default(() => getTwentyFourHoursAgo().toISOString())
        .describe(
          `Optional start time for CloudWatch metrics. Can be an ISO date string (e.g., "${todayDate}") ` +
            'or a timestamp in milliseconds. If not provided, defaults to 24 hours ago.',
        ),
      endTime: z
        .string()
        .optional()
        .default(() => getNow().toISOString())
        .describe(
          'Optional end time for CloudWatch metrics. Can be an ISO date string (e.g., "2023-01-01T00:00:00Z") ' +
            `or a timestamp in milliseconds. Today's date is ${todayDate}. If not provided, defaults to current time.`,
        ),
      period: z
        .number()
        .min(60)
        .default(3600)
        .optional()
        .describe(
          'Optional period for CloudWatch metrics in seconds (minimum 60, default 3600). ' +
            'This is the granularity of the metric data points. Must be a multiple of 60 seconds. ' +
            'Default is 3600 seconds (1 hour).',
        ),
      region: regionParam,
      profile: profileParam,
    },
    async (params) => {
      return await getRestApiGatewayInfo(params)
    },
  )

  // Register the AWS HTTP API Gateway information tool for debugging and troubleshooting HTTP APIs
  server.tool(
    'aws-http-api-gateway-info',
    'Diagnoses AWS HTTP API Gateway performance issues and configuration details. USE THIS TOOL WHEN: (1) HTTP API endpoints are experiencing latency or errors, (2) You need to analyze API request volume and error rates, (3) You need to investigate integration configurations, or (4) You need to verify routes, integrations, and authorizers. The tool fetches comprehensive metrics in parallel including request counts, latency statistics, 4XX/5XX error rates, and integration latency. It also retrieves the complete API configuration with routes, integrations, stages, authorizers, deployments, and logging configuration. Especially valuable for troubleshooting serverless applications that use HTTP API Gateway for endpoints.\n\n' +
      AWS_CREDENTIALS_ERROR_HANDLING,
    {
      apiIds: z
        .array(z.string())
        .min(1, 'At least one HTTP API Gateway API ID is required')
        .describe(
          'HTTP API Gateway API IDs to get information about. You can get these from the list-resources tool.',
        ),
      startTime: z
        .string()
        .optional()
        .default(() => getTwentyFourHoursAgo().toISOString())
        .describe(
          `Optional start time for CloudWatch metrics (ISO string or timestamp, e.g., "${todayDate}"). ` +
            'Default is 24 hours ago.',
        ),
      endTime: z
        .string()
        .optional()
        .default(() => getNow().toISOString())
        .describe(
          `Optional end time for CloudWatch metrics (ISO string or timestamp). Today's date is ${todayDate}. ` +
            'Default is now.',
        ),
      period: z
        .number()
        .min(60)
        .default(3600)
        .optional()
        .describe(
          'Optional period for CloudWatch metrics in seconds (minimum 60, default 3600). ' +
            'This is the granularity of the metric data points. Must be a multiple of 60 seconds. ' +
            'Default is 3600 seconds (1 hour).',
        ),
      region: regionParam,
      profile: profileParam,
    },
    async (params) => {
      return await getHttpApiGatewayInfo(params)
    },
  )

  // Register the AWS DynamoDB information tool for debugging and troubleshooting DynamoDB tables
  server.tool(
    'aws-dynamodb-info',
    'Diagnoses AWS DynamoDB table performance issues and configuration details. USE THIS TOOL WHEN: (1) DynamoDB tables are experiencing throttling or capacity issues, (2) You need to analyze read/write capacity utilization and throughput, (3) You need to investigate latency patterns for different operations, or (4) You need to verify table configuration details like keys, indexes, and TTL settings. The tool fetches comprehensive metrics in parallel including read/write capacity usage, throttling events, latency statistics, stream metrics, and error counts. It also retrieves the complete table configuration with provisioned capacity, global secondary indexes, local secondary indexes, and stream settings. Especially valuable for troubleshooting serverless applications that use DynamoDB for data storage.\n\n' +
      AWS_CREDENTIALS_ERROR_HANDLING,
    {
      tableNames: z
        .array(z.string())
        .min(1, 'At least one table name is required')
        .describe('DynamoDB table names to get information about'),
      startTime: z
        .string()
        .optional()
        .default(() => getTwentyFourHoursAgo().toISOString())
        .describe(
          `Optional start time for CloudWatch metrics. Can be an ISO date string (e.g., "${todayDate}") ` +
            'or a timestamp in milliseconds. If not provided, defaults to 24 hours ago.',
        ),
      endTime: z
        .string()
        .optional()
        .describe(
          'Optional end time for CloudWatch metrics. Can be an ISO date string (e.g., "2023-01-01T00:00:00Z") ' +
            `or a timestamp in milliseconds. Today's date is ${todayDate}. If not provided, defaults to current time.`,
        ),
      period: z
        .number()
        .min(60)
        .default(3600)
        .optional()
        .describe(
          'Optional period for CloudWatch metrics in seconds (minimum 60, default 3600). ' +
            'This is the granularity of the metric data points. Must be a multiple of 60 seconds. ' +
            'Default is 3600 seconds (1 hour).',
        ),
      region: regionParam,
      profile: profileParam,
    },
    async (params) => {
      return await getDynamoDBInfo(params)
    },
  )

  // Register the tool for listing serverless projects in the workspace
  server.tool(
    'list-projects',
    '⚠️⚠️⚠️ MANDATORY USER CONFIRMATION REQUIRED ⚠️⚠️⚠️\n\n' +
      'Lists all serverless projects found in the workspace.\n\n' +
      'REQUIRED WORKFLOW:\n' +
      '1. BEFORE CALLING THIS TOOL, you MUST FIRST explicitly ask the user: "Should I search for serverless projects in the following workspace paths: [list the paths]?"\n' +
      '2. You MUST WAIT for explicit user confirmation BEFORE proceeding\n' +
      '3. If the user confirms, then you may call this tool with userConfirmed=true\n' +
      '4. If the user does NOT confirm, you MUST ask them to provide the FULL ABSOLUTE PATH to the project directory\n' +
      '5. Once the user provides a specific path, REPLACE the workspaceRoots array with ONLY that path\n\n' +
      'AFTER RUNNING THIS TOOL:\n' +
      '1. When you receive the results, you MUST present the list of found projects to the user\n' +
      '2. For each project, show its type (serverless-framework, cloudformation, etc.) and path\n' +
      '3. Ask the user to confirm which specific project they want to work with\n\n' +
      'There are NO EXCEPTIONS to this workflow. Even if the user mentions a project name, you MUST still ask for confirmation of the workspace paths or get a specific full path.\n\n' +
      'This tool helps identify serverless projects across multiple directories, which is useful when you have multiple directories open in your IDE or when a single workspace contains multiple serverless projects in different subdirectories. Currently supports projects using serverless.yml (Serverless Framework) and CloudFormation projects (YAML/YML files with AWSTemplateFormatVersion).',
    {
      workspaceRoots: z
        .array(z.string())
        .describe(
          'Array of root directories to search in. Each should be an absolute path to a directory containing your project files. If the user specifies a particular project path, this array should ONLY contain that full absolute path.',
        ),
      userConfirmed: z
        .boolean()
        .optional()
        .describe(
          'Set this to true ONLY after explicitly asking the user for permission to search the workspace paths AND receiving confirmation. This parameter is REQUIRED.',
        ),
    },
    async (params) => {
      return await listProjects(params)
    },
  )

  // Register the service summary tool for fetching data about multiple resources at once
  server.tool(
    'service-summary',
    "Provides a consolidated view of multiple cloud resources in a single request. This tool is the FASTEST and MOST EFFICIENT way to get a complete overview of your entire serverless application in a single tool call. BEFORE USING THIS TOOL: Use the list-projects tool to identify all serverless projects in the workspace. If multiple projects are found, confirm with the user which project to use.\n\nUSE THIS TOOL WHEN:\n(1) You need a quick overview of an entire service\n(2) You need to analyze interactions between different resource types\n(3) You want to reduce the number of API calls for efficiency\n(4) You need a holistic view of a serverless application's components\n\nKEY FEATURES:\n• Service-wide analysis: Set serviceWideAnalysis=true to automatically fetch and analyze ALL resources in a service\n• Parallel processing: All resource information is fetched simultaneously for maximum efficiency\n• Comprehensive data: Returns the same detailed information as individual resource-specific tools\n\nSUPPORTED AWS RESOURCE TYPES:\n• lambda - AWS Lambda functions\n• iam - AWS IAM roles and policies\n• sqs - Amazon SQS queues\n• s3 - Amazon S3 buckets\n• restapigateway - AWS REST API Gateway\n• httpapigateway - AWS HTTP API Gateway\n• dynamodb - Amazon DynamoDB tables\n\nThis tool is MUCH MORE EFFICIENT than making individual calls to resource-specific tools. Use it as your first step when investigating service-wide issues or getting a complete picture of your application.\n\n" +
      AWS_CREDENTIALS_ERROR_HANDLING,
    {
      serviceType: z
        .enum(['aws', 'gcp', 'azure'])
        .describe(
          'The cloud service provider to use. Currently, only "aws" is fully supported.',
        ),
      resources: z
        .array(
          z.object({
            id: z
              .string()
              .describe(
                'Resource identifier (e.g., Lambda function name/ARN, IAM role name, or SQS queue name/URL)',
              ),
            type: z
              .string()
              .describe(
                'Resource type ("lambda", "iam", "sqs", "s3", "restapigateway", "httpapigateway", "dynamodb")',
              ),
          }),
        )
        .optional()
        .describe(
          'Array of resource objects to get information about. Each object must have "id" and "type" properties. Not required if serviceWideAnalysis is true.',
        ),
      serviceWideAnalysis: z
        .boolean()
        .optional()
        .default(false)
        .describe(
          'Set to true to automatically fetch and analyze ALL resources in the specified service. When true, serviceName and serviceType must be provided.',
        ),
      serviceName: z
        .string()
        .optional()
        .describe(
          'Required if serviceWideAnalysis is true. For Serverless Framework, use "serviceName-stageName" format (e.g., "my-service-dev"). For CloudFormation, use the exact stack name.',
        ),
      cloudProvider: z
        .enum(['aws'])
        .optional()
        .describe(
          'Required if serviceWideAnalysis is true. Specifies the cloud service provider.',
        ),
      startTime: z
        .string()
        .optional()
        .default(() => getThreeHoursAgo().toISOString())
        .describe(
          `Optional start time for metrics and logs. Can be an ISO date string (e.g., "${todayDate}") ` +
            'or a timestamp in milliseconds. If not provided, defaults to 3 hours ago.',
        ),
      endTime: z
        .string()
        .optional()
        .default(() => getNow().toISOString())
        .describe(
          'Optional end time for metrics and logs. Can be an ISO date string (e.g., "2023-01-01T00:00:00Z") ' +
            `or a timestamp in milliseconds. Today's date is ${todayDate}. If not provided, defaults to current time.`,
        ),
      period: z
        .number()
        .min(60)
        .default(3600)
        .optional()
        .describe(
          'Optional period for metrics in seconds (minimum 60, default 3600). ' +
            'This is the granularity of the metric data points. Default is 3600 seconds.',
        ),
      region: regionParam,
      profile: profileParam,
    },
    async (params) => {
      return await getServiceSummary(params)
    },
  )

  server.tool(
    'aws-logs-search',
    'Searches logs across multiple AWS CloudWatch Log Groups simultaneously using CloudWatch Logs Insights. This tool allows you to find and analyze log entries that match your search criteria across your entire AWS infrastructure.\n\n' +
      'Common use cases include: tracking request IDs across multiple Lambda functions, finding error patterns across services, or monitoring deployments across your serverless stack. Results are returned in chronological order to help you understand the sequence of events.\n\n' +
      'DIFFERENCE FROM ERRORS-INFO TOOL:\n' +
      '• aws-logs-search with errorsOnly=true: Returns RAW LOG ENTRIES that match error patterns, showing the exact log messages with their context, timestamps, and log group sources.\n' +
      '• errors-info tool: Performs PATTERN ANALYSIS to group similar errors together, showing patterns and statistics rather than individual log entries.\n\n' +
      'RECOMMENDED WORKFLOW: First use errors-info to identify error patterns, then use aws-logs-search with specific log groups and search terms to find the actual log entries.\n\n' +
      '⚠️ COST INFORMATION ⚠️\n' +
      'CloudWatch Logs Insights queries incur costs based on the amount of data scanned (approximately $0.005 per GB). The default timeframe is limited to 3 hours to protect users from unexpected high costs, as log groups can contain large amounts of data.\n\n' +
      AWS_CREDENTIALS_ERROR_HANDLING,
    {
      logGroupIdentifiers: z
        .array(z.string())
        .describe(
          'Array of CloudWatch Log Group names or ARNs to search within. Examples: "/aws/lambda/my-function", "/aws/apigateway/my-api", or full ARNs.',
        ),
      searchTerms: z
        .array(z.string())
        .optional()
        .describe(
          'Array of search terms to filter logs. Any of the terms can be present in a log entry for it to match (OR logic). Examples: ["access denied", "resource not found"] will match logs containing either phrase (case insensitive).',
        ),
      startTime: z
        .string()
        .optional()
        .default(() => getThreeHoursAgo().toISOString())
        .describe(
          `Optional start time for logs. Can be an ISO date string (e.g., "${todayDate}") or a timestamp in milliseconds. Default is 3 hours ago. This conservative default is intentional to protect users from potentially high CloudWatch Logs Insights query costs when scanning large log volumes.`,
        ),
      endTime: z
        .string()
        .optional()
        .default(() => getNow().toISOString())
        .describe(
          `Optional end time for logs. Can be an ISO date string (e.g., "2023-01-01T00:00:00Z") or a timestamp in milliseconds. Today's date is ${todayDate}. Default is current time.`,
        ),
      limit: z
        .number()
        .min(1)
        .max(100)
        .optional()
        .default(100)
        .describe(
          'Optional limit for the number of log events to retrieve per log group. Default is 100, maximum is 100.',
        ),
      errorsOnly: z
        .boolean()
        .optional()
        .describe(
          'If true, only show logs that match common error patterns (error, exception, fail, timeout, etc.). This helps filter out noise and focus on potential issues.',
        ),
      confirmationToken: z
        .string()
        .optional()
        .describe(
          'Confirmation token for historical or extended timeframe queries. This is provided by the tool when confirmation is needed.',
        ),
      region: regionParam,
      profile: profileParam,
    },
    async (params) => {
      return await getLogsSearch(params)
    },
  )

  server.tool(
    'aws-logs-tail',
    'Retrieves the most recent logs from AWS CloudWatch Log Groups using the FilterLogEvents API. This tool is free to use (unlike CloudWatch Logs Insights) but less scalable for large volumes of logs.\n\n' +
      "It's ideal for debugging recent Lambda executions or checking the latest logs from services. By default, it returns logs from the last 15 minutes.\n\n" +
      'The filterPattern parameter supports CloudWatch Logs filter pattern syntax. Examples:\n\n' +
      '• Simple text matching: "ERROR" - matches all logs containing the word ERROR\n\n' +
      '• Multiple terms: "ERROR TIMEOUT" - matches logs containing both ERROR and TIMEOUT\n\n' +
      '• Optional terms: "?ERROR ?TIMEOUT" - matches logs containing either ERROR or TIMEOUT or both\n\n' +
      '• JSON logs: "{ $.errorCode = "NotFound" }" - matches JSON logs where errorCode field equals "NotFound"\n\n' +
      '• Numeric comparison in JSON: "{ $.responseTime > 5000 }" - matches JSON logs where responseTime is greater than 5000\n\n' +
      '• Wildcards: "{ $.errorType = *Exception }" - matches JSON logs where errorType ends with "Exception"\n\n' +
      '• Space-delimited logs: "[level=ERROR, ...]" - matches structured logs where the level field equals ERROR\n\n' +
      'For complete documentation, see: docs.aws.amazon.com/AmazonCloudWatch/latest/logs/FilterAndPatternSyntax.html\n\n' +
      AWS_CREDENTIALS_ERROR_HANDLING,
    {
      logGroupIdentifiers: z
        .array(z.string())
        .describe(
          'Array of CloudWatch Log Group names or ARNs to search within. Examples: "/aws/lambda/my-function", "/aws/apigateway/my-api", or full ARNs.',
        ),
      filterPattern: z
        .string()
        .optional()
        .describe(
          'Optional pattern to filter logs by. Follows CloudWatch filter pattern syntax. Examples: "ERROR", "[timestamp, requestId, level=ERROR, message]", or "{ $.errorCode = "NotFound" }".',
        ),
      startTime: z
        .string()
        .optional()
        .default(() => getFifteenMinutesAgo().toISOString())
        .describe(
          `Optional start time for logs. Can be an ISO date string (e.g., "${todayDate}") or a timestamp in milliseconds. If not provided, defaults to 15 minutes ago.`,
        ),
      endTime: z
        .string()
        .optional()
        .default(() => getNow().toISOString())
        .describe(
          `Optional end time for logs. Can be an ISO date string (e.g., "2023-01-01T00:00:00Z") or a timestamp in milliseconds. Today's date is ${todayDate}. If not provided, defaults to current time.`,
        ),
      limit: z
        .number()
        .min(1)
        .max(100)
        .optional()
        .default(100)
        .describe(
          'Optional limit for the number of log events to retrieve per log group. Default is 100, maximum is 100.',
        ),
      region: regionParam,
      profile: profileParam,
    },
    async (params) => {
      return await getLogsTail(params)
    },
  )

  // Register the AWS Errors Info tool for analyzing and grouping error patterns
  server.tool(
    'aws-errors-info',
    'Analyzes AWS CloudWatch logs to identify and group similar error patterns. USE THIS TOOL WHEN: (1) You need to understand recurring error patterns across your serverless application, (2) You want to identify the most frequent errors affecting your system, (3) You need to analyze error trends over time, or (4) You need to troubleshoot complex issues spanning multiple Lambda functions or services. The tool fetches error logs from CloudWatch, applies intelligent pattern matching to group similar errors, and provides detailed examples and statistics for each error group. It can analyze logs from specific log groups or across an entire serverless service.\n\n' +
      '⚠️ IMPORTANT COST INFORMATION ⚠️\n' +
      'CloudWatch Logs Insights queries incur costs based on the amount of data scanned (approximately $0.005 per GB, varies by AWS region). For timeframes longer than 3 hours, you MUST explicitly ask the user for confirmation before proceeding with the query.\n\n' +
      'The default timeframe is limited to 3 hours to protect users from unexpected high costs, as log groups can contain large amounts of data. This is especially important for pattern analysis which requires scanning the full content of log messages across multiple services.\n\n' +
      AWS_CREDENTIALS_ERROR_HANDLING,
    {
      startTime: z
        .string()
        .optional()
        .default(() => getThreeHoursAgo().toISOString())
        .describe(
          'Start time for logs. Can be an ISO date string (e.g., "2023-01-01T00:00:00Z") or a timestamp in milliseconds. If not provided, defaults to 3 hours ago. This conservative default is intentional to protect users from potentially high CloudWatch Logs Insights query costs when scanning large log volumes.',
        ),
      endTime: z
        .string()
        .optional()
        .default(() => getNow().toISOString())
        .describe(
          `End time for logs. Can be an ISO date string (e.g., "${todayDate}") or a timestamp in milliseconds. Today's date is ${todayDate}. If not provided, defaults to current time.`,
        ),
      logGroupIdentifiers: z
        .array(z.string())
        .optional()
        .describe(
          'Optional array of CloudWatch Log Group names/ARNs to search within. Examples: "/aws/lambda/my-function", "/aws/apigateway/my-api", or full ARNs.',
        ),
      serviceWideAnalysis: z
        .boolean()
        .optional()
        .default(false)
        .describe(
          'Boolean flag to analyze all logs for a service. If true, serviceName and serviceType must be provided.',
        ),
      serviceName: z
        .string()
        .optional()
        .describe(
          'Required if serviceWideAnalysis is true. Format follows list-resources convention.',
        ),
      serviceType: z
        .enum(['serverless-framework', 'cloudformation'])
        .optional()
        .describe(
          'Required if serviceWideAnalysis is true. The type of service to analyze logs for.',
        ),
      maxResults: z
        .number()
        .int()
        .positive()
        .min(1)
        .max(100)
        .optional()
        .default(100)
        .describe(
          'Optional limit for the number of error groups to return. Default is 100.',
        ),
      confirmationToken: z
        .string()
        .optional()
        .describe(
          'Required for timeframes longer than 3 hours. When querying logs for a long timeframe, the tool will first return a confirmation token. You MUST explicitly ask the user if they accept the potential costs, and only include this token in a follow-up request if they explicitly confirm.',
        ),
      region: regionParam,
      profile: profileParam,
    },
    async (params) => {
      return await getAwsErrorsInfo(params)
    },
  )

  // Register the CloudWatch Alarms tool
  server.tool(
    'aws-cloudwatch-alarms',
    'Get information about AWS CloudWatch Alarms and their history\n\n' +
      'IMPORTANT: This tool requires either alarmNames or alarmNamePrefix parameter to be specified.\n\n' +
      'This tool allows you to:\n' +
      '1. View details of CloudWatch alarms by name or name prefix\n' +
      '2. Filter alarms by state (OK, ALARM, INSUFFICIENT_DATA)\n' +
      '3. View alarm history within a specified time range\n\n' +
      AWS_CREDENTIALS_ERROR_HANDLING,
    {
      alarmNames: z
        .array(z.string())
        .optional()
        .describe(
          'Optional array of CloudWatch alarm names to retrieve. Either alarmNames or alarmNamePrefix must be provided.',
        ),
      alarmNamePrefix: z
        .string()
        .optional()
        .describe(
          'Optional prefix to filter CloudWatch alarms by name. Either alarmNames or alarmNamePrefix must be provided.',
        ),
      alarmState: z
        .enum(['OK', 'ALARM', 'INSUFFICIENT_DATA', 'all'])
        .optional()
        .describe(
          'Optional alarm state to filter by. One of: "OK", "ALARM", "INSUFFICIENT_DATA", or "all". Default is "all".',
        ),
      startDate: z
        .string()
        .optional()
        .default(() => getTwentyFourHoursAgo().toISOString())
        .describe(
          `Optional start date for alarm history. Can be an ISO date string (e.g., "${todayDate}") or a timestamp in milliseconds. If not provided, defaults to 24 hours ago.`,
        ),
      endDate: z
        .string()
        .optional()
        .default(() => getNow().toISOString())
        .describe(
          'Optional end date for alarm history. Can be an ISO date string (e.g., "2023-01-01T00:00:00Z") or a timestamp in milliseconds. If not provided, defaults to current time.',
        ),
      region: regionParam,
      profile: profileParam,
    },
    async (params) => {
      return await getCloudWatchAlarmsInfo(params)
    },
  )

  // Register the Deployment History tool for tracking infrastructure changes
  server.tool(
    'deployment-history',
    'Retrieves deployment history for cloud infrastructure services. USE THIS TOOL WHEN: (1) You need to understand recent changes to your infrastructure, (2) You want to investigate when and why resources were created, updated, or deleted, or (3) You need to correlate infrastructure changes with application issues. The tool works with both Serverless Framework and CloudFormation deployments, showing a chronological history of stack events including resource creation, updates, and deletions with timestamps and status reasons. By default, it shows events from the last 7 days.\n\n' +
      AWS_CREDENTIALS_ERROR_HANDLING,
    {
      serviceName: z
        .string()
        .describe(
          '⚠️ SERVICE NAME REQUIREMENTS BY SERVICE TYPE ⚠️\n\n' +
            '=== FOR SERVERLESS FRAMEWORK PROJECTS ===\n' +
            '• FORMAT: "serviceName-stageName" (REQUIRED)\n' +
            '• EXAMPLES:\n' +
            '  ✓ CORRECT: "my-service-dev", "superapp-platform-prod"\n' +
            '  ✗ INCORRECT: "superapp-platform" (missing stage)\n' +
            '• The stage name (e.g., "dev", "prod", "staging") MUST be included\n\n' +
            '=== FOR CLOUDFORMATION PROJECTS ===\n' +
            '• You MUST use the exact CloudFormation stack name\n' +
            '• CloudFormation stack names are case-sensitive\n' +
            '• Example: "my-application-stack"',
        ),
      serviceType: z
        .enum(['serverless-framework', 'cloudformation'])
        .describe(
          'The type of service to get deployment history for. Currently supported: "serverless-framework" and "cloudformation".',
        ),
      endDate: z
        .string()
        .optional()
        .default(() => getNow().toISOString())
        .describe(
          'Optional end date for deployment history in ISO format (e.g., "2023-01-02T00:00:00Z"). If not provided, current time will be used. History will be retrieved for 7 days prior to this date.',
        ),
      region: regionParam,
      profile: profileParam,
    },
    async (params) => {
      return await getDeploymentHistory(params)
    },
  )

  // Register the documentation tool
  server.tool(
    'docs',
    "Access comprehensive, always up-to-date documentation for Serverless Framework (sf) and Serverless Container Framework (scf). This tool provides a tree-like view of all available documentation when no paths are specified, allows browsing directory contents, and retrieves full markdown content for specific documents including code examples and usage patterns. You can request multiple documents in a single call by providing an array of paths. For paths that don't exist, the tool suggests available alternatives in the nearest directory.",
    {
      product: z
        .enum(['sf', 'scf'])
        .describe('Product to get documentation for. Must be one of: sf, scf'),
      paths: z
        .array(z.string())
        .optional()
        .describe(
          'Array of document paths to retrieve MULTIPLE documents in a single request. Paths are relative to the product base directory. If not provided, lists all available documents.',
        ),
    },
    async (params) => {
      return await getDocs(params)
    },
  )
}
