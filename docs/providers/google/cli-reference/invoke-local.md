<!--
title: Serverless Framework Commands - Google Cloud Functions - Invoke Local
menuText: invoke local
menuOrder: 7
description: Emulate an invocation of your Google Cloud function locally using the Serverless Framework
layout: Doc
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/google/cli-reference/invoke-local)

<!-- DOCS-SITE-LINK:END -->

# Google - Invoke Local

Invokes deployed function locally. It allows to send event data to the function, read logs and display other important information of the function invocation.

```bash
serverless invoke local -f functionName
```

## Options

- `--function` or `-f` The name of the function in your service that you want to invoke. **Required**.
- `--data` or `-d` Data you want to pass into the function
- `--path` or `-p` Path to JSON or YAML file holding input data. This path is relative to the root directory of the service.
- `--raw` Pass data as a raw string even if it is JSON. If not set, JSON data are parsed and passed as an object.
- `--contextPath` or `-x`, The path to a json file holding input context to be passed to the invoked function. This path is relative to the root directory of the service.
- `--context` or `-c`, String data to be passed as a context to your function. Same like with `--data`, context included in `--contextPath` will overwrite the context you passed with `--context` flag.
- `--env` or `-e` String representing an environment variable to set when invoking your function, in the form `<name>=<value>`. Can be repeated for more than one environment variable.

> Keep in mind that if you pass both `--path` and `--data`, the data included in the `--path` file will overwrite the data you passed with the `--data` flag.

## Examples

### Local function invocation

```bash
serverless invoke local -f functionName
```

### Local function invocation with data

```bash
serverless invoke local -f functionName -d '{ "data": "hello world" }'
```

### Local function invocation with data passing

```bash
serverless invoke local -f functionName -p path/to/file.json
# OR
serverless invoke local -f functionName -p path/to/file.yaml
```

### Local function invocation, setting environment variables

````bash
serverless invoke local -f functionName -e VAR1=value1
# Or more than one variable
serverless invoke local -f functionName -e VAR1=value1 -e VAR2=value2

## Event vs Http

Cloud functions can be triggered by events or http. Those two types of functions have different signatures.
The data you can provide to a local invocation of a function are also different according to their types.

### Event

The signature of the function is
```js
function eventHandler (event, context, callback) {}
```

The data provided through `data` or loaded through `path` will be in `event`.

The data provided through `context` or loaded through `contextPath` will be in `context`.

### Http

The function use express, its signature is

```js
function httpHandler(req, res) {}
```

The data provided through `data` or loaded through `path` will be merged in `req`.

The data provided through `context` or loaded through `contextPath` will be ignored.

Example:

```json
# mocks/postHelloWorld.json
{
  "method": "POST",
  "headers": {
    "content-type": "application/json"
  },
  "body": {
    "message": "Hello World"
  }
}
```

```bash
serverless invoke local -f httpHandler -p mocks/postHelloWorld.json
```
will invoke `httpHandler` with an express request with the provided headers and body

## Resource permissions

When a cloud function is executed in the cloud, the Google SDK will implicitly resolve its [runtime service account](https://cloud.google.com/functions/docs/concepts/iam#runtime_service_accounts).
which will be used to interact with the other GCP services.

When you locally invoke a cloud function, the Google SDK will also implicitly resolve a service account or a user.
Make sure you are authenticated with your user or a service account following the [authentication procedure](https://www.serverless.com/framework/docs/providers/google/guide/credentials/)
and that the authenticated account have the necessary rights to access to all services you want your function to access

````
