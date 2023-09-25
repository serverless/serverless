<!--
title: Serverless Framework - Monitoring & Observability - Troubleshoot
menuText: Troubleshoot
menuOrder: 3
layout: Doc
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/guides/monitoring/trace-explorer/)

<!-- DOCS-SITE-LINK:END -->

# Troubleshoot Integration And Instrumentation Issues

Serverless Framework seeks to automate all aspects of integrating into AWS accounts and instrumenting your AWS Lambda functions, saving you time and effort required when doing this manually. However, this can be a complex operation depending on how your AWS accounts and functions are configured, as well as what other tools you might have installed.

If you do not see Metrics or Traces within Serverless Framework Dashboard, or these are missing for some AWS Lambda functions, here is a runbook with ordered steps that will help you debug issues. Please try this before reaching out to support because there are things in here we will ask for when helping solve any issues.

## Create Invocations

Metrics and Traces will only show up after the Integration has been created and your AWS Lambda functions have been set to "Instrumented". After that, ensure your AWS Lambda functions have been invoked to get Metrics and Traces to appear. Metrics and Traces for invocations that happened before the Integration was fully set up will not show in Serverless Framework Dashboard.

## Wait 10 Minutes

Wait at least 10 minutes for Metrics & Traces to show up after creating the Integration. Be sure to trigger AWS Lambda invocations after that 10 minute period to generate Metrics and Traces.

If you have recently removed the Integration and have immediately created a new one in the same AWS account. It may take up to 20 minutes for the Integration to finish set-up. This is due to some resources taking a while to be deleted and then re-created on the AWS account.

## Check AWS Lambda Functions Are Instrumented

Enabling Observability requires two steps, 1) Integrating an AWS account, and 2) Enabling instrumentation on individual AWS Lambda functions.

To check if your AWS Lambda Function(s) has instrumentation enabled, in Serverless Framework Dashboard, go to "Settings" > "Integrations" and click the "Edit" button on the AWS Account Integration containing the AWS Lambda functions that are missing data. This view will list all AWS Lambda functions in your AWS account, across all regions.

Next, ensure the "Instrument" toggle is enabled for the function(s) you expect to see Metrics and Traces for. If it's not enabled Metrics and Traces will not show up withing Dashboard. Enable it, then ensure your functions are invoked, and check Dashboard to see if it Metrics & Traces appear.

If AWS Lambda functions are missing from this view, but you know they exist within your AWS account, within our _Supported AWS Regions_, please contact our support team by using the support widget within [Serverless Framework Dashboard](https://app.serverless.com).

## Check The AWS Integration Cloudformation Stack Exists

Check the AWS Integration Cloudformation Stack was created within your AWS account. The Stack Name should resemble "Serverless-Inc-Role-Stack".

## Check The AWS Integration Cloudformation Stack Is In us-east-1

Check the AWS Integration Cloudformation Stack was created within us-east-1 in your AWS account.

The Stack Name should resemble "Serverless-Inc-Role-Stack".

## Check For Account Integration Errors

In Serverless Framework Dashboard, go to "Settings" > "Integrations" and see if there are any errors on the AWS Account Integration. If an error occurred during integration, you should be able to see it within this view, on the AWS account integration tile.

If you see an error here, please contact our support team by using the support widget within [Serverless Framework Dashboard](https://app.serverless.com).

## Check for Function Instrumentation Errors

If within Serverless Framework Dashboard's "Settings" > "Integrations" > "Edit" view, you can see errors listed on one or multiple AWS Lambda functions, this means that the AWS Lambda function(s) were not successfully instrumented and Metrics and Traces will not appear.

Here are some common errors and explanations:

**"Rate Limit Exceeded..." or "Rate Exceeded"**

If an AWS Lambda function has an error that contains this message, it most often means that the AWS Lambda function already has a maximum amount of AWS Cloudwatch Logs Subscriptions attached to it (the limit is 2). You will need to remove 1 Subscription in order for instrumentation to work.

To resolve this, try disabling instrumentation on each AWS Lambda function with this error via the "Instrument" toggle, then re-enabling "Instrument" by hitting the toggle. Don't forget to hit the "Save" button after you adjust the toggle.

**"Code uncompressed size is greater than the max allowed size..."**

This means that the AWS Lambda function has hit its individual code size limit, which is a combination of your uncompressed code and Layers. The Serverless Framework SDK is around ~600KB and should never be the reason you hit that limit, unless you were right up against it. You'll have to remove some unused dependencies from your code to proceed.

If there is another type of error here, please contact our support team by using the support widget within [Serverless Framework Dashboard](https://app.serverless.com).

## Check If Traces Are Being Sampled

Trace Sampling may be the reason AWS Lambda Traces are missing.

Trace Sampling happens automatically for individual AWS Lambda functions (i.e. sampling is not account-wide) if they are receiving a high volume of requests (typically 1-2 million invocations/month or a burst of invocations). If your AWS Lambda function is nowhere near 1-2 million invocations a month, or did not receive a temporary burst of invocations, you should rule out Trace Sampling as a potential issue.

There is also an Environment Variable to disable Trace Sampling for an individual AWS Lambda function. It is `SLS_DISABLE_TRACE_SAMPLING`. You will have to set this manually.

## Manually Check For The Trace Payload

When an AWS Lambda function is instrumented correctly with the Serverless Framework Platform, it will log a large, compressed payload in the AWS Cloudwatch Logs for your AWS Lambda function, which you can identify easily because it starts with `SERVERLESS_TELEMETRY`. This payload contains Trace data for that AWS Lambda function invocation. If this is not being published, Traces will not show up within the Serverless Framework Dashboard.

To resolve this, review the section on **Manually Checking For Instrumentation Issues**, since these instrumentation issues would most likely result in the Telemetry Payload not being logged.

## Manually Check For Instrumentation Issues

If there aren't any errors reported in Serverless Framework Dashboard, look in your AWS account and inspect each AWS Lambda function not reporting Metrics and Traces for the following issues:

**Is the Monitoring & Observability AWS Lambda Layer attached?**

It should have a name that resembles this: "sls-sdk-node-v0-15-12" or "sls-sdk-python-v0-2-3". There are limits to the number of AWS Lambda Layers that can be attached to each AWS Lambda function. Perhaps Dashboard's automatic integration hit that limit. To resolve, you'll have to delete a Layer. Disable ane then re-enable the "Instrument" toggle on a function within the Serverless Framework Dashboard Integration view to have Dashboard attempt to re-instrument the function for you, which includes adding the Layer.

**Is the Monitoring & Observability Wrapper Environment Variable Set?**

In your AWS Lambda function's Environment Variables, is there an Environment Variable titled "AWS_LAMBDA_EXEC_WRAPPER" and is it set to "/opt/sls-sdk-node/exec-wrapper.sh" for Node.js or "/opt/sls-sdk-python/exec_wrapper.py" for Python? This is required to enable our SDK to wrap your AWS Lambda Functions and collect Metrics, Traces, etc. You may have another AWS Lambda Layer that is attempting to wrap your code also using this Environment Variable. To resolve, you'll have to ensure this is set to the above. After deleting any other library or automation that is overwriting this, you can enable the function's "Instrument" toggle in the "Integration" view to have it attempt to configure this Environment Variable correctly for you.

We have seen this and other issues happen with the Sentry Error Management library.

**Are Other Required Environment Variables Set?**

Additional AWS Lambda Environment Variables are required. Check to see if these exist on your AWS Lambda function:

- SLS_ORG_ID

It's possible that you have too many AWS Lambda function Environment Variables, or have hit the size limit that AWS allows for Environment Variables on a single AWS Lambda function. To resolve, you'll have to delete some other Environment Variables. After deleting those, you can enable the function's "Instrument" toggle in the "Integration" view to have it attempt to configure the required Environment Variables for you.

**Is There A Conflict With Another Tool, Layer, Library or Custom Code?**

Perhaps there is an AWS Lambda Layer, Code Library or Custom Code you've written that is conflicting with successful operation of our SDK. Anything your code is doing that may conflict with the way AWS Lambda starts its runtime may be preventing our SDK from working correctly. We have seen this be more common in Python runtimes.

Additionally, we have seen conflicts happen with Sentry's tools. We are working on fixing these as best we can.

## Add The SDK Debug Environment Variable

To verify that our SDK is working, add this AWS Lambda Environment Variable: `SLS_SDK_DEBUG="true"`. This can be easily added via Serverless Framework or in the AWS Lambda Console.

Once this is added, invoke the problematic AWS Lambda function and check its logs in AWS Cloudwatch Logs. If you see this log: `SDK: Wrapper initialization`, then the SDK has initiatlized correctly and all required environment variables have been set. Now, the issue is likely that you may have a tool, library or custom code that is overwriting logic in our SDK, or our Platform has an ingest issue.
