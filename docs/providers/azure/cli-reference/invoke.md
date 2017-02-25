<!--
title: Serverless Framework Commands - Azure Functions - Invoke
menuText: Invoke
menuOrder: 7
description: Invoke an Azure Functions Function using the Serverless Framework
layout: Doc
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->
### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/azure/cli-reference/invoke)
<!-- DOCS-SITE-LINK:END -->

# Azure - Invoke

Invokes deployed function. It allows to send event data to the function, read logs and display other important information of the function invocation.

```bash
serverless invoke --function functionName
```

## Options
- `--function` or `-f` The name of the function in your service that you want to invoke. **Required**.
- `--path` or `-p` The path to a json file with input data to be passed to the invoked function. This path is relative to the root directory of the service.

## Provided lifecycle events
- `invoke:invoke`

## Examples

### Azure Functions

```bash
serverless invoke --function functionName
```

This example will invoke your deployed function on the configured platform
endpoint. This will output the result of the invocation in your terminal.

#### Function invocation with data

```bash
serverless invoke --function functionName --data '{"name": "Bernie"}'
```

#### Function invocation with data from standard input

```bash
node dataGenerator.js | serverless invoke --function functionName
```

#### Function invocation with data passing

```bash
serverless invoke --function functionName --path lib/data.json
```

This example will pass the json data in the `lib/data.json` file (relative to the root of the service) while invoking
the specified/deployed function.
