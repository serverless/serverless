<!--
title: Serverless Framework Dashboard - V.2 Upgrade Guide
menuText: V2 Upgrade Guide
menuOrder: 8
description: Upgrading to Serverless Framework Dashboard V.2
layout: Doc
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/guides/upgrade/)

<!-- DOCS-SITE-LINK:END -->

# Upgrade Guide

## Connect AWS & Add Instrumentation

The new monitoring features require an integration with AWS. The previous
version of Serverless Dashboard created this integration from the CLI when a
service was deployed. The new version of Serverless Dashboard provides two
options for adding the integration, you can use the Dashboard UI or the CLI.

The Dashboard UI is the easier method of the two, as it does not require
the Serverless Framework to be upgrade, and it does not require redeployment.

### Using the Dashboard UI

To enable the new monitoring, you must first create an integration with AWS in
Serverless Dashboard, and instrument each AWS Lambda function.

When you visit any of the monitoring features in Dashboard, you will be prompted
to add the Integration if one doesn't already exist. You can also visit
**Settings > Integrations** to create the integration.

Once the integration is created, you will be prompted on the app view page to
add the instrumentation. You can also visit **Settings > Instrumentation**, and
click **Edit** on the Integration to enable instrumentation on functions
one-by-one or in bulk.

### Using the CLI

Update the Serverless Framework CLI to version 3.35.0 or higher.

```
npm install serverless --global
```

As an existing Serverless Dashboard user, the `serverless.yml` will already
contain `org` and `app` properties. These properties are required for Serverless
Dashboard to continue working.

Redeploy your service.

```
serverless deploy
```

The first time you deploy your service after upgrading the Serverless Framework,
the CLI will create the Dashboard integration, including the necessary IAM Role.

Additionally, the service must be instrumented, which is done automatically
upon deployment. The instrumentation adds the AWS CloudWatch Log subscription
and adds the necessary AWS Lambda layer.

To use the new monitoring, you must redeploy each service with this version.

Alternatively, you can use the Dashboard UI to both add the integration and
the instrumentation to each function. This does not require upgrade or
deployment.

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

### Replace reference to disableAwsSpan and disableHttpSpan

These two options disable the automatic collection of AWS and HTTP Spans in
traces. Previous these options were avilable in `custom.enterprise` in the
`serverless.yml` file. These options have been replaced with environment
variables that must be set on the lambda function.

```yaml
custom:
  enterprise:
    disableAwsSpan: true
    disableHttpSpans: true
```

Set the environment variables on all the functions in the `serverless.yml`

```yaml
provider:
  environment:
    SLS_DISABLE_HTTP_MONITORING: true
    SLS_DISABLE_AWS_SDK_MONITORING: true
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
dashboard:
  disableMonitoring: true
```

### Remove Dashboard SDK Wrapping (optional)

The Serverless Framework automatically includes the Dashboard SDK in the Lambda
package by wrpaping the AWS Lambda function handler on deployment. As of version
3.35.0+ of the Serverless Framework, the Dashboard SDK has been replaced with
no-op methods as to not break deployments. The next major release of the
Serverless Framework will fully deprecate the Dashboard SDK and disable
wrapping.

If you used the Dashboard SDK, you'll need to follow the "Update Node.js SDK"
and "Update Python SDK" sections to update the SDK usage.

In some cases, the Dashboard SDK wrapping may break your code. In these cases
wrapping is automatically disabled:

- You are using `.mjs` files
- You have set `"type": "module"` in `package.json`
- You are using Python version 3.11 or higher

You can also manually disable the Wrapping by including the following in your
`serverless.yml`.

```yaml
custom:
  enterprise:
    disableWrapping: true
```

## Updating Node.js SDK

The Serverless Framework Dashboard SDK has been deprecated and replaced with the
Serverless SDK. The new Serverless SDK provides support for additional features.
In most cases the methods are drop-in replacements; however, some methods have
been replaced with new methods.

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

The `captureError` method for capturing errors in Dashboard SDK is available as
a drop-in replacement in the Serverless SDK.

```javascript
// Replace this
context.serverlessSdk.captureError(error);

// with this
const serverlessSdk = require('@serverless/sdk');
serverlessSdk.captureError(ex);
```

### Replace tagEvents()

The `tagEvents` method was available in Dashboard SDK for tagging the Traces.
The `setTag` has been introduced to support tagging of both Traces and Events.
To replace `tagEvents` use `setTag` to tag the Trace.

```javascript
// Replace this
context.serverlessSdk.tagEvents('someKey', 'someValue', { demoUser: true });

// with this
const serverlessSdk = require('@serverless/sdk');
serverlessSdk.setTag('someKey', 'someValue');
serverlessSdk.setTag('demoUser', true);
```

The third parameter in `tagEvents` allowed for adding additional context that
was not searchable in Dashboard. The Serverless SDK does not support such a
parameter and instead, it is recommended that you add this additional context as
new tags.

### Replace span()

The `span` method for creating spans in Dashboard SDK is available as
a drop-in replacement in the Serverless SDK using the `createSpan` method.

```javascript
// Replace this
context.serverlessSdk.span('some-label', () => {
  // Some work
});

// with this
const serverlessSdk = require('@serverless/sdk');
serverlessSdk.createSpan('some-label', () => {
  // Some work
});
```

### Replace setEndpoint()

The `setEndpoint()` method for setting the endpoint in Dashboard SDK is
available as a drop-in replacement in the Serverless SDK.

```javascript
// Repalce this
context.serverlessSdk.setEndpoint('/api/foo');

// with this
const serverlessSdk = require('@serverless/sdk');
serverlessSdk.setEndpoint('/api/foo');
```

## Updating Python SDK

The Serverless Framework Dashboard SDK has been deprecated and replaced with the
Serverless SDK. The new Serverless SDK provides support for additional features.
In most cases the methods are drop-in replacements; however, some methods have
been replaced with new methods.

### Loading SDK

The Dashboard SDK can be loaded adding the `serverless_sdk` module or by
using the methods automatically loaded in `context.serverless_sdk`.

The `context.serverless_sdk` methods are now deprecated and therefore you will
need to load the SDK by adding the `serverless_sdk` module.

If you load the module you'll need to replace `serverless_sdk` with `sls_sdk`.

```python
# Replace this
from serverless_sdk import capture_exception, span, tag_event, set_endpoint

# with this
from sls_sdk import serverlessSdk
```

### Replace capture_error()

The `capture_error` method for capturing errors in Dashboard SDK is available as
a drop-in replacement in the Serverless SDK.

```python
# Replace this
context.serverless_sdk.capture_error(Exception("Unexpected"));

# with this
from sls_sdk import serverlessSdk;
serverlessSdk.capture_error(Exception("Unexpected"));
```

### Replace tag_event()

The `tag_event` method was available in Dashboard SDK for tagging the Traces.
The `set_tag` has been introduced to support tagging of both Traces and Events.
To replace `tag_event` use `set_tag` to tag the Trace.

```python
# Replace this
context.serverless_sdk.tag_event('someKey', 'someValue', { 'demoUser': 'true' });

# with this
from sls_sdk import serverlessSdk
serverlessSdk.set_tag('someKey', 'someValue');
serverlessSdk.set_tag('demoUser', 'true');
```

The third parameter in `tag_event` allowed for adding additional context that
was not searchable in Dashboard. The Serverless SDK does not support such a
parameter and instead, it is recommended that you add this additional context as
new tags.

### Replace span()

The `span` method for creating spans in Dashboard SDK is available as
a drop-in replacement in the Serverless SDK using the `create_span` method.

```python
# Replace this
with context.serverless_sdk.span('some-label'):
  pass # some work

# with this
from sls_sdk import serverlessSdk
with serverlessSdk.create_span('some-label'):
  pass # some work
```

### Replace set_endpoint()

The `set_endpoint()` method for setting the endpoint in Dashboard SDK is
available as a drop-in replacement in the Serverless SDK.

```python
# Repalce this
context.serverless_sdk.set_endpoint('/api/foo');

# with this
from sls_sdk import serverlessSdk
serverlessSdk.set_endpoint('/api/foo');
```
