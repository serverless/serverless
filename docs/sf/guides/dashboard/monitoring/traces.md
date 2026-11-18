<!--
title: Dashboard Traces
description: 'Find and inspect single Lambda invocations in the Serverless Framework Dashboard Trace Explorer: filters, event types, spans, tags, logs and events.'
short_title: Traces
keywords: ['Serverless Framework', 'Dashboard', 'Traces', 'Trace Explorer', 'Spans', 'Lambda errors', 'Logs']
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/guides/dashboard/monitoring/traces)

<!-- DOCS-SITE-LINK:END -->

# Dashboard traces

A trace in the Serverless Framework Dashboard is the record of one AWS Lambda invocation: its spans, tags, captured errors and warnings, and logs. The **Trace Explorer** lists the traces of all instrumented functions across your integrated AWS accounts, so you can find the invocations behind an error or a slow request; for trends over time, use [Dashboard metrics](./metrics.md).

Traces are collected for functions with Dashboard instrumentation on a [supported runtime](./README.md#supported-aws-lambda-runtimes). To instrument every function of a service in the `prod` stage:

```yaml
# serverless.yml
org: myorg
app: my-app
service: my-service

stages:
  prod:
    observability: true
```

For other ways to instrument functions, see [Connect an AWS account in the Dashboard](./README.md#connect-an-aws-account-in-the-dashboard). High-volume functions send some traces without custom spans, events and tags; see [How trace sampling works](./README.md#how-trace-sampling-works).

## Filter traces in the Trace Explorer

The Trace Explorer filters narrow the list to matching invocations:

- **Event Types**: traces with at least one event of the selected [event types](#event-types).
- **Event Messages**: traces with an error or warning whose message matches.
- **Resource**: specific Lambda functions, by ARN.
- **Environment** and **Namespace**: the function's environment, set from its `STAGE` tag, and namespace, set from its CloudFormation stack name without the trailing `-<stage>`. For a Serverless Framework service, these are the stage and the service name. Both can be changed per function in the integration settings.
- **AWS Account** and **Region**: the integrated AWS account and the Region of the function.
- **Cold start**, **Duration**, **HTTP status code** and **HTTP path**: invocation properties recorded in the trace.
- **Custom Tags**: traces whose trace tags, or the tags of a captured error or warning, have the value.
- **Timeframe**: the time range of the invocations.

## Event types

An event is an error or warning captured during an invocation. Each event has one of these types:

- **Uncaught Error** (`ERROR_TYPE_UNCAUGHT`): the handler threw or rejected, and the invocation failed.
- **Caught Error** (`ERROR_TYPE_CAUGHT_USER`): the handler handled an error and reported it with the SDK's `captureError`, with `console.error` or a JSON log line with an error level in Node.js (for example from Pino, Winston or Powertools for AWS Lambda), or with a `logging` `error()` call in Python.
- **Warning** (`WARNING_TYPE_USER`): the handler reported a warning with the SDK's `captureWarning`, with `console.warn` or a JSON log line with a warning level in Node.js, or with a `logging` `warning()` call in Python.
- **SDK Error** (`ERROR_TYPE_CAUGHT_SDK_USER`): the handler called the SDK incorrectly, for example `setTag` with an invalid tag name. The handler keeps running, and the SDK skips that call.
- **SDK Warning** (`WARNING_TYPE_SDK_USER`): the SDK found a problem in how the handler ran, for example a custom span still open at the end of the invocation, or an invocation that ended without the handler returning a response.

## Spans in a trace

A trace shows its spans on a timeline, so you can see when each step started and how long it took. The SDK creates these spans:

- `aws.lambda`: the root span of the invocation. On a cold start it contains `aws.lambda.initialization`; it always contains `aws.lambda.invocation`.
- `aws.sdk.<service>.<operation>`: AWS SDK requests, unless `SLS_DISABLE_AWS_SDK_MONITORING` is set.
- `node.http.request`, `node.https.request` (Node.js) and `python.http.request`, `python.https.request` (Python): outgoing HTTP requests, unless `SLS_DISABLE_HTTP_MONITORING` is set.
- `express` and `express.middleware.*` (Node.js) or `flask` (Python): request routing in Express and Flask apps.
- Custom spans that your handler creates with the [Node.js SDK](./sdk/nodejs.md) or the [Python SDK](./sdk/python.md).

## Trace tags

The `aws.lambda` span carries tags about the invocation, including:

- `aws.lambda.is_coldstart`, `aws.lambda.request_id`, `aws.lambda.arch` and `aws.lambda.version`.
- `aws.lambda.outcome`: `success` or `error:handled`, with the error message and stack trace on errors.
- For API Gateway and function URL requests: the HTTP method, path, query parameter names, request header names and status code.

Tags you set with the SDK's `setTag` or `set_tag` appear with the trace too.

## Logs in a trace

To view the logs of an invocation, select the root span, `aws.lambda`. The Dashboard reads the logs from the function's CloudWatch Logs log group in your AWS account when you open the trace. Log lines formatted as JSON are shown parsed.

## Events in a trace

Events appear on the timeline next to the spans. Each event shows its name, message and, when available, stack trace. When the SDK captures an `Error` (Node.js) or exception (Python), the event takes its name, message and stack from it; for other values, the stack trace is where `captureError`, `captureWarning`, `console.error`, `console.warn` or the `logging` call ran.

## Related pages

- [Dashboard metrics](./metrics.md)
- [Node.js SDK](./sdk/nodejs.md)
- [Python SDK](./sdk/python.md)
- [Troubleshoot Dashboard observability](./troubleshoot.md)
