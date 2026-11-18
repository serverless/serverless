<!--
title: Dashboard Python SDK
description: Capture handled errors and warnings, add tags and create custom spans in Python Lambda functions with the Dashboard Python SDK, serverless-sdk.
short_title: Python SDK
keywords: ['Serverless Framework', 'Dashboard', 'SDK', 'Python', 'serverless-sdk', 'sls_sdk', 'capture_error', 'Observability']
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/guides/dashboard/monitoring/sdk/python)

<!-- DOCS-SITE-LINK:END -->

# Dashboard Python SDK

The Serverless Framework Dashboard Python SDK, `serverless-sdk` (imported as `sls_sdk`), lets a Lambda handler send more than the automatic instrumentation collects: handled errors and warnings, tags, custom spans and the request endpoint. The SDK API takes effect in functions that the Dashboard instruments; see [Dashboard monitoring and observability](../README.md). The Dashboard and the SDK work the same for functions deployed with the Serverless Framework or with other tools.

Add the package to the `requirements.txt` of your service:

```text
serverless-sdk
```

This handler tags the trace with the order ID and reports a handled error without failing the invocation:

```python
# handler.py
import json

from sls_sdk import serverlessSdk


def load_order(order_id):
    if not order_id:
        raise ValueError("Missing order_id")
    return {"order_id": order_id}


def handler(event, context):
    serverlessSdk.set_tag("order.id", str(event.get("order_id", "none")))
    try:
        order = load_order(event.get("order_id"))
        return {"statusCode": 200, "body": json.dumps(order)}
    except ValueError as error:
        serverlessSdk.capture_error(error)
        return {"statusCode": 400, "body": str(error)}
```

The error appears as a **Caught Error** event on the invocation's trace in the [Trace Explorer](../traces.md), with the `order.id` tag on the trace.

## Install and import the SDK

The Dashboard's Lambda Layer (named `sls-sdk-python-v<version>`) already contains the SDK. Package `serverless-sdk` with your service too, so `from sls_sdk import serverlessSdk` resolves when the Layer is missing, for example after a deploy and before the Dashboard instruments the function again. To install it locally:

```bash
pip install serverless-sdk
```

In a function without the Layer, the SDK sends nothing to the Dashboard, and `capture_error`, `capture_warning`, `set_tag` and `set_endpoint` don't raise. `create_span` can raise there: without the Layer, the first span the handler creates becomes the trace's root span, and once it is closed, the next `create_span` call in the same Lambda execution environment, including in a later warm invocation, raises `UnreachableTrace: Cannot initialize span: Trace is closed`. If your code creates spans in functions that can run without the Layer, catch `UnreachableTrace` from `sls_sdk.exceptions`. `serverless-sdk` 0.6.0 imports on Python 3.8 to 3.12; on Python 3.13 and later, `from sls_sdk import serverlessSdk` raises `AttributeError: module 're' has no attribute 'TEMPLATE'` from its `js_regex` dependency. The SDK instruments the `logging` module, outgoing HTTP requests, `botocore` (AWS SDK) requests and Flask automatically; no setup code is needed.

The SDK's terms:

- **Event**: an error or warning captured during an invocation. A trace can have several.
- **Captured error** and **captured warning**: events your handler reports.
- **Tag**: a key/value pair set on the trace or on one event.
- **Span**: a timed step of the invocation, shown on the trace timeline.

## Capture handled errors

To report an exception that your handler catches, without failing the invocation, pass it to `capture_error`:

```python
try:
    load_order(order_id)
except ValueError as error:
    serverlessSdk.capture_error(error)
```

The SDK also captures every `error()` call of a `logging.Logger` as an error, including `logging.error()` and `logger.exception()`:

```python
import logging

logger = logging.getLogger()
logger.error("Order %s could not be loaded", order_id)
```

When the call gets a single exception, the event uses that exception; with a message, the event uses the formatted message and the stack trace of the call. To turn off `logging` capture, set `SLS_DISABLE_PYTHON_LOG_MONITORING`.

## Capture warnings

To report a warning, pass a string to `capture_warning`:

```python
serverlessSdk.capture_warning("Order total is above the review limit")
```

The SDK also captures every `warning()` and `warn()` call of a `logging.Logger` as a warning:

```python
logger.warning("Downstream call took %s ms", 2500)
```

The event uses the stack trace of the call. Keep warning messages free of per-invocation values such as user IDs, emails or request IDs, so the Dashboard groups the same warning together; put those values in tags instead.

## Add tags to traces and events

To tag the trace of the current invocation, call `set_tag`:

```python
serverlessSdk.set_tag("user.id", "bd86489cf036")
```

To tag a single captured error or warning, pass `tags`:

```python
serverlessSdk.capture_error(error, tags={"user.id": "1b8b4c6b4b14"})
serverlessSdk.capture_warning("Slow downstream response", tags={"user.id": "eb661c69405c"})
```

The Python SDK's tag rules:

- **Name**: letters, digits, `.`, `-` and `_`, 1 to 256 characters.
- **Value**: a `str`, `int`, `float`, `bool`, `datetime`, or a list of them; a string, or a list as JSON, can be at most 32,766 bytes.
- **Scope**: trace tags apply to the current invocation. Tags passed to `capture_error` or `capture_warning` apply to that event only.
- **Duplicates**: setting a tag again in the same invocation with a different value is rejected.

An invalid tag doesn't raise; the SDK skips it and records an **SDK Error** event on the trace. Tags are searchable with the **Custom Tags** filter of the [Trace Explorer](../traces.md#filter-traces-in-the-trace-explorer) and [Metrics](../metrics.md#filter-metrics).

## Group errors and warnings with a fingerprint

The Dashboard groups errors and warnings by a fingerprint it derives from them. To group them your own way, pass `fingerprint`:

```python
serverlessSdk.capture_error(error, fingerprint="order-load-failed")
```

## Structured log output of captured events

`capture_error` and `capture_warning` also log the event, so it's readable in CloudWatch Logs and searchable with CloudWatch Logs Insights. The logged value has this shape:

```json
{
  "source": "serverlessSdk",
  "type": "ERROR_TYPE_CAUGHT_USER",
  "name": "ValueError",
  "message": "Missing order_id",
  "stack": "..."
}
```

Captured warnings log the same shape with `"type": "WARNING_TYPE_USER"` and no `name`; a `fingerprint` key is added when you pass one. To stop logging these values, set `SLS_DISABLE_CAPTURED_EVENTS_STDOUT` to any non-empty value.

## Create custom spans

A custom span records how long a part of your handler takes. Span names are dot-separated tokens of lowercase letters, digits and underscores, each starting with a letter, for example `load_order` or `orders.load`. `create_span` raises `InvalidTraceSpanName` for any other name.

To time a block, use the span as a context manager; it closes when the block ends:

```python
with serverlessSdk.create_span("load_order"):
    order = load_order(order_id)
```

To close the span yourself, call `close()`:

```python
span = serverlessSdk.create_span("load_order")
order = load_order(order_id)
span.close()
```

A span created while another custom span is open becomes its child:

```python
with serverlessSdk.create_span("checkout"):
    with serverlessSdk.create_span("checkout.load_order"):  # child of checkout
        order = load_order(order_id)
```

Close child spans before their parent. Spans still open when the invocation ends are closed with it, and the SDK records an **SDK Warning** event that names them. In a function without the Dashboard's Layer, `create_span` can raise `UnreachableTrace`; see [Install and import the SDK](#install-and-import-the-sdk).

## Set the endpoint of a request

For API Gateway and function URL requests, the trace records the request path. When one function routes many paths, for example a Flask app behind `/{proxy+}`, the SDK records the Flask route that matched. To set the endpoint yourself, call `set_endpoint`:

```python
serverlessSdk.set_endpoint("/orders/{id}")
```

## Capture unhandled Flask exceptions

Flask turns an exception raised in a route into a `500` response, so the invocation succeeds. The SDK's Flask instrumentation reports such exceptions as captured errors. To make them fail the invocation and appear as **Uncaught Error** events, set Flask's `PROPAGATE_EXCEPTIONS`:

```python
app.config["PROPAGATE_EXCEPTIONS"] = True
```

With this setting, the exception reaches the Lambda runtime instead of becoming a `500` response, so your HTTP integration's error handling applies.

## Related pages

- [Dashboard observability SDKs](./README.md)
- [Node.js SDK](./nodejs.md)
- [Dashboard traces](../traces.md)
- [Dashboard monitoring and observability](../README.md)
