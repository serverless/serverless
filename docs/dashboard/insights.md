<!--
title: Serverless Dashboard - Insights
menuText: Insights
menuOrder: 1
layout: Doc
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/dashboard/insights/)

<!-- DOCS-SITE-LINK:END -->

# Insights

Serverless Insights help you monitor, develop and optimize your serverless application by providing key metrics and alerts.

## Installing

Insights are enabled by default when you deploy a Service using the Serverless Framework CLI.

### Configuration

Serverless Framework will automatically enable log collection by adding a CloudWatch Logs Subscription to send logs that match a particular pattern to our infrastructure for processing. This is used for generating metrics and alerts.

When deploying, Serverless Framework will also create an IAM role in your account that allows the Serverless Framework backend to call FilterLogEvents on the CloudWatch Log Groups that are created in the Service being deployed. This is used to display the CloudWatch logs error details views alongside the stack trace.

If you wish to disable log collection, set the following options:

**serverless.yml**

```yaml
custom:
  enterprise:
    collectLambdaLogs: false
```

## Alerts

Serverless Insights include pre-configured alerts designed to help you develop and optimize the performance and security of your serverless applications. These events are presented in the "alerts" tab within the Serverless Framework [dashboard](https://dashboard.serverless.com/). Preconfigured alerts include the following:

### Memory: Out of Memory

The out of memory alert is checked on every invocation of the function. If any invocation uses more memory than is configured for that function, Lambda will abruptly shut down the invocation and trigger an out of memory error. The alert will be triggered immediately and only once in a given 48 hour period.

### Error: New Error Type Identified

Errors happen, and the sooner you know about them after they are introduced the better equipped you are to proactively mitigate their impact.

On a per function and execution basis, the new error insight tracks error types reported (if any), and compares them with all error types reported over the prior 48 hours. An alert is generated when an error type is found that was not present during the prior 48 hours. From the activity and insights feed you are able to drill into the details of a specific occurrence of the new error type.

### Duration: Timeout

The timeout alert is checked on every invocation of the function. If any invocation runs for a duration longer than is configured for that function, Lambda will abruptly shut down the invocation and trigger a timeout error. The alert will be triggered immediately and only once in a given 48 hour period.

### Duration: Approaching Timeout

The approaching timeout alert runs every 5 minutes. It looks at the duration of all invocations of that function over the past 60 minutes. If any of the invocations exceed 90% of the configured timeout, then it will generate an alert. If an alert was already triggered in the past 60 minutes, a new alert will not be triggered.

### Duration: Unusual Function Duration

The unusual function duration is checked every 5 minutes. It looks at every invocation over the past 60 minutes and calculates the median duration. An alert is triggered If any of the invocations in the last 60 minutes had a duration that exceeded more than twice the median duration.

### Invocations: Escalated Invocation Count

An escalated invocation count can mean good things (e.g. more traffic) or bad things (e.g. higher costs or a runaway function). This alert helps you get out in front of both the good and the bad scenarios.

The escalated invocation count insight runs every five minutes and calculates the sum of invocations for a function over the prior five minutes. It then compares this most recent five minute invocation count against the highest five minute invocation count recorded during the prior 48 hours. If the most recent five minute invocation count is 25% greater than the highest five minute invocation count over the previous 48 hours an alert will be generated.

## Add notifications

The [notifications](./notifications.md) page provides instructions to forward Alerts for a particular Application to Slack, email, AWS SNS or a webhook.

## Metrics

As part of the Serverless Insights feature we also include a set of pre-configured metrics and charts, including the following:

### Errors and Invocations

The errors and invociations chart shows error count trends and the aggregate number of invocations for a particular service for a selected time period. Click into any bar on the chart to see function specific metrics.

### Durations

The durations chart shows the aggregate duration times for all functions in a particular Service for a selected time period. Click into any point on the chart to see function specific metrics.

## Advanced Configuration Options

### Uploading Source Map

The [New Error Alert](#new-error) and the [Error Metrics](#errors) can be used to view the stack trace for the occurence of an error. Tools like Webpack and Typescript generate the packaged code and therefore may obfuscate the stack trace. The Serverless Framework Enterprise Plugin and SDK support sourcemaps to properly generate the stack trace.

To use a sourcemap, ensure that your packaging directory includes the compiled source, original source, and the source maps.

For example, if your directory structure is:

```
$ ls -l dist/* src/*
-rw-r--r--  1 dschep  staff   576B Mar 21 17:21 dist/handler.js
-rw-r--r--  1 dschep  staff   911B Mar 21 17:21 dist/handler.js.map
-rw-r--r--  1 dschep  staff   451B Mar 22 12:13 src/handler.js
```

Then you should have a packaging directory that includes all the files above:

```yaml
package:
  include:
    - src/*.js
    - dist/*.js
    - dist/*.js.map
```
