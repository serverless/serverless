<!--
title: Serverless Framework Dashboard - Upgrade Guide
menuText: Upgrade Guide
menuOrder: 12
description: Upgrading Serverless Framework Dashboard
layout: Doc
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/guides/upgrade/)

<!-- DOCS-SITE-LINK:END -->

# Upgrade Guide

## Updating serverless.yml

For majority of users no changes are necessary to the `serverless.yml`; however,
if you used one of the less frequently used features, you may need to make
updates to your `serverless.yml` file to remove dependencies on deprecated
features.

### Remove reference to logIngestMode

When Dashboard monitoring was first released, there was a limit of one
subscription per CloudWatch Log Group. Since then, the limit has increased to
two. This means that the `logIngestMode` option is no longer necessary in most
orgs.

Remove references in `serverless.yml` to `custom.enterprise.logIngestMode`:

```yaml
custom:
  enterprise:
    logIngestMode: pull
```

### Remove reference to disableAwsSpan and disableHttpSpan

These two options disable the automatic collection of AWS and HTTP Spans in
traces. These two options have been deprecated. To disable AWS and HTTP Spans,
monitoring must be disabled completely.

```yaml
custom:
  enterprise:
    disableAwsSpan: true
    disableHttpSpans: true
```

Use the `monitor` option to disable monitoring.

```yaml
monitor: false
```

### Replace collectLambdaLogs

If you are using features like Parameters, Providers, or Outputs, but not using
the Monitoring features, you can disable monitoring. We've simplified the syntax
for disabling monitoring in Dashboard.

This option is now deprecated:

```yaml
custom:
  enterprise:
    collectLambdaLogs: false
```

Use the `monitor` option to disable monitoring instead:

```yaml
monitor: false
```

## Updating Node.js SDK

The Serverless Framework Dashboard SDK has been deprecated and replaced with the
Serverless SDK. The Serverless SDK is a drop-in replacement for the Dashboard
SDK, in most cases; however, some changes may be necessary depending on usage.

### Loading SDK

The Dashboard SDK can be loaded either by requiring `./serverless_sdk` or by
using the methods automatically loaded in `context.serverlessSdk`.

The `context.serverlessSdk` methods are now deprecated and therefore you will
need to load the SDK via `require("@serverless/sdk")`.

If you use `require("./serverless_sdk")` you will need to update your code to
load the SDK via `require("@serverless/sdk")`.

```javascript
// Replace this
const serverlessSdk = require('./serverless_sdk');

// with this
const serverlessSdk = require('@serverless/sdk');
```

### Replace captureError()

The `captureError` method for capturing errors is now available on the
`serverlessSdk` object.

```javascript
// Replace this
context.serverlessSdk.captureError(error);

// with this
const serverlessSdk = require('@serverless/sdk');
serverlessSdk.captureError(ex);
```

### Replace tagEvents()

Placeholder

### Replace span()

Placeholder

### Replace setEndpoint()

Placeholder

## Updating Python SDK

Placeholder
