<!--
title: Serverless Framework - Monitoring & Observability - Traces
menuText: Traces
menuOrder: 3
layout: Doc
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/guides/monitoring/trace-explorer/)

<!-- DOCS-SITE-LINK:END -->

# Traces

Traces, Spans, Logs, and Events are captured and made available in Trace
Explorer for your AWS Lambda functions when [Instrumentation](./instrumentation.md)
is enabled.

Serverless Dashboard provides a set of tools to analyzing Traces.

## Trace Explorer List

Similar to the [Metrics View](./metrics.md), the Trace Explorer provides a
starting point for troubleshooting AWS Lambda function invocations across your
org. You can use the rich filters to narrow in on errors, warnings, and
performance issues across all of your AWS Lambda functions across your org.

## Filters

Filtering allows you to narrow in on particular behavior and time frame for
to isolate invocations. You can filter on:

- **Event Types** - Errors and Warnings can be captured in the trace, these
  includes user defined as well as SDK defined errors and warnings. More details
  on each Event type is available below.
- **Event Messages** - When an Event like an error or warning is captured, a
  message string is saved with the Event. You can filter for the Traces based on
  the Event messages that were captured in the trace. Traces are filtered if any
  of the Events in the Trace contained the message string.
- **Resource** - You can select the specific resource by AWS ARN, like a
  specific Lambda function.
- **Environment**, **Namespace** - These properties are inferred from the
  CloudFormation stack when Instrumentation is added, or they are set manually
  on the Integration settings page. Once set, you can filter the traces based on
  these properties set on the function.
- **AWS Account**, **Region** - Serverless Dashboard collects information for all
  instrumented Lambda functions across AWS accounts and regions; you can filter
  on any of these properties.
- **Timeframe** - Any timeframe within the last 30 days can be used.

## Event Types

- **Uncaught Error** (`ERROR_TYPE_UNCAUGHT`) - The Lambda function handler had a
  fatal error and caused the invocation to fail.
- **Caught Error** (`ERROR_TYPE_CAUGHT_USER`) - The Lambda function handler had
  an error that was captured using the SDK, structured logging library (e.g. Pino,
  AWS Lambda PowerTools, Winston), or standard out (e.g. `console.error`).
- **Warning** (`WARNING_TYPE_USER`) - The Lambda function handler had a warning
  that was captured using the SDK, structured logging library (e.g. Pino, AWS
  Lambda PowerTools, Winston), or standard out (e.g. `console.warn`).
- **SDK Error** (`ERROR_TYPE_CAUGHT_SDK_USER`) - An SDK usage error that was
  reported due to misuse of the SDK. These errors do not cause handler failures,
  but misusage of the SDK may result in partial collection. For example, using the
  `setTag` method with invalid inputs will result in this type of error, and the
  tag will not be set.
- **SDK Warning** (`WARNING_TYPE_SDK_USER`) - A warning reported by the SDK due
  to user misuse in the handler, but not due to misuse of the SDK. For example, if
  both a callback and Promise resolution is attached this will cause unwanted
  side-effects on the SDK.

## Trace Details

Trace Details provides a way to look at the details of an individual AWS Lambda
Invocation trace, including the spans, tags, logs, and events.

The Trace details are deep-linked so you can easily share the URL with your
team when collaboratively troubleshooting.

The pane on the right, the Inspector, presents the details about the Trace. If
a Span, or an Events are selected from the timeline, then the Inspector will
show details about the selected item.

The Inspector for the trace will present details about the trace as tags. These
tags include information about the runtime, like `Cold Start`, `Request ID`,
and `Arch`, as well as metrics like `Memory Used`, `Billed ms`, `Invoke`. Check
out the tooltips for details on each of the tags.

### Spans

A Trace contains a set of Spans associated with and displayed in the style of a
Gantt chart. This chart provides you with context for when, and how long various
subsequent interactions took.

A span can be selected from the timeline to view the details of the span in the
Inspector.

### Logs

Logs are also collected and made available in the Trace details. To view the
logs for the Lambda invocation, select the root span, `aws.lambda`.

If the logs are structured and formatted as JSON, they will be parsed and
displayed with pretty formatting.

### Events

Events, like Spans, are displayed on the timeline. Events can be selected to
view the details.

Events include a `name`, `message`, and `stack` when available. The Node.js and
Python Serverless SDKs capture the stacktraces for all requests when possible.
It also captures `Error` objects, so the `name`, `message`, and `stack` from the
`Error` are made available as an error in the Inspector.
