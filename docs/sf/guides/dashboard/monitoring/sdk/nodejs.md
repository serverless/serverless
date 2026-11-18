<!--
title: Dashboard Node.js SDK
description: Capture handled errors and warnings, add tags, create custom spans and map stack traces in Lambda functions with the Dashboard Node.js SDK.
short_title: Node.js SDK
keywords: ['Serverless Framework', 'Dashboard', 'SDK', 'Node.js', '@serverless/sdk', 'captureError', 'Observability']
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/guides/dashboard/monitoring/sdk/nodejs)

<!-- DOCS-SITE-LINK:END -->

# Dashboard Node.js SDK

The Serverless Framework Dashboard Node.js SDK, `@serverless/sdk`, lets a Lambda handler send more than the automatic instrumentation collects: handled errors and warnings, tags, custom spans and the request endpoint. The SDK API takes effect in functions that the Dashboard instruments; see [Dashboard monitoring and observability](../README.md).

Install the package in your service:

```bash
npm install @serverless/sdk
```

This handler tags the trace with the order ID and reports a handled error without failing the invocation:

```javascript
// handler.mjs
import serverlessSdk from '@serverless/sdk'

const loadOrder = async (orderId) => {
  if (!orderId) throw new Error('Missing orderId')
  return { orderId }
}

export const handler = async (event) => {
  serverlessSdk.setTag('order.id', String(event.orderId ?? 'none'))
  try {
    const order = await loadOrder(event.orderId)
    return { statusCode: 200, body: JSON.stringify(order) }
  } catch (error) {
    serverlessSdk.captureError(error)
    return { statusCode: 400, body: error.message }
  }
}
```

In `serverless.yml`, point the function at this handler with `handler: handler.handler`. The error appears as a **Caught Error** event on the invocation's trace in the [Trace Explorer](../traces.md), with the `order.id` tag on the trace.

## Install and import the SDK

The Dashboard's Lambda Layer (named `sls-sdk-node-v<version>`) already contains the SDK. Install `@serverless/sdk` in your service too, so `import serverlessSdk from '@serverless/sdk'` resolves when the Layer is missing, for example after a deploy and before the Dashboard instruments the function again. In an instrumented function, the import returns the SDK instance the Layer loaded before your handler, whether your copy of the package is installed in `node_modules` or bundled. In a function without the Layer, the SDK sends nothing to the Dashboard; its API calls don't throw, and `captureError` and `captureWarning` still print their [log lines](#structured-log-output-of-captured-events).

The SDK's terms:

- **Event**: an error or warning captured during an invocation. A trace can have several.
- **Captured error** and **captured warning**: events your handler reports.
- **Tag**: a key/value pair set on the trace or on one event.
- **Span**: a timed step of the invocation, shown on the trace timeline.

## Instrument AWS SDK clients and Express in ES modules and bundles

The SDK Layer instruments Node.js `http`, `https` and `console` in every handler. It instruments AWS SDK v3 clients and Express automatically only when they are loaded with CommonJS `require`. The Express instrumentation, automatic or installed in code, applies to Express 4: Express 5 has no `app.lazyrouter` method, so `expressApp.install` throws `Passed argument is not an instance of express app` when it gets an Express 5 app. When your handler is an ES module that imports them, or bundles them (the Framework's built-in esbuild bundles by default), install the instrumentation in your code with `@serverless/aws-lambda-sdk`, which includes everything in `@serverless/sdk`:

```bash
npm install @serverless/aws-lambda-sdk
```

Pass each AWS SDK client and the Express 4 app to the SDK before you use them. This example also needs Express 4, `serverless-http` and the DynamoDB client:

```bash
npm install express@4 serverless-http @aws-sdk/client-dynamodb
```

```javascript
// handler.mjs
import express from 'express'
import serverlessHttp from 'serverless-http'
import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import serverlessSdk from '@serverless/aws-lambda-sdk'

const dynamodb = new DynamoDBClient({})
serverlessSdk.instrumentation.awsSdkV3Client.install(dynamodb)

const app = express()
// Install the instrumentation before adding middleware
serverlessSdk.instrumentation.expressApp.install(app)
app.get('/health', (req, res) => res.json({ ok: true }))

export const handler = serverlessHttp(app)
```

Span names and tags of instrumented middleware come from function names. If you minify the bundle, keep the names with esbuild's `keepNames` option, set in an esbuild [config file](../../../../providers/aws/guide/building.md#esbuild):

```javascript
// esbuild.config.js
export default () => ({
  keepNames: true,
})
```

## Capture handled errors

To report an error that your handler catches, without failing the invocation, pass it to `captureError`:

```javascript
try {
  await loadOrder(event.orderId)
} catch (error) {
  serverlessSdk.captureError(error)
}
```

The SDK also captures every `console.error` call as an error:

```javascript
console.error(error)
```

When `console.error` gets a single `Error`, the event uses that error's stack trace; with strings or several arguments, the event uses the stack trace of the `console.error` call. The SDK also captures JSON log lines with an `ERROR` level, or a numeric level above 40, as errors, for example from Pino, Winston or Powertools for AWS Lambda. To turn off `console` and JSON log capture, set `SLS_DISABLE_NODE_CONSOLE_MONITORING`.

## Capture warnings

To report a warning, pass a string to `captureWarning`:

```javascript
serverlessSdk.captureWarning('Order total is above the review limit')
```

The SDK also captures every `console.warn` call, and JSON log lines with a `WARN` level or a numeric level from 31 to 40, as warnings. The event uses the stack trace of the call.

Keep warning messages free of per-invocation values such as user IDs, emails or request IDs, so the Dashboard groups the same warning together; put those values in tags instead.

## Add tags to traces and events

To tag the trace of the current invocation, call `setTag`:

```javascript
serverlessSdk.setTag('user.id', 'bd86489cf036')
```

To tag a single captured error or warning, pass `tags` in the options:

```javascript
serverlessSdk.captureError(error, { tags: { 'user.id': '1b8b4c6b4b14' } })
serverlessSdk.captureWarning('Slow downstream response', {
  tags: { 'user.id': 'eb661c69405c' },
})
```

The Node.js SDK's tag rules:

- **Name**: letters, digits, `.`, `-` and `_`, 1 to 256 characters.
- **Value**: a string, number, boolean, `Date`, or an array of strings or of numbers; at most 32,766 bytes.
- **Scope**: trace tags apply to the current invocation; the SDK clears them after it. Tags passed to `captureError` or `captureWarning` apply to that event only.
- **Duplicates**: setting a tag again in the same invocation with a different value is rejected.

An invalid tag doesn't throw; the SDK skips it and records an **SDK Error** event on the trace. Tags are searchable with the **Custom Tags** filter of the [Trace Explorer](../traces.md#filter-traces-in-the-trace-explorer) and [Metrics](../metrics.md#filter-metrics).

## Group errors and warnings with a fingerprint

The Dashboard groups errors by a fingerprint derived from the stack trace, and warnings by one derived from the message. To group them your own way, pass `fingerprint`:

```javascript
serverlessSdk.captureError(error, { fingerprint: 'order-load-failed' })
```

## Structured log output of captured events

`captureError` and `captureWarning` also print the event to the function's log as one JSON line, so it's readable in CloudWatch Logs and searchable with CloudWatch Logs Insights:

```json
{
  "source": "serverlessSdk",
  "type": "ERROR_TYPE_CAUGHT_USER",
  "name": "Error",
  "message": "Missing orderId",
  "stack": "at loadOrder (file:///var/task/handler.mjs:5:23)\nat Module.handler (file:///var/task/handler.mjs:12:25)"
}
```

Captured warnings print the same shape with `"type": "WARNING_TYPE_USER"` and no `name`; a `fingerprint` key is added when you pass one. To stop printing these lines, set `SLS_DISABLE_CAPTURED_EVENTS_STDOUT` to any non-empty value.

## Create custom spans

A custom span records how long a part of your handler takes. Span names are dot-separated tokens of lowercase letters, digits and underscores, each starting with a letter, for example `load_order` or `orders.load`. An invalid name records an **SDK Error** event, and `createSpan` returns an object whose `close()` does nothing.

To time a block, create the span and close it:

```javascript
const span = serverlessSdk.createSpan('load_order')
await loadOrder(event.orderId)
span.close()
```

To close the span automatically, pass a function. `createSpan` returns the function's result; for an `async` function it returns the promise, and closes the span when the promise settles:

```javascript
const order = await serverlessSdk.createSpan('load_order', async () =>
  loadOrder(event.orderId),
)
```

A span created while another custom span is open becomes its child:

```javascript
const parent = serverlessSdk.createSpan('checkout')
const child = serverlessSdk.createSpan('checkout.load_order') // child of checkout
await loadOrder(event.orderId)
child.close()
parent.close()
```

Close child spans before their parent. Spans still open when the invocation ends are closed with it, and the SDK records an **SDK Warning** event that names them.

Custom spans, trace tags and captured warnings appear only on traces the SDK sends in full. When the invocations in an execution environment are on average 1 second apart or less, the Node.js SDK sends only some traces in full; see [How trace sampling works](../README.md#how-trace-sampling-works).

## Set the endpoint of a request

For API Gateway and function URL requests, the trace records the request path. When one function routes many paths, for example an Express app behind `/{proxy+}`, the SDK records the route that Express matched. To set the endpoint yourself, call `setEndpoint`:

```javascript
serverlessSdk.setEndpoint('/orders/{id}')
```

## Map stack traces with source maps

Bundled or minified code produces stack traces that point at the bundle. To see your source lines in captured errors, generate source maps and run Node.js with `--enable-source-maps`.

The Framework's built-in esbuild does both by default: `build.esbuild.sourcemap` defaults to `true`, the `.js.map` files are packaged with each handler, and `NODE_OPTIONS=--enable-source-maps` is added to the bundled functions:

```yaml
build:
  esbuild:
    minify: true
    sourcemap: true
```

If you set `sourcemap` as an object, `NODE_OPTIONS` is added only with `setNodeOptions: true`; see [esbuild](../../../../providers/aws/guide/building.md#esbuild). With another build tool, package the `.js.map` files (don't exclude them in `package.patterns`) and set the variable yourself:

```yaml
provider:
  environment:
    NODE_OPTIONS: --enable-source-maps
```

## Related pages

- [Dashboard observability SDKs](./README.md)
- [Python SDK](./python.md)
- [Dashboard traces](../traces.md)
- [Dashboard monitoring and observability](../README.md)
