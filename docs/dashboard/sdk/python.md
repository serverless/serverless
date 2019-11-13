<!--
title: Serverless SDK - Python
menuText: python
layout: Doc
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/dashboard/sdk/python/)

<!-- DOCS-SITE-LINK:END -->

# `capture_exception`

Your lambda function may throw an exception, but your function handles it in order to respond to
the requester without throwing the error. One very common example is functions tied to HTTP
endpoints. Those usually should still return JSON, even if there is an error since the API Gateway
integration will fail rather than returning a meaningful error.

For this case, we provide a `captureError` function available on either the `context` or on the
module imported from `'serverless_sdk'`. This will cause the invocation to still display as an
error in the serverless dashboard while allowing you to return an error to the user.

Here is an example of how to use it from the `context` object:

```python
def hello(event, context):
    try:
        # do some real stuff but it throws an error, oh no!
        raise Exception('aa')
    except Exception as exc:
        context.capture_exception(exc)
    return {
        'statusCode': 500,
        'body': '{"name": "bob"}',
    }
```

And to import it instead, import with
`from serverless_sdk import capture_exception` then call `capture_exception` instead of
`context.capture_exception`.

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
    with context.span('some-label'):
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
