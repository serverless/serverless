<!--
title: Dashboard Observability SDKs
description: Use the Serverless Framework Dashboard SDKs for Node.js and Python to capture errors, add tags and spans, and configure Lambda instrumentation.
short_title: SDKs
keywords: ['Serverless Framework', 'Dashboard', 'SDK', '@serverless/sdk', 'serverless-sdk', 'Instrumentation', 'Observability']
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/guides/dashboard/monitoring/sdk)

<!-- DOCS-SITE-LINK:END -->

# Dashboard observability SDKs

The Serverless Framework Dashboard SDKs run inside instrumented AWS Lambda functions: they create the traces, spans and events the Dashboard shows, and give your handler an API to capture handled errors and warnings, add tags, create custom spans and set the request endpoint. Instrumentation works without code changes; use the SDK API when you need more than the automatic data.

| Runtime | Package to install                                                                                                           | Import                                        |
| ------- | ---------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| Node.js | `@serverless/sdk` (`@serverless/aws-lambda-sdk` for bundled or ES module code that needs AWS SDK or Express instrumentation) | `import serverlessSdk from '@serverless/sdk'` |
| Python  | `serverless-sdk`                                                                                                             | `from sls_sdk import serverlessSdk`           |

- [Node.js SDK](./nodejs.md)
- [Python SDK](./python.md)

## How the SDK gets into a function

When a function is instrumented, the Dashboard adds a Lambda Layer with the SDK and sets two environment variables on the function: `AWS_LAMBDA_EXEC_WRAPPER`, which makes the Layer's wrapper start your handler, and `SLS_ORG_ID`. The Serverless Framework doesn't add the SDK to your deployment package. Instrument functions with `stages.<stage>.observability` in `serverless.yml` or in the Dashboard; see [Dashboard monitoring and observability](../README.md).

Install the SDK package in your service as well when your handler calls the SDK API, so the import resolves even while the Layer is missing, for example right after a deploy and before the Dashboard instruments the function again. Without the Layer, the SDK sends nothing to the Dashboard. The Node.js SDK's API calls don't throw there. In the Python SDK, `create_span` can raise `UnreachableTrace` after the first custom span has closed; see [Install and import the Python SDK](./python.md#install-and-import-the-sdk).

## SDK environment variables

The SDKs read these environment variables at startup. Set them for all functions under `provider.environment`, or for one function under its `environment`. Any non-empty value, including `false`, turns a setting on:

| Variable                              | Runtime         | Effect                                                                                              |
| ------------------------------------- | --------------- | --------------------------------------------------------------------------------------------------- |
| `SLS_DISABLE_HTTP_MONITORING`         | Node.js, Python | No spans for outgoing HTTP and HTTPS requests.                                                      |
| `SLS_DISABLE_AWS_SDK_MONITORING`      | Node.js, Python | No spans for AWS SDK requests.                                                                      |
| `SLS_DISABLE_EXPRESS_MONITORING`      | Node.js         | No Express instrumentation.                                                                         |
| `SLS_DISABLE_FLASK_MONITORING`        | Python          | No Flask instrumentation.                                                                           |
| `SLS_DISABLE_NODE_CONSOLE_MONITORING` | Node.js         | `console.error`, `console.warn` and JSON log lines aren't captured as errors and warnings.          |
| `SLS_DISABLE_PYTHON_LOG_MONITORING`   | Python          | `logging` errors and warnings aren't captured.                                                      |
| `SLS_DISABLE_CAPTURED_EVENTS_STDOUT`  | Node.js, Python | Errors and warnings captured with the SDK API aren't printed to the logs.                           |
| `SLS_DISABLE_TRACE_SAMPLING`          | Python          | Every trace is sent in full. See [How trace sampling works](../README.md#how-trace-sampling-works). |
| `SLS_SDK_DEBUG`                       | Node.js, Python | Prints SDK debug lines starting with `⚡ SDK:` and sends every trace in full.                       |

For example, to turn off HTTP spans for every function of a service:

```yaml
provider:
  environment:
    SLS_DISABLE_HTTP_MONITORING: true
```

## SDK source and changelogs

The SDKs are open source; their source, API references and changelogs are in the [Serverless Framework Dashboard repository](https://github.com/serverless/console).

## Related pages

- [Node.js SDK](./nodejs.md)
- [Python SDK](./python.md)
- [Dashboard traces](../traces.md)
