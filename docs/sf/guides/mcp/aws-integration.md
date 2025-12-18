<!--
title: Serverless Framework - MCP Server AWS Integration
description: Configure AWS credentials for the Serverless MCP Server to interact with your cloud resources and use with Cursor, Windsurf, VSCode and more.
short_title: AWS Integration
menuText: AWS Integration
menuOrder: 3
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

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/guides/mcp/aws-integration/)

<!-- DOCS-SITE-LINK:END -->

# AWS Integration

The Serverless MCP Server requires AWS credentials to interact with your AWS resources. This guide explains how to configure AWS credentials for use with the MCP Server.

This server uses the default AWS credentials chain to access AWS resources. The AWS SDK for JavaScript v3 checks credential providers in the following order:

1. Environment variables (`AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`)
2. AWS SSO credentials
3. AWS shared credentials and config files (`~/.aws/credentials` and `~/.aws/config`)

## Setting Up AWS Credentials

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

The credentials will be stored in `~/.aws/credentials` and the configuration in `~/.aws/config`.

## AWS Profiles

If you have multiple AWS profiles configured, you should explicitly specify which profile to use when running MCP tools. Each tool accepts a `profile` parameter that can be used to specify the AWS profile name.

```bash
# List available AWS profiles
aws configure list-profiles
```

If no profile is specified, the default profile will be used. The default profile is either the profile named "default" or the profile specified by the `AWS_PROFILE` environment variable.

## AWS Regions

Most MCP tools require an AWS region. You can specify the region in several ways:

1. In your service configuration file (e.g., `serverless.yml` for Serverless Framework projects)
2. In your AWS config file (`~/.aws/config`)
3. By specifying the region in the prompt

## AWS SSO Support

The MCP server supports AWS SSO credentials. There are two ways to configure AWS SSO:

### Option 1: AWS CLI Configuration Wizard

Use the AWS CLI to set up SSO automatically:

```bash
aws configure sso
```

### Option 2: Manual Configuration

Manually edit your AWS config file (`~/.aws/config`) to add an SSO profile:

```ini
[profile my-sso-profile]
sso_start_url = https://my-sso-portal.awsapps.com/start
sso_region = us-east-1
sso_account_id = 123456789012
sso_role_name = SSOReadOnlyRole
region = us-west-2
```

### Using AWS SSO

After configuring SSO, you need to:

1. Log in to AWS SSO:

   ```bash
   aws sso login --profile my-sso-profile
   ```

2. Specify the SSO profile when using MCP tools if you have multiple profiles configured

### Refreshing SSO Credentials

AWS SSO credentials expire after a certain period (typically 8-12 hours). When they expire, you'll need to refresh them:

```bash
aws sso login --profile my-sso-profile
```

### Verifying SSO Configuration

To verify your SSO configuration is working correctly

```bash
aws sts get-caller-identity --profile my-sso-profile
```

This should return your account ID, user ID, and ARN.

## IAM Permissions

The MCP Server requires specific IAM permissions to access your AWS resources. The exact permissions needed depend on which tools you plan to use.

### Minimum Required Permissions

For basic functionality, the following permissions are recommended:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "lambda:List*",
        "lambda:Get*",
        "iam:List*",
        "iam:Get*",
        "sqs:List*",
        "sqs:Get*",
        "s3:List*",
        "s3:Get*",
        "apigateway:GET",
        "apigatewayv2:Get*",
        "dynamodb:List*",
        "dynamodb:Describe*",
        "cloudwatch:Get*",
        "cloudwatch:Describe*",
        "logs:FilterLogEvents",
        "logs:StartQuery",
        "logs:GetQueryResults"
      ],
      "Resource": "*"
    }
  ]
}
```

## AWS Costs

The MCP Server is designed to use AWS APIs that are generally free of charge. Most operations performed by the MCP Server tools do not incur any AWS costs as they only retrieve information about your resources using read-only API calls.

### Free Operations

The following operations are free and do not incur any AWS charges:

- Listing resources (Lambda functions, S3 buckets, DynamoDB tables, etc.)
- Getting resource details and configurations
- Retrieving CloudWatch metrics
- Describing CloudWatch alarms
- Retrieving CloudWatch logs

### Potential Costs

The only operation that may incur AWS charges is using CloudWatch Logs Insights queries, which are used by the `aws-logs-search` tool. AWS charges for CloudWatch Logs Insights queries based on the amount of data scanned:

- The first 5 GB of data ingestion, archive storage, and data scanned by Logs Insights queries per month is included in the AWS Free Tier
- Beyond the Free Tier, AWS charges approximately $0.005 per GB of data scanned by Logs Insights queries (pricing may vary by region)

For the most up-to-date pricing information, refer to the [AWS CloudWatch Pricing](https://aws.amazon.com/cloudwatch/pricing/) page.

To minimize costs when using the `aws-logs-search` tool:

- Use specific time ranges (default: last 3 hours)
- Target specific log groups rather than searching across all log groups

Note that using specific search terms or limiting the number of results returned does not reduce costs, as CloudWatch Logs Insights charges are based on the total amount of data scanned, regardless of filtering or result limits.

## Troubleshooting

If you encounter AWS credential issues when using the MCP Server, try the following:

1. Verify that your AWS credentials are correctly configured using the AWS CLI:

   ```bash
   aws sts get-caller-identity
   ```

2. Check if your credentials have expired (especially with SSO):

   ```bash
   aws sso login --profile your-profile
   ```

3. Check that the IAM user or role has the necessary permissions to access the AWS resources.

4. If using a specific profile, ensure that the profile name is correctly specified in the tool parameters.

5. For region-specific issues, explicitly specify the region in the tool parameters.
