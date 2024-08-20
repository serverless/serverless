<!--
title: Serverless Framework - Monitoring & Observability - SDKs
description: Learn how to use the Serverless Framework SDK for monitoring and observability in your serverless applications.
short_title: Serverless Observability - SDK
keywords:
  [
    'Serverless Framework',
    'SDK',
    'Monitoring',
    'Observability',
    'Lambda',
    'Instrumentation',
  ]
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/guides/sdk/)

<!-- DOCS-SITE-LINK:END -->

# Serverless Framework SDK

When using the Serverless Framework Dashboard, the Framework automatically injects the `serverless_sdk` module into your lambda package and wraps your lambda to automatically instrument all the monitoring features in the Dashboard.

It also has certain features you can use directly in your lambda such as capturing an error in the Dashboard without causing your lambda to error and custom function spans.

[NodeJS Documentation](./nodejs.md)

[Python Documentation](./python.md)

## Advanced Span Configuration

For most of the SDK configuration, like turning on/off span collection, follow the
[Monitoring Configuration](../README.md/#configuration) instructions to modify your
serverless.yml appropriately.

If needed, you can configure HTTP span collection with the following environment variables

- `SERVERLESS_ENTERPRISE_SPANS_CAPTURE_HOSTS` - `*` by default. Set to a comma delimited list of host names to capture.
- `SERVERLESS_ENTERPRISE_SPANS_IGNORE_HOSTS` - not set by default. Set to comma delimited list of hostnames to not capture.
- `SERVERLESS_ENTERPRISE_SPANS_CAPTURE_AWS_SDK_HTTP` - not set by default. Set to any value to also capture HTTP spans for requests from `botocore` or `aws-sdk`.
