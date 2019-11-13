<!--
title: Serverless SDK
menuText: sdk
layout: Doc
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/dashboard/sdk/)

<!-- DOCS-SITE-LINK:END -->

# `serverless_sdk`

When using the Serverless Dashboard, the framework automatically injects the `serverless_sdk`
module into your lambda package and wraps your lambda to automatically instrument all the
monitoring features in the Dashboard.

It also has certain features you can use directly in your lambda such as capturing an error in the
Dashboard without causing your lambda to error and custom function spans.

[NodeJS Documentation](../sdk/nodejs.md)

[Python Documentation](../sdk/python.md)

## Configuring HTTP spans

You can configure the HTTP spans with the following environment variables

- `SERVERLESS_ENTERPRISE_SPANS_CAPTURE_HOSTS` - `*` by default. Set to a comma delimited list of
  host names to capture.
- `SERVERLESS_ENTERPRISE_SPANS_IGNORE_HOSTS` - not set by default. Set to comma delimited list of
  hostnames to not capture.
- `SERVERLESS_ENTERPRISE_SPANS_CAPTURE_AWS_SDK_HTTP` - not set by default. Set to any value to
  also capture HTTP spans for requests from `botocore` or `aws-sdk`.
