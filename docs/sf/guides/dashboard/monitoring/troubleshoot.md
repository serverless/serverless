<!--
title: Troubleshoot Dashboard Observability
description: Find out why Lambda metrics or traces are missing in the Serverless Framework Dashboard, and fix integration and instrumentation errors.
short_title: Troubleshooting
keywords: ['Serverless Framework', 'Dashboard', 'Observability', 'Troubleshoot', 'Integration', 'Instrumentation', 'missing traces']
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/guides/dashboard/monitoring/troubleshoot)

<!-- DOCS-SITE-LINK:END -->

# Troubleshoot Dashboard observability

When metrics or traces of a Lambda function are missing in the Serverless Framework Dashboard, the cause is in one of three places: the AWS account integration, the instrumentation of the function, or the SDK at run time. Check them in this order:

1. The function is on a [supported runtime](./README.md#supported-aws-lambda-runtimes) in a [supported Region](./README.md#supported-aws-regions).
2. The function was invoked after it was instrumented.
3. The AWS account integration exists and shows no error.
4. The function is instrumented, with no instrumentation error.
5. The function writes the trace line to its logs.
6. The SDK starts in debug mode.

The sections that follow explain each check and the errors you may see. If the steps don't resolve the issue, contact support with the support widget in the [Dashboard](https://app.serverless.com).

## Metrics and traces are missing after setup

The Dashboard only collects data from invocations that happen after the function is instrumented. Invoke the function after the integration has finished and **Instrument** is on, then reload the **Metrics** or **Traces** page.

When `serverless deploy` connects an AWS account for the first time, the CLI prints that the integration is almost done and that you will receive an email when it is ready; the functions are instrumented after that, in the background.

## Check that the function is instrumented

Dashboard observability needs two things: an integration for the AWS account, and instrumentation turned on for the function.

To check a function, open **Settings**, then **Integrations** in the Dashboard, and select **Edit** on the integration of its AWS account. The list shows the account's functions in the supported Regions. Turn on **Instrument** for the function and select **Save**, or set `observability: true` for its stage in `serverless.yml` and deploy. Functions on unsupported runtimes stay uninstrumented.

If a function is missing from the list although it exists in a supported Region, contact support.

## Check the integration stack

The integration is the `Serverless-Inc-Role-Stack` CloudFormation stack in `us-east-1` of the AWS account. Check in the CloudFormation console of `us-east-1` that the stack exists and is in `CREATE_COMPLETE` or `UPDATE_COMPLETE` state, and in **Settings**, **Integrations** that the integration shows no error.

### `Creating an AWS IAM Role in your AWS account to connect Serverless Framework Observability failed`

`serverless deploy` prints this error, with the reasons from the stack events, when it couldn't create `Serverless-Inc-Role-Stack`:

```text
Creating an AWS IAM Role in your AWS account to connect Serverless Framework Observability failed:
  - ...
```

Cause: the deployment's AWS credentials lack permission to create the stack or its IAM roles, or a resource of the stack already exists. Fix: deploy with credentials that can create a CloudFormation stack with named IAM roles (`CAPABILITY_NAMED_IAM`) in `us-east-1`, or create the integration from the Dashboard as described in [Connect an AWS account in the Dashboard](./README.md#connect-an-aws-account-in-the-dashboard).

### `The AWS account with the ID "...", already has a Serverless Framework Observability integration...`

```text
The AWS account with the ID "123456789012", already has a Serverless Framework Observability integration into a different Serverless Framework Organization. Serverless Framework Observability will not be successfully set-up due to this. Please remove the other integration from the other AWS account first.
```

Cause: `Serverless-Inc-Role-Stack` exists in the AWS account, but the account is connected to another org. An AWS account can be integrated with one org. Fix: remove the integration in the other org (**Settings**, **Integrations**, **Remove**), then deploy again.

### `Your AWS account failed to integrate with Serverless Framework Observability.`

Cause: the Dashboard couldn't finish setting up the integration; the CLI prints the Dashboard's last error after this message. Fix: check the integration in **Settings**, **Integrations** for the error and contact support with it.

### `AWS provider credentials not found.`

```text
AWS provider credentials not found. Learn how to set up AWS provider credentials in our docs here: http://slss.io/aws-creds-setup.
```

Cause: the CLI couldn't call `sts:GetCallerIdentity` with the deployment's AWS credentials to find the AWS account. Fix: set up AWS credentials for the deploy; see [AWS credentials](../../../providers/aws/guide/credentials.md).

## Fix function instrumentation errors

Functions that couldn't be instrumented show the error in the integration's function list (**Settings**, **Integrations**, **Edit**). After a deploy, the CLI lists them too:

```text
Serverless Framework Observability instrumentation failed for the following functions:
• my-service-prod-hello - ...
```

### `Rate exceeded`

Cause: AWS throttled the API calls made while instrumenting the function. Fix: turn **Instrument** off for the function, select **Save**, then turn it on and select **Save** again.

### The log group already has 5 subscription filters

Cause: instrumentation adds a CloudWatch Logs subscription filter to the function's log group, and a log group can have at most 5 subscription filters ([CloudWatch Logs quotas](https://docs.aws.amazon.com/AmazonCloudWatch/latest/logs/cloudwatch_limits_cwl.html)). Fix: remove one of the log group's subscription filters, then turn **Instrument** off and on again.

### `Code uncompressed size is greater than the max allowed size...`

Cause: with the SDK Layer added, the function's code and Layers together, uncompressed, exceed the 250 MB [Lambda deployment package quota](https://docs.aws.amazon.com/lambda/latest/dg/gettingstarted-limits.html). Fix: remove unused dependencies or Layers from the function, deploy, and turn **Instrument** on again.

### `Serverless Framework Observability could not be enabled due to too many AWS Lambda Layers...`

```text
Serverless Framework Observability could not be enabled due to too many AWS Lambda Layers. Please remove at least one Layer from this function and try again.
```

Cause: a function can use at most 5 Layers, and the function already has 5. Fix: remove one Layer from the function in `serverless.yml`, then deploy again.

## Check whether traces are sampled

When invocations of a function arrive close together, the SDK sends some traces without custom spans, captured warnings and custom tags. Traces of invocations with errors are always sent in full. If invocations of the function are more than a second apart on average, sampling isn't the cause. The rules are in [How trace sampling works](./README.md#how-trace-sampling-works).

## Check the trace line in the function's logs

An instrumented function writes its trace to its CloudWatch Logs log group at the end of each invocation, as a long line that starts with `SERVERLESS_TELEMETRY.`. If an invocation's log has no such line, the SDK didn't run: check the Layer and environment variables in [Check the function's Layer and environment variables](#check-the-functions-layer-and-environment-variables).

## Check the function's Layer and environment variables

When the Dashboard shows no error but a function sends no data, check its configuration in the Lambda console:

- **Layer**: the function has a Layer whose name starts with `sls-sdk-node` or `sls-sdk-python`. A function can have at most 5 Layers; if it has 5 without the SDK Layer, remove one, then turn **Instrument** off and on again.
- **`AWS_LAMBDA_EXEC_WRAPPER`**: set to `/opt/sls-sdk-node/exec-wrapper.sh` (Node.js) or `/opt/sls-sdk-python/exec_wrapper.py` (Python). Another Layer or tool that sets its own `AWS_LAMBDA_EXEC_WRAPPER` replaces the Dashboard's; remove that setting, then turn **Instrument** off and on again.
- **`SLS_ORG_ID`**: set to your org's ID. All environment variables of a function together can be at most 4 KB ([Lambda quotas](https://docs.aws.amazon.com/lambda/latest/dg/gettingstarted-limits.html)); if the function is at the limit, remove other variables, then turn **Instrument** off and on again.

A `serverless deploy` of the function resets the Layer and environment variables, and the Dashboard adds them again after the update. Code or Layers that change how the Lambda runtime starts the handler can keep the SDK from wrapping it.

## Turn on SDK debug logs

To see whether the SDK starts, set `SLS_SDK_DEBUG` on the function to any non-empty value, in `serverless.yml` or in the Lambda console:

```yaml
functions:
  hello:
    handler: handler.hello
    environment:
      SLS_SDK_DEBUG: true
```

Invoke the function and read its logs. SDK debug lines start with `⚡ SDK:`; `⚡ SDK: Wrapper initialization` (Python) or `⚡ SDK: Invocation: start` (Node.js) shows that the SDK wrapped the handler. Debug mode also turns off trace sampling, so remove `SLS_SDK_DEBUG` when you are done.

If `SLS_ORG_ID` is missing, the SDK doesn't instrument the function and logs one of these:

```text
Serverless SDK Warning: Cannot instrument function: Missing "SLS_ORG_ID" environment variable
```

```text
Serverless SDK Error: Cannot instrument function: "orgId" not provided. Ensure "SLS_ORG_ID" environment variable is set, or pass it with the options
```

Turn **Instrument** off and on again for the function to set `SLS_ORG_ID`.

## Related pages

- [Dashboard monitoring and observability](./README.md)
- [Dashboard traces](./traces.md)
- [Dashboard observability SDKs](./sdk/README.md)
