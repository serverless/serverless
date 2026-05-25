<!--
title: Serverless Framework Commands - Reconcile
description: Reconciles your org's list of billable instances with the actual CloudFormation stacks currently in your AWS account.
short_title: Commands - Reconcile
keywords:
  ['Serverless', 'Reconcile', 'Instances', 'Credits', 'Billing']
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/aws/cli-reference/reconcile)

<!-- DOCS-SITE-LINK:END -->

# Reconcile

The `reconcile` command reconciles your org's list of billable instances with the actual CloudFormation stacks currently in your AWS account, making it an essential tool to recover credits for stacks that were removed manually without running the `remove` command.

We generally recommend to always use the `remove` command to remove Serverless Framework stacks to ensure the removal is reported, but if you must remove stacks manually or your organization has a custom workflow, this command is the only way for us to know that your service instance was removed and that it should no longer be consuming credits.

**Note:** The `reconcile` command is a global, account-wide command. It is **not** a per-service command and does **not** need to be run from inside a service directory. A single invocation reconciles every billable instance reported for your org against all CloudFormation stacks in the AWS account associated with the credentials it is run with, so you only need to run it once per AWS account — not once per service or per `serverless.yml`.

If you have Serverless Framework stacks in multiple AWS accounts, you should run this command once for each AWS account (using credentials for that account) for a complete reconciliation and more accurate usage reporting and billing.

**Note:** This command might take a few minutes to complete depending on how many CloudFormation stacks you have in your AWS account.

### AWS Region Configuration

By default, the `reconcile` command uses the `us-east-1` region to fetch your AWS account ID. If you're working in a restricted environment where access to specific regions is blocked or where VPC endpoints are only available for certain regions, you can override this default behavior by setting the `AWS_REGION` environment variable:

```bash
AWS_REGION=eu-central-1 serverless reconcile
```

## Usage

```bash
serverless reconcile
```

The command can be run from **any directory** — it does not need to be executed inside a service directory and does not read your `serverless.yml`. It operates at the AWS account level using the AWS credentials available in your environment.

## Options

- `--org` The org name to reconcile instances for. Defaults to your service org if found, or your default personal org.

## Example

The example below runs `reconcile` from an arbitrary directory (no `serverless.yml` required):

```
~ $ serverless reconcile

Successfully recovered 3 Instance Credits from the 123456789012 AWS account.

If you have any questions about your usage, please contact support@serverless.com.

~ $
```
