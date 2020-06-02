<!--
title: Serverless Framework Commands - Azure Functions - Invoke
menuText: invoke
menuOrder: 4
description: Invoke an Azure Functions Function using the Serverless Framework
layout: Doc
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/azure/cli-reference/invoke)

<!-- DOCS-SITE-LINK:END -->

# Azure - Invoke

Invokes deployed function. It allows the user to send event data to the function and display the results of the function invocation.

```bash
serverless invoke --function functionName
```

## Options

- `--resourceGroup` or `-g` - Specify the resource group name
- `--stage` or `-s` - Specify stage name
- `--region` or `-r` - Specify region name
- `--subscriptionId` or `-i` - Specify subscription ID
- `--config` or `-c` Name of your configuration file, if other than `serverless.yml|.yaml|.js|.json`.
- `--function` or `-f` The name of the function in your service that you want to invoke. **Required**.
- `--path` or `-p` The path to a json file with input data to be passed to the invoked function. This path is relative to the root directory of the service.
- `--data` or `-d` Stringified JSON data to be used as input to the function

You can also run `invoke local` to invoke a locally running function app or `invoke apim` to invoke a function via the configured APIM endpoint.

## Provided lifecycle events

- `invoke:invoke`

## Examples

```bash
# Invoke function directly
serverless invoke --function functionName
```

```bash
# Invoke function running locally
$ serverless invoke local --function functionName
```

```bash
# Invoke function via configured APIM endpoint
$ serverless invoke apim --function functionName
```

This example will invoke your deployed function on the configured platform endpoint. This will output the result of the invocation in your terminal.

#### Function invocation with data

```bash
serverless invoke --function functionName --data '{"name": "Bernie"}'
```

#### Function invocation with data passing

```bash
serverless invoke --function functionName --path data.json
```

This example will pass the json data in the `data.json` file (relative to the
root of the service) while invoking the specified/deployed function.
