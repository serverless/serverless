<!--
title: Serverless Framework - Monitoring & Observability - Overview & Setup
menuText: Overview & Setup
menuOrder: 2
layout: Doc
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/guides/monitoring/)

<!-- DOCS-SITE-LINK:END -->

# Monitoring & Observability

<iframe width="700" height="394" src="https://www.youtube.com/embed/zgcpTlbHwYs" title="YouTube video player" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>

Easily monitor and observe AWS Lambda functions with Serverless Framework. Access Metrics, Traces, Logs, Errors, and more, across all AWS accounts and Serverless Framework Services.

Works with or without deploying through Serverless Framework. Just connect your AWS account.

## Features

- A global view of Metrics, Traces, Logs, and Errors across all AWS accounts.
- Easily search through data via powerful filters.
- Instant error alerts.
- Auto-sample trace data to save costs.
- Detect code-defined API routes, like in Express.js.
- No set-up or complex instrumentation required.

## Set-Up

Currently Serverless Framework Monitoring & Observability supports the Node.js 12+ and Python 3.8+ AWS Lambda runtimes only, and only AWS Commercial Regions (not GovCloud or China Regions).

To enable Serverless Framework Monitoring & Observability, first create a Serverless Framework account [here](https://app.serverless.com).

Next, you must connect your AWS account(s) directly to Serverless Framework's platform via an IAM Role. The permissions for this IAM Role are available in the [Dashboard Github Repo](https://github.com/serverless/dashboard), for your review.

There are two ways to connect your AWS account(s), _via Serverless Framework CLI_, and _via Serverless Framework Dashboard UI_.

Please note, enabling Serverless Framework's Monitoring & Observability features will create a few resources on AWS accounts they're connected to, adding minimal costs to your AWS accounts.

### Set-Up Via Serverless Framework Dashboard UI

The most convenient way to set up Monitoring & Observability for multiple AWS accounts or accounts with many AWS Lambda functions is to do so via the Serverless Framework Dashboard UI.

In the navigation bar on the left, click on the "Settings" icon, and then click on the "Integrations" tab. Here is where you connect AWS accounts.

In a separate browser window, log into the AWS Account via the browser that you wish to connect to. You will need to have permission to create IAM Roles with the [required permissions](https://github.com/serverless/dashboard) for Monitoring & Observability.

In the "Integrations" view, click the "Add Integrations" button. This launches a quick process that opens a new browser window containing AWS Console's AWS CloudFormation Stack Create view. This window is pre-loaded with an AWS CloudFormation Stack Template that contains an AWS IAM Role with all of the permissions Serverless Framework's Monitoring & Observability features need. At the bottom of this page, click "Create".

While the CloudFormation Stack is creating, go back to the Serverless Framework Dashboard. The Integration view should have detected your Stack is being created and this view will continue to update in real-time until the integration is completed. No other steps are required on your behalf.

Repeat this step to connect as many AWS accounts that you'd like to enable Monitoring & Observability for.

Once an AWS account is connected, you will need to choose the AWS Lambda functions you wish to enable Monitoring & Observability on. You should see a newly created AWS Integration in the "Integrations" view. We recommend giving that AWS Account a name (e.g. "production", "development") so it's easier to remember and find in Dashboard's query filters. On the Integration, click the "Edit" button, and you will see all of the AWS Lambda functions within that AWS account.

Click the "Instrument" toggle on individual AWS Lambda functions, or click the toggle in the table header to enable instrumentation on all of the functions within that page (you'll have to repeat this on each page if you have multiple pages of AWS Lambda functions). Click "Save". This will instrument the AWS Lambda functions in the background. You can go through each page and continue to instrument AWS Lambda functions since instrumentation happens asynchronously.

Go to the Metrics or Explorer view. Make sure your AWS Lambda functions are being invoked. After a few minutes, you should see data appear.

Please note, Metrics, Traces and more typically can take up to 10 minutes before they are visible in Serverless Framework Dashboard, after an AWS account has been integrated.

### Set-Up Via Serverless Framework CLI

You can use the Serverless Framework CLI to enable Monitoring & Observability. This approach will automatically connect the Serverless Framework Platform to an AWS account and enable monitoring on all of the AWS Lambda functions within a Serverless Framework Service.

However, if you want to connect multiple AWS account(s) and/or enable monitoring on all AWS Lambda functions within an AWS account, doing set-up via the Serverless Framework Dashboard UI is more convenient, since you can accomplish this in a few clicks.

Within the working directory of a Serverless Framework Service, ensure the Service is first connected to Serverless Framework Dashboard, evidenced by having an `org` and `app` property within its `serverless.yml` file. If the Service is not connected to Dashboard, run the `serverless` command within the working directory of the Serverless Framework Service.

If those properties are set, perform a deployment via `sls deploy`. During the deployment, an integration will be established between Serverless Framework and the AWS account the deployment is targetting, automatically. Also during the deployment, all of the AWS Lambda functions will be instrumented within that Serverless Framework Service.

After deployment, confirm everything worked within the [Serverless Framework Dashboard](https://app.serverless.com). Go to "Settings" > "Integrations", and you should see the AWS Account that was recently integrated. We highly recommend you give that account a name, so it's easier to remember and find in Dashboard's query filters.

If you click on the "Edit" button on that Integration, you should see all of the AWS Lambda functions in the account, and the ones within your Serverless Framework Service should have their "Instrumented" toggle enabled.

Please note, Metrics, Traces and more typically can take up to 10 minutes before they are visible in Serverless Framework Dashboard, after an AWS account has been integrated.

## Advanced Instrumentation Using The SDK

In addition to the out-of-the-box instrumentation provided by Serverless Framework Dashboard, you can customize instrumentation using the Serverless SDK for richer use cases, such as:

- Capturing handled errors so that they are reported elegantly in Serverless Framework Dashboard.
- Capturing custom Trace Spans.
- Capturing Error and Warnings Events.
- Adding Custom Tags to Traces for better searchability.
- Integrating with structured logging libraries.

See the SDK documentation for Node and Python for details:

- [Full NodeJS Documentation](../sdk/nodejs.md)
- [Full Python Documentation](../sdk/python.md)

## Supported AWS Lambda Runtimes

Serverless Framework's Monitoring & Observability features currently support the following AWS Lambda Runtimes:

- nodejs14.x
- nodejs16.x
- nodejs18.x
- python3.8
- python3.9
- python3.10
- python3.11

## Supported AWS Regions

Serverless Framework's Monitoring & Observability features currently support all of the Commercial AWS Regions. They do not support GovCloud or reginos in China.

## How Integration Works

Serverless Framework's Monitoring & Observability features use a few approaches to thoroughly collect all Metrics, Traces, Errors and more from your AWS Lambda functions. This is all done via an AWS IAM Role that is created when you integrate your AWS account with Serverless Framework's Platform. The permissions for this AWS IAM Role are kept in [Github here](https://github.com/serverless/dashboard), so that you can easily review what's required. You can remove this IAM Role at any time. But we recommend hitting "Remove" on the Integration within the Dashboard because it will automatically un-instrument the AWS account and AWS Lambda functions, in addition to deleting the IAM Role.

The first thing an AWS account integration does is create a Kinesis Firehose within your AWS account connected to a Cloudwatch Logs Subscription to each of your AWS Lambda functions which publish logs into that Firehose. The Serverless Framework Platform ingests log data from that Kinesis Firehose. This helps us collect Logs and more from your AWS Lambda functions. During each invocation, the Serverless Framework logs a compressed payload containing Trace information within your AWS Cloudwatch Logs. This can be identified easily because it starts with `SERVERLESS_TELEMETRY`.

While the Serverless Framework does ingest Logs, it does not store them. Instead, it merely scans them for specific pieces of information, and a payload that the Serverless Framework SDK creates containing Trace data. Log storage is not something Serverless Framework Dashboard provides at this time.

Next, an AWS Lambda Layer and AWS Lambda Environment variables are added to each AWS Lambda function that has the "Instrument" toggle enabled. When "Intrument" is enabled these are added automatically. When you disable this toggle, the AWS Lambda Layer and Environment Variables are automatically removed.

Our AWS Lambda Layer is designed as an Internal Extension that uses the Wrapper Script `AWS_LAMBDA_EXEC_WRAPPER` environment variable to wrap your code with our SDK. Please note that if another tool is wrapping your AWS Lambda function code, we **will** overwrite it, and the other tool will no longer work.

Our AWS Lambda Layer is not an External Extension. Through extensive research and benchmarking, we've consistently found that adding observability tooling through AWS Lambda External Extensions almost always results in meaningful performance and cost penalties (cold starts, added invocation duration and added post-processing duration) for your AWS Lambda function. We do not recommend doing this for other tools that you may incorporate. Our Lambda Layer has been _heavily_ optimized to add no latency to cold-starts, duration to your invocations, or duration to post-processing.

Additionally, our integration will listen to CloudTrail events and will automatically check to ensure our AWS Lambda Layer and Environment Variables are still attached every time each function has been updated. This only happens for AWS Lambda functions with "Instrument" enabled. This allows you to use any deployment tool with Serverless Framework's Observability & Monitoring features. It also ensures that if you set "Instrument", we guarantee those AWS Lambda functions will be instrumented, mitigating deployment and configuration mistakes.

## How Trace Sampling Works

Serverless Framework Dashboard trace sampling is designed to sample at a default rate of 20% for high volume lambda functions, and disable sampling at lower volumes. This is achieved by disabling trace sampling on invocations where the average duration between invocations in the same AWS Lambda function container is less than one per second for 5 consecutive invocations.

These are some common use cases in which trace sampling will be disabled:

- After a cold start the first 5 invocations will not be sampled.
- There are less than 1.0 invocations per second on average with consistent (not spiky) invocations.
- There are far less than 1.0 invocations per second on average, and there is a spike of up to 5 invocations in less than 5 seconds.
- Invocation generates an error or warning events are never sampled.
- Sampling is disabled using the `SLS_DISABLE_TRACE_SAMPLING` environment variable.

On average trace sampling will be disabled in most cases where there are fewer than 2.5 million invocations per month, but may vary depending on the distribution of invocations, cold start rates, and error/warning rates.

## Disabling Monitoring & Observability

### Disabling An AWS Account

If you wish to disable the Monitoring & Observability features for an entire AWS account, go into the "Settings" > "Integrations" view and click "Remove" on the AWS account you wish to disconnect. Upon disconnect, Serverless Framework's Platform will automatically remove instrumentation from all AWS Lambda functions (Layers, Environment Variables), remove any resources created by the Serverless Framework Platform upon integration, and destroy the CloudFormation Stack containing the AWS IAM Role used to integrate into the account.

Please note that if you remove an Integration, if you immediately create a new Integration, this may cause the new Integration to take up to 20 minutes to fully work again due to AWS Resource quirks.

### Disabling A Service

If you wish to disable Serverless Framework's Monitoring & Observability features within a specific Serverless Framework Service, you can do so with the YAML configuration below. Doing this will prevent an AWS account from being integrated, and prevent your AWS Lambda functions from being instrumented:

```yaml
dashboard:
  disableMonitoring: true
```

### Disabling Trace Sampling

Trace Sampling happens automatically. It is measured individually for each AWS Lambda function (it's not account wide), and kicks in when your AWS Lambda function does 1-2 million invocations a month, or when it receives a burst of invocations.

To disable Trace Sample, you can set the following Environment Variable in your `serverless.yml`:

```YAML
provider:
  environment:
    SLS_DISABLE_TRACE_SAMPLING
```

You can also set the `environment` property on individual functions in `serverless.yml`

### Disabling AWS Span Collection

Serverless Framework will instrument the use of the AWS SDK to show use of AWS services by your Lambda function. This information provides a valuable visualization of what is happening inside your Lambda function, including how long calls to services like DynamoDB, S3 and others are taking.

If you wish to disable AWS Span collection, set the following Environment Variable in your `serverless.yml`:

```yaml
provider:
  environment:
    SLS_DISABLE_AWS_SDK_MONITORING: true
```

You can also set the `environment` property on individual functions in `serverless.yml`

### Disabling HTTP Span Collection

Serverless Framework will instrument the use of HTTP(s) by your Lambda function. Much like the AWS Spans, HTTP(s) spans will provide a visualization of the external communication that your function is invoking, including the duration of those sessions.

If you wish to disable Http Span collection, set the following Environment Variable in your `serverless.yml`:

```yaml
provider:
  environment:
    SLS_DISABLE_HTTP_MONITORING: true
```

You can also set the `environment` property on individual functions in `serverless.yml`.
