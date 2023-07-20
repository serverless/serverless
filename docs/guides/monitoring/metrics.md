<!--
title: Serverless Dashboard - Metrics
menuText: Metrics
layout: Doc
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/guides/monitoring/metrics/)

<!-- DOCS-SITE-LINK:END -->

# Metrics

Metrics is a Serverless Dashboard feature which enables viewing metrics across
AWS Accounts and Lambda functions.

To get started you need to [add an AWS Account integration](./integrations/aws.md)
and [enable Dev or Prod Instrumentation Mode](./instrumentation.md).

Once instrumentation is enabled, go to the **Metrics** page to view all of your
AWS Lambda function metrics including durations, invocations, and event counts.

Currently Metrics are supported on the Node.js 12+ and Python 3.8+ runtimes on
AWS Lambda only. Support for other runtimes is coming soon.

## Metric Aggregation

Metrics are automatically aggregated on the charts over an interval as small as
1 minute, and as large as 1 day, depending on the time interval you select. As
such, the metrics are only available in aggregate, not as individual data
points.

## Available Charts

The metrics page features a number of charts, including Invocations, Uncaught
Errors, and more. The title of each chart provides a tooltip with a detailed
description of the metric.

You can also hover over individual bars to get a detailed breakdown of the
metrics for that point in time.

Majority of the charts are interactive. You can click on the chart, which will
send you to the Trace Explorer to view the full chart and individual traces
which meat the same filter criteria.

## Saving Views

From the title, you can select to create a new custom view of the Metrics. All
the filters will be saved with that view. This enables you to create views for
specific use cases. When filters are updated, they are saved in the view.

## Filters

Applying filters to the metrics view allows you to narrow in on
specific functions, or use cases that are of interest to you. Filters can be
saved as a shared views to collaborate with team mates on specific searches.

- **Resources** - Filter for specific AWS Resources in any of the integrated
  AWS Accounts. Currently this only supports AWS Lambda, but other AWS resources
  will be made available soon.
- **Namespace** - Namespaces are configured on individual AWS Lambda functions
  on the AWS Integrations page. Filtering by namespace allows you to filter the
  metrics based on the namespaces that were configured on the functions for which
  the metric applies.
- **Environment** - Like namespaces, environments are configured on the AWS
  Integration page for each AWS Lambda function. The are also automatically
  determined from the CloudFormation stack if applicable. Filtering by environment
  allows you to filter the metrics based on the environments that were configured
  on the functions for which the metric applies.
- **Region** - Region is the specific AWS Region of the Lambda function.
- **AWS Account** - If you have multiple AWS Account integrations in your
  org, you can filter for metrics for individual AWS Accounts.
- **Events** - Individual invocations may produce multiple errors or warnings.
  The Serverless SDK may also produce errors and warnings. Filtering by Events
  enables filtering for invocations which include any of the selected Event types.
  You can find more details about Event types on the [Trace Explorer](./trace-explorer.md).
- **Cold start** - Filters for metrics on AWS Lambda invocations that were a
  cold start.
- **Duration** - Filters based on the AWS Lambda response duration.
- **Custom Tags** - Filters for metrics on invocations that had the provided
  custom tags. Custom tags on traces, errors, and warnings are all queried. Use
  the [Node.js](../nodejs-sdk.md) or [Python](./python-sdk.md) Serverless SDK to
  set custom tags.
