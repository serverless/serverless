<!--
title: Serverless Framework Commands - AWS Lambda - Invoke
description: Invoke an AWS Lambda Function using the Serverless Framework.
short_title: Commands - Invoke
keywords:
  [
    'Serverless',
    'Framework',
    'AWS',
    'Lambda',
    'Invoke',
    'function invocation',
    'AWS Lambda function',
    'event data',
    'logging',
  ]
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/aws/cli-reference/invoke)

<!-- DOCS-SITE-LINK:END -->

# AWS - Invoke

Invokes a deployed function. You can send event data, read logs and display other important information of the function invocation.

```bash
serverless invoke [local] --function functionName
```

**Note:** Please refer to [this guide](https://docs.aws.amazon.com/apigateway/latest/developerguide/api-gateway-set-up-simple-proxy.html#api-gateway-simple-proxy-for-lambda-input-format) for event data passing when your function uses the `http` event with a Lambda Proxy integration.

## Options

- `--function` or `-f` The name of the function in your service that you want to invoke. **Required**.
- `--stage` or `-s` The stage in your service you want to invoke your function in.
- `--region` or `-r` The region in your stage that you want to invoke your function in.
- `--aws-profile` The AWS profile you want to use.
- `--qualifier` or `-q` The version number or alias to invoke your function in. Default is `$LATEST`.
- `--data` or `-d` String data to be passed as an event to your function. By default data is read from standard input.
- `--raw` Pass data as a raw string even if it is JSON. If not set, JSON data are parsed and passed as an object.
- `--path` or `-p` The path to a json file with input data to be passed to the invoked function. This path is relative to the root directory of the service.
- `--contextPath`, The path to a json file holding input context to be passed to the invoked function. This path is relative to the root directory of the service.
- `--context` String data to be passed as a context to your function. Same like with `--data`, context included in `--contextPath` will overwrite the context you passed with `--context` flag.
- `--type` or `-t` The type of invocation. Either `RequestResponse`, `Event` or `DryRun`. Default is `RequestResponse`.
- `--log` or `-l` If set to `true` and invocation type is `RequestResponse`, it will output logging data of the invocation. Default is `false`.
- `--tenant-id` The Tenant ID for the invocation.
- `--durable-execution-name` Unique name for durable function execution (enables idempotency, 1-64 alphanumeric chars with hyphens/underscores).

## Invoking a sandbox

For [AWS Lambda MicroVMs (sandboxes)](../guide/sandboxes.md), use `--sandbox` instead of `--function`. The framework starts a fresh MicroVM instance, sends the HTTP request through the AWS proxy, prints the response, and terminates the instance.

```bash
serverless invoke --sandbox <name> [--path /health] [--method POST] [--header 'Name: value'] [--data '{...}'] [--port 8080]
```

- `--sandbox` The sandbox name as defined under `sandboxes` in `serverless.yml`. **Required** (cannot be combined with `--function` or `--agent`).
- `--path` or `-p` HTTP request path. Default `/`.
- `--method` HTTP method. Default `GET`.
- `--header` A request header, as `'Name: value'`. Repeat the flag for more headers. Values must be printable ASCII. It cannot set `Host`, `X-Aws-Proxy-Auth` or `X-Aws-Proxy-Port`, which the Framework sets to reach the sandbox.
- `--data` or `-d` Request body (for non-GET requests).
- `--port` Container port to send the request to. Default `8080`.

The options for invoking a function or an agent (`--qualifier`, `--type`, `--raw`, `--context`, `--contextPath`, `--tenant-id`, `--durable-execution-name`, `--session-id` and `--log`) stop the command with an error, for example `✖ --qualifier is not available with --sandbox.`

See the [sandboxes guide](../guide/sandboxes.md#invoking-a-sandbox) for the caller IAM prerequisites and full details.

## Invoking a web app

For [web apps (AWS Lambda Web Functions)](../guide/web-apps.md), use `--web-app` instead of `--function`. The Framework sends one HTTP request to the web app's endpoint and prints the response: the status line and headers to standard error, then the body to standard output as it arrives, so piping the command to `jq` or a file passes the body alone. A redirect is printed, not followed. Requests to an `aws_iam` endpoint, or to a web app served on a custom domain, are signed with your AWS credentials.

```bash
serverless invoke --web-app <name> [--path /health] [--method POST] [--header 'Name: value'] [--data '{...}'] [--log]
```

- `--web-app` The web app name as defined under `webApps` in `serverless.yml`. **Required** (cannot be combined with `--function`, `--agent` or `--sandbox`).
- `--path` or `-p` HTTP request path. Default `/`.
- `--method` HTTP method. Default `GET`.
- `--header` A request header, as `'Name: value'`. Repeat the flag for more headers, for example `--method POST --header 'Content-Type: application/json' --data '{"a":1}'`. A signed request is signed over these headers too. It cannot set `Host`, nor, for an `aws_iam` or custom-domain web app, `Authorization`, `X-Amz-Date`, `X-Amz-Security-Token` or `X-Amz-Content-Sha256`, which the Framework sets to sign the request.
- `--data` or `-d` Request body. It is not sent with `GET` or `HEAD`, so set `--method` along with it.
- `--log` or `-l` After the response, print the log lines of this request. Waits up to 30 seconds for them, then points to `serverless logs --web-app <name>`. Lines written outside a request (startup code, timers) or with `process.stdout.write` carry no request ID and are not shown.

The options for invoking a function, an agent or a sandbox (`--qualifier`, `--type`, `--raw`, `--context`, `--contextPath`, `--tenant-id`, `--durable-execution-name`, `--session-id` and `--port`) stop the command with an error, for example `✖ --qualifier is not available with --web-app.`

```text
$ serverless invoke --web-app api --path /health

HTTP 200 OK
content-length: 11
content-type: application/json; charset=utf-8
date: Thu, 15 Oct 2026 08:03:43 GMT
etag: W/"b-Ai2R8hgEarLmHKwesT1qcY913ys"
lambda-web-logstream: 2026/10/15/my-web-app-dev-api[rev-t8yf1]cc269a07c59a48d19d554992708bda83
lambda-web-request-id: DFWK6UW3VJPQRADPSKLN2OULWA
x-powered-by: Express

{"ok":true}
```

A response with status 400 or above is printed in full, and then the command exits with code 1 and the error `✖ Web app "api" returned HTTP 404.`.

The caller needs `lambda:InvokeWebFunctionEndpoint` for an `aws_iam` or custom-domain web app, and `logs:FilterLogEvents` on the web app's `/aws/lambda/web/<function-name>.local` log group for `--log`. See the [web apps guide](../guide/web-apps.md#invoking-a-web-app) for details.

## Provided lifecycle events

- `invoke:invoke`

# Invoke Local

Invokes a function locally for testing and logs the output. Keep in mind that we mock the `context` with simple mock data.

```bash
serverless invoke local --function functionName
```

## Options

- `--function` or `-f` The name of the function in your service that you want to invoke locally. **Required**.
- `--path` or `-p` The path to a json file holding input data to be passed to the invoked function as the `event`. This path is relative to the
  root directory of the service.
- `--data` or `-d` String data to be passed as an event to your function. Keep in mind that if you pass both `--path` and `--data`, the data included in the `--path` file will overwrite the data you passed with the `--data` flag.
- `--raw` Pass data as a raw string even if it is JSON. If not set, JSON data are parsed and passed as an object.
- `--contextPath` or `-x`, The path to a json file holding input context to be passed to the invoked function. This path is relative to the root directory of the service.
- `--context` or `-c`, String data to be passed as a context to your function. Same like with `--data`, context included in `--contextPath` will overwrite the context you passed with `--context` flag.

## Examples

### AWS

```bash
serverless invoke --function functionName --stage dev --region us-east-1
```

This example will invoke your deployed function named `functionName` in region `us-east-1` in stage `dev`. This will
output the result of the invocation in your terminal.

#### Function invocation with data

```bash
serverless invoke --function functionName --data "hello world"
```

#### Function invocation with custom context

```bash
serverless invoke --function functionName --context "hello world"
```

#### Function invocation with context passing

```bash
serverless invoke --function functionName --contextPath lib/context.json
```

This example will pass the json context in the `lib/context.json` file (relative to the root of the service) while invoking the specified/deployed function.

#### Function invocation with data from standard input

```bash
node dataGenerator.js | serverless invoke --function functionName
```

#### Function invocation with logging

```bash
serverless invoke --function functionName --log
```

Just like the first example, but will also outputs logging information about your invocation.

#### Function invocation with data passing

```bash
serverless invoke --function functionName --path lib/data.json
```

This example will pass the json data in the `lib/data.json` file (relative to the root of the service) while invoking
the specified/deployed function.

#### Example `data.json`

```json
{
  "resource": "/",
  "path": "/",
  "httpMethod": "GET"
}
```

### Function invocation with Tenant ID

```bash
serverless invoke --function functionName --tenant-id tenant-123
```

### Function invocation with Durable Execution Name

For durable functions, you can provide a unique execution name for idempotency:

```bash
serverless invoke --function myDurableFunction --durable-execution-name my-execution-1
```

If you invoke the function again with the same name, Lambda returns the existing execution result instead of starting a new one.

### Local function invocation with custom context

```bash
serverless invoke local --function functionName --context "hello world"
```

### Local function invocation with context passing

```bash
serverless invoke local --function functionName \
  --contextPath lib/context.json
```

This example will pass the json context in the `lib/context.json` file (relative to the root of the service) while invoking the specified/deployed function.

### Limitations

Currently, `invoke local` only supports the Node.js, Python, Java and Ruby runtimes.

## Resource permissions

Lambda functions assume an _IAM role_ during execution: the framework creates this role, and set all the permission provided in the `iam.role.statements` section of `serverless.yml`.

Unless you explicitly state otherwise, every call to the AWS SDK inside the lambda function is made using this role (a temporary pair of key / secret is generated and set by AWS as environment variables, `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY`).

When you use `serverless invoke local`, the situation is quite different: the role isn't available (the function is executed on your local machine), so unless you set a different user directly in the code (or via a key pair of environment variables), the AWS SDK will use the default profile specified inside you AWS credential configuration file.

Take a look to the official AWS documentation (in this particular instance, for the javascript SDK, but should be similar for all SDKs):

- [https://docs.aws.amazon.com/sdk-for-javascript/v3/developer-guide/setting-credentials-node.html](https://docs.aws.amazon.com/sdk-for-javascript/v3/developer-guide/setting-credentials-node.html)
- [https://docs.aws.amazon.com/sdk-for-javascript/v3/developer-guide/loading-node-credentials-lambda.html](https://docs.aws.amazon.com/sdk-for-javascript/v3/developer-guide/loading-node-credentials-lambda.html)

Whatever approach you decide to implement, **be aware**: the set of permissions might be (and probably is) different, so you won't have an exact simulation of the _real_ IAM policy in place.
