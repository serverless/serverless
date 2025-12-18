<!--
title: Serverless Framework Commands - Usage
description: displays your org's credit usage for the current month
short_title: Commands - Usage
keywords:
  ['Serverless', 'Framework', 'AWS Lambda', 'Usage', 'Credits', 'Billing']
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/aws/cli-reference/usage)

<!-- DOCS-SITE-LINK:END -->

# Usage

The `usage` command displays your org's instance credit usage for the current month. It also exports a list of billable instances that consumed those credits to an `instances.csv` file in the current directory.

```bash
serverless usage
```

## Options

- `--org` The org name to show usage for. Defaults to your service org if found, or your default personal org.

The list of instances in the `instances.csv` file has 4 columns:

- **ID:** This is the instance ID. It is the CloudFormation stack ID if the instance was deployed by the Serverless Framework v4. If the instance is only managed by the Serverless Dashboard, the dashboard instance ID is used, which is a combination of the service, region and stage names.
- **Age:** This is the number of days the instance has been active. If it is below 10 days, you can still remove the instance before the end of the month so that you are not billed for it. However, if the instance is older than 10 days and you remove it, you will be billed for it this month, but not the following months.
- **Type:** This shows the type of instance. It is either a CLI instance deployed by the Serverless Framework v4, Dashboard-managed instance, or both.
- **User:** This shows either the user or the license key used to deploy the instance. For exmaple, `user:user-name` or `license:license-label`. It may be blank if this data is not available.

## Example

```
my-service $ serverless usage

The serverlessinc org used 18 Instance Credits this month.

A list of billable instances has been saved to instances.csv in the current directory.

If you have any questions about your usage, please contact support@serverless.com.

my-service $
```
