<!--
title: Serverless Framework - SDK - Node.js
menuText: Node.js
menuOrder: 1
layout: Doc
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/guides/sdk/nodejs/)

<!-- DOCS-SITE-LINK:END -->

# Node.js SDK

Serverless Dashboard, when Instrumentation is enabled on an AWS Lambda function,
will hook into the AWS Lambda runtime environment and automatically report
metrics, traces, spans, and events. To capture handled errors, warnings, and to
set custom tags, the SDK library must be added and instrumented in your AWS
Lambda function handler.

## Key terms

- An **Event** is an instance of an error, warning, or notice that is captured
  as a part of a Trace. Multiple events can be captured in a single trace.
- A **Captured Error** is an instance of an error that is sent to Serverless
  Dashboard as an Event. It can be viewed in the Trace Explorer Details.
- A **Captured Warning** is one instance of a string in Node.js that is sent to
  Serverless Dashboard as an Event, much like a Captured Error.
- A **Tag** is a key/value-pair that can be set on the Trace or an individual
  Event, and sent to Serverless Dashboard. Tags can be viewed on the Trace
  Explorer Details.

## Installation

### Install the package

When Tracing is enabled in Serverless Dashboard, an AWS Lambda Layer is added
to your AWS Lambda function with the `@serverless/sdk` package. While the AWS
Lambda layer is added by Serverless Dashboard, it is possible for the layer to
be removed temporarily if you deploy manually or with some infrastructure as
code tools. As such, we recommend bundling the SDK with your handler to avoid
unresolved references to the SDK.

```
npm install @serverless/sdk --save
# or
yarn add @serverless/sdk
```

### Using a bundler

If you use a bundler, like esbuild, the AWS Lambda Layer for Serverless
Dashboard will instrument native Node.js APIs like `http` and `console`, and
APIs available on the runtime like the AWS SDK; however, if the handler bundles
APIs, like `express` or the AWS SDK, then Serverless Dashboard will not be able
to auto-instrument. To enable auto-instrumentation for these APIs, you will need
to manually add the AWS-specific auto-instrumentation library and initiate
auto-instrumentation.

Install the `@serverless/aws-lambda-sdk` package locally. This replaces the need
for the `@serverless/sdk` package, so you do not need both.

```
npm install @serverless/aws-lambda-sdk --save
# or
yarn add @serverless/aws-lambda-sdk
```

Use the following methods to instrument the AWS client libraries and Express.js.

```javascript
const express = require('express');
const serverlessSdk = require('@serverless/aws-lambda-sdk');

// Instrument AWS SDK v2
serverlessSdk.instrumentation.awsSdkV2.install(AWS);

// Instrument AWS SDK v3 client
serverlessSdk.instrumentation.awsSdkV3Client.install(client);

// Instruments Express.js
const expressApp = express();
// Ensure you install the SDK instrumentation before
// installing any express middleware
serverlessSdk.instrumentation.expressApp.install(expressApp);
```

Additionally, in some instrumentation cases, it's important to ensure that
the bundler doesn't change the function names, as span names and tags are
resolved from them. In [esbuild](https://esbuild.github.io/) this can be ensured
with [`--keep-names`](https://esbuild.github.io/api/#keep-names) option.

### Enable Instrumentation

The SDK will merely generate the necessary Tags, Spans, and Events; however,
you must [Enable Instrumentation](/framework/docs/guide/monitoring/instrumentation)
for each of your functions for Serverless Dashboard to ingest the data.

## Usage

The package does not require any configuration as the credentials are
automatically set on the AWS Lambda function environment variables when Tracing
is enabled in Serverless Dashboard.

To use the Serverless SDK you must require the `@serverless/sdk` method in your
AWS Lambda function handler.

```javascript
const serverlessSdk = require('@serverless/sdk');
```

### Setting up Source Maps

Source maps are files that map code between the original source code and its
transformed or compiled version. When code is minified, transpiled, or bundled,
with popular tools like TypeScript, ESBuild, or Babel, it often becomes
difficult to read the transpiled code, and therefore the stack traces in Errors.

Serverless Framework Dashboard supports capturing errors using Source Maps, but
a few steps are required to generate the Source Map files, include them in the
package, and configure Node to use them with captured Errors in the Serverless
SDK.

If you are on a version of the Serverless Framework prior to 3.36.0, you will
need to remove the Dashboard SDK Wrapper by setting `disableWrapping`. More
details about wrapping are in the [Upgrade to V2 guide](https://www.serverless.com/framework/docs/guides/dashboard/upgrade-to-v2#remove-dashboard-sdk-wrapping-optional).

```yaml
custom:
  enterprise:
    disableWrapping: true
```

#### Generate the source map files

You will need to configure your transpiler/bundler to generate the Source Map
files (`.js.map`). We recommend using the [serverless-esbuild](https://www.serverless.com/plugins/serverless-esbuild)
Serverless Plugin to add support for ESBuild. Once you add the plugin, add the
`sourcemap` configuration option in `serverless.yml`.

```yaml
plugins:
  - serverless-esbuild

custom:
  esbuild:
    bundle: true
    minify: true
    sourcemap: true
```

#### Package the Source Map files

In the Serverless Framework, by default, all files and directories in your
service directory, including the generated `.js.map` files, get packaged except
for those specified in `.gitignore` and `.npmignore`. If you use
`package.include` or `package.exclude` in the `serverless.yml`, then ensure that
`*.js.map` files are included.

### Configure Node to use the Source Maps

Node 14+ natively supports Source Maps in Error objects by modifying the stack
trace handler. To use this feature you must pass the `--enable-source-maps`
CLI option to `node`. You can do this in your `serverless.yml` by setting the
`NODE_OPTIONS` environment variable.

```yaml
provider:
  environment:
    NODE_OPTIONS: --enable-source-maps
```

### Capturing Errors

The most common use case for the Serverless SDK is to capture handled errors.
There are two mechanisms for capturing handled errors.

#### Using captureError

```javascript
try {
  // an error is thrown
} catch (ex) {
  serverlessSdk.captureError(ex);
}
```

#### Using console.error

```javascript
try {
  // an error is thrown
} catch (ex) {
  console.error(ex);
}
```

The Serverless SDK automatically instruments the `console.error` method to
capture errors. This makes instrumentation much easier as you may already be
using `console.error` to display the errors.

This method can be used to capture `Error` objects, as well as any combination
of strings. If only an `Error` object is provided, then the stack trace in
Dashboard will show the stack trace of the error object. If a string, or a
combination of a string and `Error`, are provided, then the stack trace of the
`console.error` will be captured.

### Capturing Warnings

#### Using captureWarning

```javascript
serverlessSdk.captureWarning('Something bad will happen soon');
```

#### Using console.warn

```javascript
console.warn('My Warning');
```

The Serverless SDK automatically instruments the `console.warn` method to
capture warnings. This makes instrumentation easier as you may already be using
`console.warn` to display warnings.

This method only supports capturing strings.

We recommend avoiding using unique instance values for the strings. For example,
if you need to include a userId, email, request ID, or any ID that may be unique
to the individual invocation, we recommend using Tagging instead.

This method will capture the stack trace of the `console.warn` call so it
is easy to identify in Serverless Dashboard.

### Tagging

#### Setting Tags on the Trace

```javascript
serverlessSdk.setTag('userId', 'bd86489cf036');
```

Using the `setTag` method will create Tags associated with the entire Trace.
You'll be able to see the Tags on the Trace Details page in the Trace Explorer.

All Tags set with `setTag` are also inherited by all the Captured Errors and
Captured Warnings.

Tag keys may only contain alphanumeric, `.`, `-`, and `_` characters. Tag values
may contain any string value. Invalid tag keys will not throw errors, instead,
an SDK error will be made available in Trace Details.

#### Settings Tags with console.error and console.warn

```javascript
serverlessSdk.setTag('userId', 'bd86489cf036');
console.warn('warning message');
console.error(new Error('some error'));
```

Using `setTag` sets the Tag values on both the Trace and all Captured Errors
and Captured Warnings. Captured Errors and Captured Warnings can be created
using the `console.error` and `console.warn` methods. Therefore, Tags set with
`setTag` will apply to all Captured Errors and Captured Warnings created using
`console.error` and `console.warn`.

#### Setting Tags on Captured Errors

```javascript
serverlessSdk.captureError(ex, { tags: { userId: '1b8b4c6b4b14' } });
```

Tags can also be set on the individual error. If you previously set a Tag using
`setTag` then the Tags set on `captureError` will override the Tags on the
Captured Error, while keeping the Tag on the trace unmodified.

Tag keys on `captureError` are validated the same way as tag keys on `setTag`.

#### Setting Tags on Captured Warnings

```javascript
serverlessSdk.captureWarning('warning message', { tags: { userId: 'eb661c69405c' } });
```

Tags can also be added on the individual Captured Warnings, just like Captured
Errors.

Tag keys on `captureWarning` are validated the same way as tag keys on
`setTag`.

### Structured Logs with captureError and captureWarning

The `captureWarning` and `captureError` methods will send the content to
Serverless Framework Dashboard in a binary format. To enable human-readability these
methods will also output a structured-log JSON string, like the one shown
below.

This string is easier to read, and can also be used with other tools like
CloudWatch Log Insights to parse and search.

```javascript
{
  "source": "serverlessSdk",
  "type": "ERROR_TYPE_CAUGHT_USER",
  "message": "User not found",
  "stackTrace": "...",
  "tags": {
    "userId": "eb661c69405c"
   }
}
```

To disable the output of the structured logs with `captureError` and
`captureWarning`, set this environment variable in the runtime.

```bash
SLS_DISABLE_CAPTURED_EVENTS_STDOUT=true
```

### Creating Custom Spans

Spans are part of the Trace that show when something started and stopped. Spans
can be nested and they can contain Events. Spans are automatically created by
the Serverless SDK for AWS and HTTP requests. These methods show you how you can
create your own custom spans and nest them.

#### Create a Custom Span

```javascript
const customSpan1 = serverlessSdk.createSpan('mySpan');
// do some work
customSpan1.close();
```

#### Creating a Custom Span with a callback

Instead of creating a span and stopping it using `close()`, you can also pass a
callback method to `createSpan` to automatically start/stop the span when the
callback starts/stops.

```javascript
serverlessSdk.createSpan('mySpan', () => {
  // do some work
});
```

This also supports `async` callbacks.

```javascript
serverlessSdk.createSpan('mySpan', async () => {
  // do some work
});
```

#### Creating Nested Spans

Spans can also be nested by calling the `createSpan` method on a Span.

```javascript
const span1 = serverlessSdk.createSpan('span1');
const span2 = span1.createSpan('span2');
// do some work
span2.close();
// do additional work
span1.close();
```

Child spans must be stopped via `close()` before the parent Span is stopped. If
a parent span is stopped, then all child spans will be stopped.

### Setting a custom endpoint

When using a mono-lambda architecture, in which a single lambda function with a
framework like Express.js is routed from a single API Gateway endpoint, the
request on API Gateway is captured as a proxy endpoint. As a result, the request
may appear as `/{proxy+}` instead of the intended path. The Serverless SDK
automatically instruments frameworks like Express.js, KOA, etc. to capture the
correct endpoint. This enables you to filter for HTTP requests using the
inteded path.

In some cases, it may be necessary to manually set the endpoint. In such cases
you can use the `setEndpoint` method to customize the endpoint path.

```javascript
serverlessSdk.setEndpoint('/my/custom/endpoint');
```
