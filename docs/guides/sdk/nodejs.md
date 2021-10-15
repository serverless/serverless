<!--
title: Serverless SDK - Node.js
menuText: nodejs
layout: Doc
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/guides/sdk/nodejs/)

<!-- DOCS-SITE-LINK:END -->

# Node.js SDK

## `captureError`

Your lambda function may throw an exception, but your function handles it in order to respond to
the requester without throwing the error. One very common example is functions tied to HTTP
endpoints. Those usually should still return JSON, even if there is an error since the API Gateway
integration will fail rather than returning a meaningful error.

For this case, we provide a `captureError` function available on either the `context.serverlessSdk` or on the
module imported from `'./serverless_sdk'`. This will cause the invocation to still display as an
error in the serverless dashboard while allowing you to return an error to the user.

Here is an example of how to use it from the `context` object:

```javascript
module.exports.hello = async (event, context) => {
  try {
    // do some real stuff but it throws an error, oh no!
    throw new Error('aa');
  } catch (error) {
    context.serverlessSdk.captureError(error);
  }
  return {
    statusCode: 500,
    body: JSON.stringify({ name: 'bob' }),
  };
};
```

And to import it instead, import with
`const { captureError } = require('./serverless_sdk')` then call `captureError` instead of
`context.serverlessSdk.captureError`.

```javascript
const { captureError } = require('./serverless_sdk');

module.exports.hello = async (event) => {
  try {
    // do some real stuff but it throws an error, oh no!
    throw new Error('aa');
  } catch (error) {
    captureError(error);
  }
  return {
    statusCode: 500,
    body: JSON.stringify({ name: 'bob' }),
  };
};
```

## `span`

While the `serverless_sdk` automatically instruments AWS SDK and HTTP spans, you may be interested
in capturing span data for functions that do numerical computation or functions making database
queries. For this use-case, you can use the `span` function provided by `serverless_sdk`. The first
argument is a string, which will be used as the label of your span in the Dashboard. And the second
argument is a function. If it returns a `Promise`, then so will `span` if it does not, `span` will
return nothing.

Example from context with an async function:

```javascript
module.exports.handler = async (event, context) => {
  await context.serverlessSdk.span('some-label', async () => {
    // The execution of this function is captured as a span.
    // It is automatically invoked with no arguments and awaited.
  });
};
```

Example from context with a sync function:

```javascript
module.exports.handler = async (event, context) => {
  context.serverlessSdk.span('some-label', () => {
    // The execution of this function is captured as a span.
    // It is automatically invoked with no arguments.
  });
};
```

You can also import the function from `'./serverless_sdk'`

```javascript
const { span } = require('./serverless_sdk');
module.exports.handler = async (event, context) => {
  span('some-label', () => {
    // The execution of this function is captured as a span.
    // It is automatically invoked with no arguments.
  });
};
```

## `tagEvent`

Busy applications can invoke hundreds of thousands of requests per minute! At these rates, finding specific invocations can be like
searching for a needle in a haystack. We've felt this pain, which is why we've introduced tagged events.
Tagged Events are a simple way to identify invocations in the Serverless Dashboard. You can tag an invocation with any string you like, and find
all invocations associated with that tag. To provide extra context, you can specify a tag value to optionally filter on. If you're accustomed to
logging out a debugging object, you can pass a third `custom` attribute that will be surfaced in the dashboard as well.

The `tagEvent` function is available on either the `context.serverlessSdk` or on the
module imported from `'./serverless_sdk'`.

Here is an example of how to use it from the `context.serverlessSdk` object:

```javascript
module.exports.hello = async (event, context) => {
  // ... set up some state/custom logic
  context.serverlessSdk.tagEvent('customer-id', event.body.customerId, {
    demoUser: true,
    freeTrialExpires: '2020-09-01',
  });
  return {
    statusCode: 200,
    body: JSON.stringify({ name: 'bob' }),
  };
};
```

## Automatic route instrumentation with application middleware

Faced with practical considerations (a big one being CloudFormation stack resource limit), developers often reach for a single function solution with routing being handled by the application layer. This is usually accomplished either by leveraging plugins that extend popular application frameworks to play nicely with the Lambda runtime (e.g. [serverless-express](https://serverless.com/plugins/serverless-express/)), using a purpose-built one (like [lambda-api](https://github.com/jeremydaly/lambda-api)), or even rolling their own (via [lambda-router](https://github.com/trek10inc/lambda-router)).

An unfortunate downside of this approach is the loss of visibility into the mapped route for invocations. Instead, you're left with either the catch-all API Gateway resource path (`/{proxy+}`) or the raw request url itself (e.g. `/org/foo/user/bar/orders`). Neither of which are conducive for exploration and debugging invocations. The former is not very useful and the latter wouldn't let you group invocations by their routed endpoints to bubble up say, performance issues.

To alleviate these issues, for an application using `serverless-express` or `lambda-api`, the SDK will automatically instrument incoming invocations to set the routed endpoint. There's zero setup required!

If your application is using a custom-built router, you can still work around this issue by calling the `setEndpoint` SDK function described below.

Once set, invocations can be explored and inspected by endpoint in the Dashboard.

## `setEndpoint`

Allows the application to explicitly set the routed endpoint for an invocation. Like the other SDK methods, `setEndpoint` is available on either the context object: `context.serverlessSdk`, or can be imported manually from the base directory: `const { setEndpoint } = require('./serverless_sdk')`. Example usage:

```javascript
module.exports.api = async (event, context) => {
  context.serverlessSdk.setEndpoint('/api/foo');
  // application code...
};
```
