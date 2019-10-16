<!--
title: Serverless SDK - Node.js
menuText: nodejs
layout: Doc
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/dashboard/sdk/nodejs/)

<!-- DOCS-SITE-LINK:END -->

# `captureError`

Your lambda function may throw an exception, but your function handles it in order to respond to
the requester without throwing the error. One very common example is functions tied to HTTP
endpoints. Those usually should still return JSON, even if there is an error since the API Gateway
integration will fail rather than returning a meaningful error.

For this case, we provide a `captureError` function available on either the `context` or on the
module imported from `'./serverless_sdk'`. This will cause the invocation to still display as an
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

And to import it instead, import with
`const { captureError } = require('./serverless_sdk')` then call `captureError` instead of
`context.captureError`.

```javascript
const { captureError } = require('./serverless_sdk');

module.exports.hello = async event => {
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

# `span`

While the `serverless_sdk` automatically instruments AWS SDK and HTTP spans, you may be interested
in capturing span data for functions that do numerical computation or functions making database
queries. For this use-case, you can use the `span` function provided by `serverless_sdk`. The first
argument is a string, which will be used as the label of your span in the Dashboard. And the second
argument is a function. If it returns a `Promise`, then so will `span` if it does not, `span` will
return nothing.

Example from context with an async function:

```javascript
module.exports.handler = async (event, context) => {
  await context.span('some-label', async () => {
    // The execution of this function is captured as a span.
    // It is automatically invoked with no arguments and awaited.
  });
};
```

Example from context with an sync function:

```javascript
module.exports.handler = async (event, context) => {
  context.span('some-label', () => {
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
