<!--
title: serverless invoke local
description: Run a Lambda function's handler on your machine with a test event and emulated environment, without deploying, using serverless invoke local.
short_title: invoke local
keywords:
  [
    'serverless invoke local',
    'Serverless Framework CLI',
    'run Lambda locally',
    'local Lambda testing',
    'invoke local Docker',
  ]
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/aws/cli-reference/invoke-local)

<!-- DOCS-SITE-LINK:END -->

# serverless invoke local

`serverless invoke local` runs one function's handler on your machine with the event you pass, in an emulation of the Lambda environment: Lambda's environment variables, the function's `environment`, and a mock `context`. Nothing is deployed. Use it to test code before [`serverless deploy`](./deploy.md); to call the deployed function in AWS, use [`serverless invoke`](./invoke.md), and to run a stage's real events on your working copy, use [`serverless dev`](./dev.md).

```bash
serverless invoke local --function hello --data '{"name":"Ada"}'
```

For a Node.js function, the command prints the handler's return value as JSON:

```text
{
    "statusCode": 200,
    "body": "Hello, Ada"
}
```

The emulation is not exact: the function runs with your AWS credentials instead of its IAM role, and, without `--docker`, on the language runtime installed on your machine.

## Options

`serverless invoke local` accepts these options:

| Option          | Alias | Value        | Default                             | Required | Description                                                                                                                          |
| --------------- | ----- | ------------ | ----------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `--function`    | `-f`  | string       |                                     | Yes      | Function to run, as named under `functions` in `serverless.yml`.                                                                     |
| `--data`        | `-d`  | string       | Standard input                      | No       | Event to pass. JSON is parsed into an object unless `--raw` is set.                                                                  |
| `--path`        | `-p`  | file path    |                                     | No       | JSON or YAML file holding the event, relative to the service directory or absolute. Ignored when `--data` is set.                    |
| `--raw`         |       | boolean      | `false`                             | No       | Pass `--data` and `--context` as strings even when they are valid JSON.                                                              |
| `--context`     |       | string       |                                     | No       | Context to pass. See [Mock context](#mock-context). No short alias: `-c` is `--config`.                                              |
| `--contextPath` | `-x`  | file path    |                                     | No       | JSON or YAML file holding the context, relative to the service directory or absolute. Takes precedence over `--context`.             |
| `--env`         | `-e`  | `NAME=value` |                                     | No       | Environment variable to set for the function (repeatable). Overrides every other source.                                             |
| `--docker`      |       | boolean      | `false`                             | No       | Run the function in Docker even when its runtime can run on your machine. See [Run a function in Docker](#run-a-function-in-docker). |
| `--docker-arg`  |       | string       |                                     | No       | One extra `docker run` argument and its value, such as `'-p 9229:9229'`. The option takes one value.                                 |
| `--stage`       | `-s`  | string       | `provider.stage`, else `dev`        | No       | Stage whose configuration to use.                                                                                                    |
| `--region`      | `-r`  | string       | `provider.region`, else `us-east-1` | No       | AWS Region set as `AWS_REGION` and used to resolve `Ref` and `Fn::ImportValue`.                                                      |
| `--aws-profile` |       | string       | `provider.profile`                  | No       | AWS profile whose credentials the function receives.                                                                                 |
| `--config`      | `-c`  | file path    | `serverless.yml`                    | No       | Service configuration file to use.                                                                                                   |

The command also accepts the options every command takes: `--param="key=value"` (repeatable), `--org`, `--app`, `--verbose`, `--debug` and `--help` (`-h`).

## How each runtime runs

`serverless invoke local` picks how to run the function from its `runtime`:

| Runtime                                                                                           | How the function runs                                                                                                                                                   |
| ------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `nodejs*`                                                                                         | Inside the CLI's own Node.js process. The handler module is imported, trying `.js`, `.mjs` and `.cjs` when the path has no extension.                                   |
| `python3.7` to `python3.15`                                                                       | Under the `python3` on your `PATH` (`python` on Windows), with the active virtual environment's `bin` first.                                                            |
| `java8`, `java8.al2023`, `java11`, `java11.al2023`, `java17`, `java17.al2023`, `java21`, `java25` | Under `java`, through a bridge that Maven (`mvn`) builds on first use. The service-level `package.artifact` must exist; a function's own `package.artifact` isn't used. |
| `ruby2.7`, `ruby3.2`, `ruby3.3`, `ruby3.4`, `ruby4.0`                                             | Under the `ruby` on your `PATH`.                                                                                                                                        |
| Any other runtime                                                                                 | In Docker.                                                                                                                                                              |

On your machine, the function runs on the installed interpreter, not the version its `runtime` names (for `nodejs*` functions, the Node.js version that runs the CLI): a function declared `runtime: python3.13` runs on whatever `python3` resolves to, and the difference is not reported. To run on the declared runtime, add `--docker`.

When the service uses the Framework's built-in esbuild bundling (TypeScript handlers, or `build.esbuild`; see [Building](../guide/building.md)), `serverless invoke local` bundles the function before it runs, as `serverless deploy` would. With `--docker`, the command also runs `serverless package`.

A function deployed from a container `image` stops the command with `Local invocation of lambdas pointing AWS ECR images is not supported`.

## Run a function in Docker

With `--docker`, or for a runtime the preceding table doesn't list, `serverless invoke local`:

1. Runs [`serverless package`](./package.md) and extracts the package into `.serverless/invokeLocal/artifact`.
2. Builds an image named `sls-docker-<runtime>` from the AWS base image for the runtime (`public.ecr.aws/lambda/<language>:<version>`, for Node.js, Python, Java, Ruby, .NET and `provided` runtimes), with the function's layers copied to `/opt`. Layers referenced by ARN are downloaded and cached.
3. Starts the container with the package mounted read-only at `/var/task`, sends the event to it, and prints the container's log and the function's response.

Docker must be installed and running; otherwise the command stops with `Please start the Docker daemon to use the invoke local Docker integration.` On macOS and Windows, install [Docker Desktop](https://www.docker.com/products/docker-desktop); on Linux, install [Docker Engine](https://docs.docker.com/engine/install/) and add your user to the `docker` group so Docker runs without `sudo`.

In Docker, the function receives `AWS_REGION`, `AWS_DEFAULT_REGION`, `AWS_LAMBDA_FUNCTION_NAME`, `AWS_LAMBDA_FUNCTION_MEMORY_SIZE`, `AWS_LAMBDA_LOG_GROUP_NAME`, your AWS credentials, the function's `environment` and the `--env` values. The command exits with code 1 when the function returns an error.

## Event data

`serverless invoke local` takes the event from the first of these that is set:

1. `--data`.
2. `--path`: a `.json` or `.yml`/`.yaml` file is parsed; any other file is read as text.
3. Standard input, when standard input is not a terminal.

Unless `--raw` is set, text that is valid JSON is parsed and passed as an object; other text is passed as a string. To test a function behind an `http` or `httpApi` event, pass an event in the [API Gateway Lambda proxy input format](https://docs.aws.amazon.com/apigateway/latest/developerguide/set-up-lambda-proxy-integrations.html#api-gateway-simple-proxy-for-lambda-input-format), for example in `lib/data.json`:

```json
{
  "resource": "/",
  "path": "/",
  "httpMethod": "GET"
}
```

## Mock context

`serverless invoke local` passes the handler a mock `context`. The function's `timeout` (default `6` seconds) drives the remaining-time method:

| Runtime | Mock context                                                                                                                                                                               | `--context` and `--contextPath`                                                                                                                                                                                                                                                                                                 |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Node.js | `awsRequestId` (a random UUID), `functionName`, `functionVersion`, `logGroupName`, `logStreamName`, `memoryLimitInMB`, `getRemainingTimeInMillis()`, `succeed()`, `fail()`, `done()`       | Replace the whole mock context.                                                                                                                                                                                                                                                                                                 |
| Python  | `function_name`, `function_version`, `invoked_function_arn`, `memory_limit_in_mb`, `aws_request_id`, `log_group_name`, `log_stream_name` (all read-only), `get_remaining_time_in_millis()` | Set `name`, `version` and `timeout`, or add new attributes. Setting a read-only attribute stops the invocation with an `AttributeError`.                                                                                                                                                                                        |
| Ruby    | `function_name`, `function_version`, `aws_request_id`, `invoked_function_arn`, `log_group_name`, `log_stream_name`, `memory_limit_in_mb`, `deadline_ms`, `get_remaining_time_in_millis`    | Set `function_name`, `version`, `timeout` and `memory_limit_in_mb`. Other keys are stored without a reader method, so `context.<key>` raises `NoMethodError` in the handler. `aws_request_id`, `invoked_function_arn`, `log_group_name` and `log_stream_name` are computed after the overrides, so values for them are ignored. |
| Java    | `name`, `version`, `logGroupName`, `timeout`                                                                                                                                               | Replace the whole mock context.                                                                                                                                                                                                                                                                                                 |

Without `--raw`, `serverless invoke local` parses the `--context` text as JSON only when the event is JSON text from `--data` or standard input, or when there is no event. With an event file from `--path`, or a `--data` value that isn't JSON, the `--context` text isn't parsed: a Node.js handler receives it as a string. To pass a context object with an event file, put the context in a file and pass it with `--contextPath`:

```bash
serverless invoke local --function hello --path event.json --contextPath context.json
```

## Environment variables

`serverless invoke local` sets these environment variables for a function that runs on your machine, each source overriding the ones before it:

1. Lambda's variables, with local values: `LANG`, `LD_LIBRARY_PATH`, `LAMBDA_TASK_ROOT`, `LAMBDA_RUNTIME_DIR`, `AWS_REGION`, `AWS_DEFAULT_REGION`, `AWS_LAMBDA_LOG_GROUP_NAME`, `AWS_LAMBDA_LOG_STREAM_NAME`, `AWS_LAMBDA_FUNCTION_NAME`, `AWS_LAMBDA_FUNCTION_MEMORY_SIZE` (the function's `memorySize`, else `provider.memorySize`, else `1024`), `AWS_LAMBDA_FUNCTION_VERSION` (`$LATEST`) and `NODE_PATH`.
2. The CLI's AWS credentials: `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_SESSION_TOKEN`, and `AWS_PROFILE` when a profile is set with `--aws-profile` or `provider.profile`.
3. `provider.environment`, then the function's `environment`.
4. `IS_LOCAL` set to `true`, so code can tell a local run apart.
5. The `--env` values.

`IS_LOCAL` and the `--env` values are set after `serverless.yml` is resolved, so `${env:IS_LOCAL}` and other `${env:…}` variables in `serverless.yml` don't see them.

In `environment`, the `Ref` and `Fn::ImportValue` [CloudFormation intrinsic functions](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/intrinsic-function-reference.html) are resolved against the deployed stack and the Region's exports. Any other intrinsic function stops the command with `Could not resolve "<name>" environment variable: Unsupported environment variable format`. The short forms `!Ref` and `!ImportValue` work the same way. `Ref` reads the stack of the `--stage` and `--region` the command runs with, so that stack must be deployed; otherwise the command stops with `Could not resolve "<name>" environment variable`. The functions are resolved before the `--env` values apply, so `--env` doesn't avoid that error: deploy the stack, or replace the intrinsic function with a `${…}` variable for local runs. Framework variables such as `${sls:stage}` are resolved with the rest of `serverless.yml`. In this example, `EXT_TABLE_NAME` gets the value of the `exported-tableName` export and `REF_TABLE_NAME` the physical ID of `myTable`:

```yaml
functions:
  hello:
    handler: handler.hello
    environment:
      EXT_TABLE_NAME:
        Fn::ImportValue: exported-tableName
      REF_TABLE_NAME:
        Ref: myTable
```

## AWS credentials and permissions

A deployed function calls AWS with its execution role, which holds the permissions from `provider.iam.role.statements`. Under `serverless invoke local` that role isn't available: the function's AWS SDK calls use the credentials the CLI uses, passed as `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` and `AWS_SESSION_TOKEN`. Those credentials usually grant different permissions than the role, so a call that succeeds locally can be denied in AWS, and the reverse. The [AWS SDK for JavaScript credentials guide](https://docs.aws.amazon.com/sdk-for-javascript/v3/developer-guide/setting-credentials-node.html) explains how the SDK picks them up.

## Side effects and CI use

- `serverless invoke local` creates and changes nothing in AWS, but the function's own AWS calls act on real resources with your credentials. Resolving `Ref` and `Fn::ImportValue` reads the deployed stack and the Region's exports.
- With `--docker`, the command writes the package and the extracted artifact under `.serverless/`, and builds a local Docker image.
- The command does not prompt. Without `--data` or `--path`, it reads the event from standard input whenever standard input is not a terminal, so in CI pass `--data` or `--path`, or redirect standard input from `/dev/null`.
- For a Node.js function that throws or returns an error, the command prints `errorMessage`, `errorType` and `stackTrace` as JSON and exits with code 1.

## Provided lifecycle events

- `invoke:local:loadEnvVars`
- `invoke:local:invoke`

## Examples

### Run a function with data

```bash
serverless invoke local --function hello --data '{"a":"bar"}'
```

### Pass data as a raw string

```bash
serverless invoke local --function hello --raw --data "hello world"
```

### Run a function with data from standard input

```bash
node dataGenerator.js | serverless invoke local --function hello
```

### Run a function with an event file

```bash
serverless invoke local --function hello --path lib/data.json
```

### Override the timeout in a Python function's context

```bash
serverless invoke local --function report --context '{"timeout":120}'
```

### Run a function with a context file

```bash
serverless invoke local --function hello --contextPath lib/context.json
```

### Set environment variables

```bash
serverless invoke local --function hello --env VAR1=value1 --env VAR2=value2
```

### Run a function in Docker with a debugger port

```bash
serverless invoke local --function hello --docker --docker-arg '-p 9229:9229'
```

## Related commands

- [`serverless invoke`](./invoke.md) calls the deployed function in AWS.
- [`serverless dev`](./dev.md) runs a stage's real invocations on your working copy.
- [`serverless package`](./package.md) builds the package that `--docker` runs.
