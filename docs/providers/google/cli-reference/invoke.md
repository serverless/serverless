<!--
title: Google Cloud Functions Serverless invoke command
menuText: invoke
menuOrder: 6
description: Invoke an Google Cloud Functions Function using the Serverless Framework
layout: Doc
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/google/cli-reference/invoke)

<!-- DOCS-SITE-LINK:END -->

# Google - Invoke

Invokes a deployed function using a `POST` request. You can send event data, read logs and display other important information of the function invocation.

```bash
serverless invoke --function functionName
```

## Options

- `--function` or `-f` The name of the function in your service that you want to invoke. **Required**.
- `--data` or `-d` Data you want to pass into the function.

## Examples

### Simple function invocation

```bash
serverless invoke --function functionName
```

This example will invoke the deployed function and output the result of the invocation in the terminal.

### Function invocation with data

```bash
serverless invoke --function functionName --data '{"name": "Bernie"}'
```

This example will invoke the function with the provided data and output the result in the terminal.
