<!--
title: Serverless Framework Commands - Knative - Invoke
menuText: invoke
menuOrder: 4
description: Invoke a Knative function using the Serverless Framework
layout: Doc
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/knative/cli-reference/invoke/)

<!-- DOCS-SITE-LINK:END -->

# Knative - Invoke

Invokes the deployed function and display its output on the console.

```bash
serverless invoke --function functionName
```

## Options

- `--function` or `-f` The name of the function in your service that you want to invoke. **Required**.

## Examples

```bash
serverless invoke --function functionName
```

This example will invoke your deployed function named `functionName` and outputs the result of the invocation in your terminal.
