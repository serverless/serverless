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

```bash
serverless invoke local -f functionName -e VAR1=value1

# Or more than one variable

serverless invoke local -f functionName -e VAR1=value1 -e VAR2=value2
```
