<!--
title: Serverless Framework Commands - Tencent-SCF - Invoke
menuText: invoke
menuOrder: 6
description: Invoke a Tencent-SCF function using the Serverless Framework
layout: Doc
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/tencent/cli-reference/invoke/)

<!-- DOCS-SITE-LINK:END -->

# Tencent-SCF - Invoke

Invokes deployed function. It allows to send event data to the function, read logs and display other important information of the function invocation.

```bash
serverless invoke --function functionName
```

## Options

- `--function` or `-f` The name of the function in your service that you want to invoke. **Required**.
- `--stage` or `-s` The stage in your service you want to invoke your function in.
- `--region` or `-r` The region in your stage that you want to invoke your function in.
- `--data` or `-d` String data to be passed as an event to your function.
- `--path` or `-p` The path to a json file with input data to be passed to the invoked function. This path is relative to the root directory of the service.

## Examples

```bash
serverless invoke --function functionName --stage dev --region ap-guangzhou
```

This example will invoke your deployed function named `functionName` in region `ap-guangzhou` in stage `dev`. This will
output the result of the invocation in your terminal.

#### Function invocation with data

```bash
serverless invoke --function functionName --stage dev --region ap-guangzhou --data "hello world"
```

#### Function invocation with data passing

```bash
serverless invoke --function functionName --stage dev --region ap-guangzhou --path lib/event.json
```

This example will pass the json data in the `lib/event.json` file (relative to the root of the service) while invoking
the specified/deployed function.

Example of `event.json`

```json
{
  "resource": "/",
  "path": "/",
  "httpMethod": "GET"
}
```
