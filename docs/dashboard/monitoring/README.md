<!--
title: Serverless Dashboard - Monitoring
menuText: Monitoring
menuOrder: 1
layout: Doc
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/dashboard/monitoring/)

<!-- DOCS-SITE-LINK:END -->

# Monitoring

Serverless Monitoring help you monitor, develop and optimize your serverless application by providing key metrics and alerts.

## Installing

Monitoring is enabled by default when you deploy a Service using the Serverless Framework CLI.

### Configuration

Serverless Framework will automatically enable log collection by adding a CloudWatch Logs Subscription to send logs that match a particular pattern to our infrastructure for processing. This is used for generating metrics and alerts.

When deploying, Serverless Framework will also create an IAM role in your account that allows the Serverless Framework backend to call FilterLogEvents on the CloudWatch Log Groups that are created in the Service being deployed. This is used to display the CloudWatch logs error details views alongside the stack trace.

If you wish to disable log collection, set the following options:

**serverless.yml**

```yaml
custom:
  enterprise:
    collectLambdaLogs: false
```

## Advanced Configuration Options

### Uploading Source Map

The [New Error Alert](#new-error) and the [Error Metrics](#errors) can be used to view the stack trace for the occurrence of an error. Tools like Webpack and Typescript generate the packaged code and therefore may obfuscate the stack trace. The Serverless Framework Enterprise Plugin and SDK support sourcemaps to properly generate the stack trace.

To use a sourcemap, ensure that your packaging directory includes the compiled source, original source, and the source maps.

For example, if your directory structure is:

```
$ ls -l dist/* src/*
-rw-r--r--  1 dschep  staff   576B Mar 21 17:21 dist/handler.js
-rw-r--r--  1 dschep  staff   911B Mar 21 17:21 dist/handler.js.map
-rw-r--r--  1 dschep  staff   451B Mar 22 12:13 src/handler.js
```

Then you should have a packaging directory that includes all the files above:

```yaml
package:
  include:
    - src/*.js
    - dist/*.js
    - dist/*.js.map
```

## Capturing non-fatal errors

Your lambda function may throw an exception, but your function handles it in order to respond to the requestor without throwing the error. One very common example is functions tied to HTTP endpoints. Those usually should still return JSON, even if there is an error since the API Gateway integration will fail rather than returning a meaningful error.

For this case, we provide a `captureError` function available on either the `context` or on the module imported from `'./serverless_sdk'` in NodeJS or `serverless_sdk` in Python. This will cause the invocation to still display as an
error in the serverless dashboard while allowing you to return an error to the user.

Here is an example of how to use it from the `context` object:

```javascript
module.exports.hello = async (event, context) => {
  try {
    // do some real stuff but it throws an error, oh no!
    throw new Error('aa');
  } catch (error) {
    context.captureError(error);
  }
  return {
    statusCode: 500,
    body: JSON.stringify({ name: 'bob' }),
  };
};
```

[Full NodeJS Documentation](../sdk/nodejs.md#captureerror)

[Full Python Documentation](../sdk/python.md#capture_exception)

## AWS SDK spans

Serverless automatically instruments `aws-sdk` and `boto3`(`botocore` specifically) in NodeJS and
Python. Calls(service & operation. eg: S3 putItem) to the SDK are show in the invocation detail
in the dashboard.

## HTTP spans

Serverless also instruments your lambdas to report the spans for HTTP & HTTPS requests. In NodeJS
the `http` and `https` modules are instrumented, so any library built upon those will be captured.
In Python, the `urllib3`(thus `requests`) and `urllib2`(in Python2) and `urlib.request`(in Python3)
libraries are instrumented to capture HTTP & HTTPS requests.

By default, requests to AWS are not captured because of the above AWS SDK instrumentation which
provides more insight into the request.

[Configuration docs](../sdk/README.md#configuring-http-spans)

## Custom function spans

You can also instrument your own spans for services not covered by AWS SDK & HTTP span
instrumentation such as databases.

Here's an example of how to instrument a block of code in NodeJS:

```javascript
module.exports.handler = async (event, context) => {
  await context.span('some-label', async () => {
    // The execution of this function is captured as a span.
    // It is automatically invoked with no arguments and awaited.
  });
};
```

[Full NodeJS Documentation](../sdk/nodejs.md#span)

[Full Python Documentation](../sdk/python.md#span)
