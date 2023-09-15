<!--
title: Serverless Dashboard - Monitoring
menuText: Monitoring
menuOrder: 4
layout: Doc
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/guides/monitoring/)

<!-- DOCS-SITE-LINK:END -->

# Monitoring

Serverless Monitoring help you monitor, develop and optimize your serverless application by providing key metrics and alerts.

## Installing

Monitoring is enabled by default if `org` and `app` are defined in the `serverless.yml`, you just need to deploy your service once those lines are added.

## Configuration

Serverless Framework, when configured to connect to the dashboard, will automatically collect three pieces of diagnostics:

- Lambda Log Collection
- AWS Spans
- HTTP Spans

**Lambda Log Collection**

Serverless Framework will enable log collection by adding a CloudWatch Logs Subscription to send logs that match a particular pattern to our infrastructure for processing. This is used for generating metrics and alerts.

When deploying, Serverless Framework will also create an IAM role in your account that allows the Serverless Framework backend access the CloudWatch Log Groups that are created in the Service being deployed. This is used to display the CloudWatch logs error details views alongside the stack trace.

## Disabling log collection

If you wish to disable log collection, simply add this to `serverless.yml`.

```yaml
dashboard:
  disableMonitoring: true
```

**AWS Spans**

Serverless Framework will instrument the use of the AWS SDK to show use of AWS services by your Lambda function. This information provides
a valuable visualization of what is happening inside your lambda function, including how long calls to services like DynamoDB, S3 and others are taking.

If you wish to disable AWS Span collection, set fhe following option:

**serverless.yml**

```yaml
provider:
  environment:
    SLS_DISABLE_AWS_SDK_MONITORING: true
```

**HTTP(s) Spans**

Serverless Framework will instrument the use of HTTP(s) by your Lambda function. Much like the AWS Spans, HTTP(s) spans will provide a
visualization of the external communication that your function is invoking, including the duration of those sessions.

If you wish to disable Http Span collection, set fhe following option:

**serverless.yml**

```yaml
provider:
  environment:
    SLS_DISABLE_HTTP_MONITORING: true
```

## Custom instrumentation using the Serverless SDK

In addition to the automatic instrumentation provided by Serverless Framework Dashboard, you can also add custom instrumentation using the Serverless SDK.

You can use the Serverless SDK for a few use cases:

- Capturing handled errors
- Capturing custom spans
- Capturing error and warnings events
- Tagging traces for better searchability
- Integrating with structured logging libraries

See the SDK documentation for Node and Python for details.

[Full NodeJS Documentation](../sdk/nodejs.md#span)

[Full Python Documentation](../sdk/python.md#span)
