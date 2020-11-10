<!--
title: Serverless SDK - Python
menuText: python
layout: Doc
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/guides/sdk/python/)

<!-- DOCS-SITE-LINK:END -->

# `capture_exception`

Your lambda function may throw an exception, but your function handles it in order to respond to
the requester without throwing the error. One very common example is functions tied to HTTP
endpoints. Those usually should still return JSON, even if there is an error since the API Gateway
integration will fail rather than returning a meaningful error.

For this case, we provide a `captureError` function available on either the `context.serverless_sdk` or on the
module imported from `'serverless_sdk'`. This will cause the invocation to still display as an
error in the serverless dashboard while allowing you to return an error to the user.

Here is an example of how to use it from the `context` object:

```python
def hello(event, context):
    try:
        # do some real stuff but it throws an error, oh no!
        raise Exception('aa')
    except Exception as exc:
        context.serverless_sdk.capture_exception(exc)
    return {
        'statusCode': 500,
        'body': '{"name": "bob"}',
    }
```

And to import it instead, import with
`from serverless_sdk import capture_exception` then call `capture_exception` instead of
`context.serverless_sdk.capture_exception`.

```python
from serverless_sdk import capture_exception

def hello(event, context):
    try:
        # do some real stuff but it throws an error, oh no!
        raise Exception('aa')
    except Exception as exc:
        capture_exception(exc)
    return {
        'statusCode': 500,
        'body': '{"name": "bob"}',
    }
```

# `span`

While the `serverless_sdk` automatically instruments AWS SDK and HTTP spans, you may be interested
in capturing span data for functions that do numerical computation or functions making database
queries. For this use-case, you can use the `span` context manager provided by `serverless_sdk`.
It accepts one argument of a label. The code within the `with` statement using the context manager
will be captured as a span in the Dashboard.

```python
def handler(event, context):
    with context.serverless_sdk.span('some-label'):
        pass # the execution of this `with` statement will be captured as a span
```

You can also import the function from `serverless_sdk`

```python
from serverless_sdk import span
def handler(event, context):
    with span('some-label'):
        pass # the execution of this `with` statement will be captured as a span
```

It also works as an async context manager for use with `async with`.

# `tag_event`

Busy applications can invoke hundreds of thousands of requests per minute! At these rates, finding specific invocations can be like
searching for a needle in a haystack. We've felt this pain, which is why we've introduced tagged events.
Tagged Events are a simple way to identify invocations in the Serverless Dashboard. You can tag an invocation with any string you like, and find
all invocations associated with that tag. To provide extra context, you can specify a tag value to optionally filter on. If you're accustomed to
logging out a debugging object, you can pass a third `custom` attribute that will be surfaced in the dashboard as well.

The `tag_event` function is available on either the `context.serverless_sdk` or on the
module imported from `'./serverless_sdk'`.

Here is an example of how to use it from the `context.serverless_sdk` object:

```python
def hello(event, context):
    # ... set up some state/custom logic
    context.serverless_sdk.tagEvent(
        'customer-id',
        event.body.customerId,
        { 'demoUser': 'true', 'freeTrialExpires': '2020-09-01' }
    )
    return {
        'statusCode': 500,
        'body': '{"name": "bob"}',
    }
```

# Automatic route instrumentation with application middleware

Faced with practical considerations (a big one being CloudFormation stack resource limit), developers often reach for a single function solution with routing being handled by the application layer. This is typically accomplished by leveraging the [serverless-wsgi](https://github.com/logandk/serverless-wsgi) plugin to deploy existing WSGI applications (Flask/Django/Pyramid etc). Rolling your own custom router is another option as well.

An unfortunate downside of this approach is the loss of visibility into the mapped route for invocations. Instead, you're left with either the catch-all API Gateway resource path (`/{proxy+}`) or the raw request url itself (e.g. `/org/foo/user/bar/orders`). Neither of which are conducive for exploration and debugging invocations. The former is not very useful and the latter wouldn't let you group invocations by their routed endpoints to bubble up say, performance issues.

To alleviate this issue, when deploying a [Flask](https://flask.palletsprojects.com/en/1.1.x/) application, the SDK will automatically instrument incoming invocations to set the routed endpoint. There's zero setup required!

If your application is using a custom-built router, you can still work around this issue by calling the `set_endpoint` SDK function described below.

Once set, invocations can be explored and inspected by endpoint in the Dashboard.

# `set_endpoint`

Allows the application to explicitly set the routed endpoint for an invocation. Like the other SDK methods, `setEndpoint` is available on either the context object: `context.serverless_sdk`.

```python
def handler(event, context):
  context.serverless_sdk.set_endpoint('/api/foo')
  # application code...
```

You can also import the function from `serverless_sdk`

```python
from serverless_sdk import set_endpoint
def handler(event, context):
  set_endpoint('/api/foo')
  # application code...
```
