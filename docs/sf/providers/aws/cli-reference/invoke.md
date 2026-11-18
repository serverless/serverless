<!--
title: serverless invoke
description: Invoke a deployed Lambda function, durable function, AgentCore agent, sandbox or web app from the terminal and print its response.
short_title: invoke
keywords:
  [
    'serverless invoke',
    'Serverless Framework CLI',
    'invoke Lambda function',
    'Lambda durable functions',
    'test deployed function',
  ]
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/aws/cli-reference/invoke)

<!-- DOCS-SITE-LINK:END -->

# serverless invoke

`serverless invoke` calls a deployed AWS Lambda function with the event you pass and prints its response. The function runs in AWS with its deployed code and IAM role, so use `serverless invoke` to test a stage after [`serverless deploy`](./deploy.md); to run the code on your machine without deploying, use [`serverless invoke local`](./invoke-local.md), and to route a stage's real events to your working copy, use [`serverless dev`](./dev.md). The same command also invokes [AgentCore Runtime agents](../guide/agents/README.md), [sandboxes](../guide/sandboxes.md) and [web apps](../guide/web-apps.md).

```bash
serverless invoke --function hello --data '{"name":"Ada"}'
```

The command prints the function's response on standard output, formatted as JSON:

```text
{
    "statusCode": 200,
    "body": "Hello, Ada"
}
```

## Options

`serverless invoke --function` accepts these options:

| Option                     | Alias | Value                                         | Default                                                               | Required | Description                                                                                                                                 |
| -------------------------- | ----- | --------------------------------------------- | --------------------------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `--function`               | `-f`  | string                                        |                                                                       | Yes      | Function to invoke, as named under `functions` in `serverless.yml`. One of `--function`, `--agent`, `--sandbox` or `--web-app` is required. |
| `--data`                   | `-d`  | string                                        | Standard input                                                        | No       | Event to send. JSON is parsed into an object unless `--raw` is set.                                                                         |
| `--path`                   | `-p`  | file path                                     |                                                                       | No       | JSON or YAML file holding the event, relative to the service directory. Ignored when `--data` is set.                                       |
| `--raw`                    |       | boolean                                       | `false`                                                               | No       | Send `--data` and `--context` as strings even when they are valid JSON.                                                                     |
| `--context`                |       | string                                        |                                                                       | No       | Client context to send with the invocation.                                                                                                 |
| `--contextPath`            |       | file path                                     |                                                                       | No       | JSON or YAML file holding the client context. Ignored when `--context` is set.                                                              |
| `--type`                   | `-t`  | `RequestResponse`, `Event` or `DryRun`        | `RequestResponse`                                                     | No       | Invocation type. See [Invocation types and logs](#invocation-types-and-logs).                                                               |
| `--log`                    | `-l`  | boolean                                       | `false`                                                               | No       | With `RequestResponse`, also print the last 4 KB of the invocation's log.                                                                   |
| `--qualifier`              | `-q`  | version number or alias name                  | The deploy's alias for a durable function, otherwise none (`$LATEST`) | No       | Version or alias to invoke.                                                                                                                 |
| `--tenant-id`              |       | string                                        |                                                                       | No       | Tenant ID for a function with tenant isolation.                                                                                             |
| `--durable-execution-name` |       | 1 to 64 characters: letters, digits, `-`, `_` |                                                                       | No       | Name of a durable execution; makes the invocation idempotent. See [Durable functions](#durable-functions).                                  |
| `--json`                   |       | boolean                                       | `false`                                                               | No       | Print one JSON object on standard output and every message on standard error.                                                               |
| `--stage`                  | `-s`  | string                                        | `provider.stage`, else `dev`                                          | No       | Stage of the deployed function.                                                                                                             |
| `--region`                 | `-r`  | string                                        | `provider.region`, else `us-east-1`                                   | No       | AWS Region of the deployed function.                                                                                                        |
| `--aws-profile`            |       | string                                        | `provider.profile`                                                    | No       | AWS profile whose credentials the command uses.                                                                                             |
| `--config`                 | `-c`  | file path                                     | `serverless.yml`                                                      | No       | Service configuration file to use.                                                                                                          |

The command also accepts the options every command takes: `--param="key=value"` (repeatable), `--org`, `--app`, `--verbose`, `--debug` and `--help` (`-h`). `--header` is not available with `--function`; the options for agents, sandboxes and web apps are in their own sections.

## Event data and client context

`serverless invoke` takes the event from the first of these that is set:

1. `--data`.
2. `--path`: a `.json` or `.yml`/`.yaml` file is parsed; any other file is read as text.
3. Standard input, when standard input is not a terminal.

Unless `--raw` is set, text that is valid JSON is parsed and sent as a JSON value, and other text is sent as a JSON string. The value parsed from a `.json`, `.yml` or `.yaml` file goes through that step again: a string that is valid JSON, or an array with one element whose text is valid JSON, is replaced by that JSON value. A `.json` file containing `[1]` sends `1`, while `--data '[1]'` sends `[1]`. A parsed value of `false`, `0`, `null` or `""` is sent as `{}`. Without any of the three, the function receives `{}`.

The client context works the same way: `--context` takes precedence over `--contextPath`, and the Framework sends the value base64-encoded in the request's client context.

To test a function behind an `http` or `httpApi` event, pass an event in the [API Gateway Lambda proxy input format](https://docs.aws.amazon.com/apigateway/latest/developerguide/set-up-lambda-proxy-integrations.html#api-gateway-simple-proxy-for-lambda-input-format), for example in `lib/data.json`:

```json
{
  "resource": "/",
  "path": "/",
  "httpMethod": "GET"
}
```

## Invocation types and logs

The `serverless invoke` `--type` option sets the Lambda invocation type:

- `RequestResponse` (default): waits for the function to finish and prints its response.
- `Event`: queues the event for asynchronous processing and returns without the function's response.
- `DryRun`: checks the parameters and your permission to invoke the function, without running it.

With `RequestResponse`, `--log` prints the last 4 KB of the invocation's log after the response, with the `START` line first and the `REPORT` line last. The [Lambda `Invoke` API reference](https://docs.aws.amazon.com/lambda/latest/api/API_Invoke.html) describes the types and the log tail.

With `--json`, standard output holds only one JSON object, on one line, with these keys in this order; a value the response does not carry is `null`:

| Key                   | Value                                                                                  |
| --------------------- | -------------------------------------------------------------------------------------- |
| `statusCode`          | HTTP status code of the `Invoke` call: `200` for `RequestResponse`, `202` for `Event`. |
| `qualifier`           | Version or alias the command invoked.                                                  |
| `executedVersion`     | Version that ran.                                                                      |
| `durableExecutionArn` | ARN of the durable execution, for a durable function.                                  |
| `functionError`       | Lambda's function error type, such as `Unhandled`.                                     |
| `payload`             | The response, parsed as JSON, or its text when it is not JSON.                         |
| `log`                 | The decoded log tail, with `--log`.                                                    |

## Durable functions

`serverless invoke` sends a [durable function](../guide/functions.md#durable-functions)'s invocation to the alias its deploy publishes, so it needs no `--qualifier`. The alias is `durable`, or the SnapStart or provisioned-concurrency alias when the function uses one. With `--type Event` the command starts an execution and prints its ARN on standard error:

```text
$ serverless invoke --function myDurableFunction --type Event --durable-execution-name order-1042

Durable execution started: arn:aws:lambda:us-east-1:123456789012:function:my-service-dev-myDurableFunction:4/durable-execution/order-1042/2f6c0d3e-8a41-4b7e-9c55-1d0e6a7b3f92
```

A synchronous invoke (the default `RequestResponse` type) waits for the execution to finish, prints `Durable execution: <arn>` on standard error, and prints the result on standard output. Lambda runs a durable function synchronously only when its `durableConfig.executionTimeout` is 900 seconds or less; for a longer timeout, the command stops with an error that suggests `--type Event`.

Add `--json` to read the ARN and the result from one JSON object on standard output (printed on one line; formatted here for reading):

```bash
serverless invoke --function myDurableFunction --type Event --durable-execution-name order-1042 --json
```

```json
{
  "statusCode": 202,
  "qualifier": "durable",
  "executedVersion": null,
  "durableExecutionArn": "arn:aws:lambda:us-east-1:123456789012:function:my-service-dev-myDurableFunction:4/durable-execution/order-1042/2f6c0d3e-8a41-4b7e-9c55-1d0e6a7b3f92",
  "functionError": null,
  "payload": null,
  "log": null
}
```

`--durable-execution-name` makes the invocation idempotent. With `--type Event`, a name that already exists returns that execution's ARN, even when the payload differs; the new payload is not used. A synchronous invoke with the same name and a different payload returns a `DurableExecutionAlreadyStartedException` error.

When the stage has not been deployed with the function's alias, the durable invoke stops with Lambda's `ResourceNotFoundException` and the advice to run `serverless deploy` or pass `--qualifier`.

## Invoke an agent

To invoke an [AgentCore Runtime agent](../guide/agents/README.md), use `serverless invoke --agent` instead of `--function`. The command reads the agent's runtime ARN from the deployed stack's outputs and streams the agent's response to standard output.

```bash
serverless invoke --agent myAgent --data '{"prompt": "Hello!"}'
```

| Option         | Alias | Value                  | Default        | Required | Description                                                                                      |
| -------------- | ----- | ---------------------- | -------------- | -------- | ------------------------------------------------------------------------------------------------ |
| `--agent`      | `-a`  | string                 |                | Yes      | Agent to invoke, as named under `ai.agents` in `serverless.yml`.                                 |
| `--data`       | `-d`  | string                 | Standard input | No       | Payload. A JSON object is sent as it is; any other text is sent as `{"prompt": "<text>"}`.       |
| `--path`       | `-p`  | file path              |                | No       | JSON or YAML file holding the payload, relative to the service directory. Ignored with `--data`. |
| `--session-id` |       | at least 33 characters |                | No       | Runtime session ID that keeps a multi-turn conversation together.                                |

`--agent` cannot be combined with `--function`, `--sandbox` or `--web-app`, and `--header` and `--json` are not available with it. The caller needs `bedrock-agentcore:InvokeAgentRuntime`.

## Invoke a sandbox

To send one HTTP request to a [sandbox (AWS Lambda MicroVM)](../guide/sandboxes.md), use `serverless invoke --sandbox`. The command starts a fresh MicroVM from the sandbox's image, sends the request through the AWS proxy, prints the response body on standard output, and terminates the MicroVM.

```bash
serverless invoke --sandbox mySandbox --path /health
```

| Option      | Alias | Value           | Default | Required | Description                                                                                                     |
| ----------- | ----- | --------------- | ------- | -------- | --------------------------------------------------------------------------------------------------------------- |
| `--sandbox` |       | string          |         | Yes      | Sandbox to invoke, as named under `sandboxes` in `serverless.yml`.                                              |
| `--path`    | `-p`  | string          | `/`     | No       | HTTP request path.                                                                                              |
| `--method`  |       | string          | `GET`   | No       | HTTP method.                                                                                                    |
| `--header`  |       | `'Name: value'` |         | No       | Request header (repeatable). Printable ASCII only; cannot set `Host`, `X-Aws-Proxy-Auth` or `X-Aws-Proxy-Port`. |
| `--data`    | `-d`  | string          |         | No       | Request body; not sent with `GET`.                                                                              |
| `--port`    |       | string          | `8080`  | No       | Container port to send the request to.                                                                          |

`--sandbox` cannot be combined with `--function`, `--agent` or `--web-app`. The function and agent options (`--qualifier`, `--type`, `--raw`, `--context`, `--contextPath`, `--tenant-id`, `--durable-execution-name`, `--session-id`, `--log` and `--json`) stop the command with an error, for example `✖ --qualifier is not available with --sandbox.` A response with status 400 or above is printed, and then the command exits with `Sandbox '<name>' returned HTTP <status>`.

The caller needs `lambda:RunMicrovm`, `lambda:GetMicrovm`, `lambda:CreateMicrovmAuthToken`, `lambda:TerminateMicrovm`, `iam:PassRole` and `lambda:PassNetworkConnector`. See [Invoking a sandbox](../guide/sandboxes.md#invoking-a-sandbox) in the sandboxes guide.

## Invoke a web app

To send one HTTP request to a [web app (AWS Lambda Web Function)](../guide/web-apps.md), use `serverless invoke --web-app`. The command prints the status line and headers on standard error, then the body on standard output as it arrives, so piping the command to `jq` or a file passes the body alone. A redirect is printed, not followed. Requests to an `aws_iam` endpoint, or to a web app served on a custom domain, are signed with your AWS credentials.

```bash
serverless invoke --web-app api --path /health
```

| Option      | Alias | Value           | Default | Required | Description                                                                                                                                                                                                    |
| ----------- | ----- | --------------- | ------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--web-app` |       | string          |         | Yes      | Web app to invoke, as named under `webApps` in `serverless.yml`.                                                                                                                                               |
| `--path`    | `-p`  | string          | `/`     | No       | HTTP request path, with an optional query string.                                                                                                                                                              |
| `--method`  |       | string          | `GET`   | No       | HTTP method.                                                                                                                                                                                                   |
| `--header`  |       | `'Name: value'` |         | No       | Request header (repeatable). A signed request is signed over these headers too. Cannot set `Host`, nor, for a signed request, `Authorization`, `X-Amz-Date`, `X-Amz-Security-Token` or `X-Amz-Content-Sha256`. |
| `--data`    | `-d`  | string          |         | No       | Request body; not sent with `GET` or `HEAD`, so set `--method` with it.                                                                                                                                        |
| `--log`     | `-l`  | boolean         | `false` | No       | After the response, print the request's log lines: JSON lines that carry its request ID. Waits up to 30 seconds, then points to `serverless logs --web-app <name>`.                                            |

`--web-app` cannot be combined with `--function`, `--agent` or `--sandbox`. The function, agent and sandbox options (`--qualifier`, `--type`, `--raw`, `--context`, `--contextPath`, `--tenant-id`, `--durable-execution-name`, `--session-id`, `--port` and `--json`) stop the command with an error, for example `✖ --qualifier is not available with --web-app.`

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

The caller needs `lambda:InvokeWebFunctionEndpoint` for an `aws_iam` or custom-domain web app, and `logs:FilterLogEvents` on the web app's `/aws/lambda/web/<function-name>.local` log group for `--log`. See [Invoking a web app](../guide/web-apps.md#invoking-a-web-app) in the web apps guide.

## Side effects and CI use

- `serverless invoke --function` runs the deployed function in AWS, so every run repeats the function's side effects; `--type DryRun` checks the call without running the code. The command changes nothing in the service's configuration or stack. The caller needs `lambda:InvokeFunction` on the function.
- The command does not prompt. Without `--data` or `--path`, it reads the event from standard input whenever standard input is not a terminal, so in CI pass `--data` or `--path`, or redirect standard input from `/dev/null`.
- The exit code is non-zero when the invocation reports a function error (`Invoked function failed`, after the response is printed), when a sandbox or web app answers with status 400 or above, or when Lambda returns an error for the call.
- When a [Dev Mode](./dev.md) session in the same service directory ran the call on your machine, the command also prints a line naming the request on standard error; standard output and the exit code do not change.

## Provided lifecycle events

- `invoke:invoke`

## Examples

### Invoke a function in a specific stage and region

```bash
serverless invoke --function hello --stage prod --region eu-central-1
```

### Invoke a function with an event file

```bash
serverless invoke --function hello --path lib/data.json
```

### Invoke a function with data from standard input

```bash
node dataGenerator.js | serverless invoke --function hello
```

### Invoke a function and print its log

```bash
serverless invoke --function hello --log
```

### Invoke a function with a client context file

```bash
serverless invoke --function hello --contextPath lib/context.json
```

### Invoke a function asynchronously

```bash
serverless invoke --function hello --type Event
```

### Invoke a specific version or alias

```bash
serverless invoke --function hello --qualifier 3
```

### Invoke a function for a tenant

```bash
serverless invoke --function hello --tenant-id tenant-123
```

## Related commands

- [`serverless invoke local`](./invoke-local.md) runs a function's code on your machine without deploying.
- [`serverless logs`](./logs.md) prints a function's CloudWatch logs.
- [`serverless dev`](./dev.md) runs a stage's real invocations on your working copy.
