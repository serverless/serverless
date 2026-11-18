<!--
title: Dashboard Metrics
description: Read Lambda invocation, error, warning and duration metrics across AWS accounts in the Serverless Framework Dashboard, and filter them.
short_title: Metrics
keywords: ['Serverless Framework', 'Dashboard', 'Metrics', 'AWS Lambda metrics', 'Observability']
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/guides/dashboard/monitoring/metrics)

<!-- DOCS-SITE-LINK:END -->

# Dashboard metrics

The **Metrics** page of the Serverless Framework Dashboard charts AWS Lambda invocations, errors, warnings and durations across all integrated AWS accounts and Regions. Use it to spot changes over time; to look at single invocations, use the [Trace Explorer](./traces.md).

Metrics appear after an AWS account is connected and its functions are instrumented; see [Dashboard monitoring and observability](./README.md). With `serverless.yml`, that is:

```yaml
# serverless.yml
org: myorg
app: my-app
service: my-service

stages:
  prod:
    observability: true
```

## Where metrics come from

The Dashboard builds metrics from two sources in each integrated AWS account:

- The CloudWatch metric stream the integration creates, which sends the `AWS/Lambda` and `AWS/ApiGateway` metrics.
- The traces that the SDK in the Lambda Layer writes for instrumented functions on a [supported runtime](./README.md#supported-aws-lambda-runtimes), which carry cold starts, captured errors and warnings, and custom tags.

Trace sampling keeps invocation counts, durations, cold starts and errors complete, because sampled-out traces keep the core spans and traces with errors are never sampled out. Captured warnings and custom tags come only from full traces. See [How trace sampling works](./README.md#how-trace-sampling-works).

## Metric charts

The **Metrics** page shows, for the selected time range and filters:

- **Invocations**, with uncaught errors, caught errors, warnings, SDK errors and SDK warnings.
- **Duration**, as the average and the 95th percentile.
- **Events**: errors and warnings grouped by fingerprint, with their number of occurrences, the affected functions, and when each was first and last seen.

Values are aggregated per time interval; the interval grows with the time range, so the charts show aggregates rather than single invocations.

## Filter metrics

Filters narrow every chart on the page to the matching invocations:

- **Resources**: specific Lambda functions in any integrated AWS account.
- **Namespace**: the function's namespace. It's set from the CloudFormation stack name without the trailing `-<stage>` (for a Serverless Framework service, the service name), and can be changed per function in the integration settings.
- **Environment**: the function's environment. It's set from the function's `STAGE` tag (for a Serverless Framework service, the stage), and can be changed per function in the integration settings.
- **Region**: the AWS Region of the function.
- **AWS Account**: one of the integrated AWS accounts.
- **Events**: invocations with at least one event of the selected types. The types are described in [Event types](./traces.md#event-types).
- **Cold start**: invocations that started a new execution environment.
- **Duration**: a range of invocation durations.
- **Custom Tags**: invocations whose trace, or a captured error or warning in it, has the tag value. Set tags with the [Node.js SDK](./sdk/nodejs.md#add-tags-to-traces-and-events) or the [Python SDK](./sdk/python.md#add-tags-to-traces-and-events).

## Related pages

- [Dashboard traces](./traces.md)
- [Dashboard monitoring and observability](./README.md)
- [Troubleshoot Dashboard observability](./troubleshoot.md)
