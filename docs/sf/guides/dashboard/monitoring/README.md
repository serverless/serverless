<!--
title: Dashboard Monitoring and Observability
description: Turn on Serverless Framework Dashboard metrics, traces and logs for Lambda functions with stages.observability or an AWS account integration.
short_title: Monitoring
keywords: ['Serverless Framework', 'Dashboard', 'Observability', 'Monitoring', 'Lambda traces', 'Lambda metrics', 'stages observability']
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/guides/dashboard/monitoring)

<!-- DOCS-SITE-LINK:END -->

# Dashboard monitoring and observability

Serverless Framework Dashboard observability collects metrics, traces, logs and errors from AWS Lambda functions in your connected AWS accounts, and alerts on new errors and warnings. Turn it on per service and stage with `stages.<stage>.observability` in `serverless.yml`, or per function in the Dashboard for any function in a connected AWS account, whatever tool deployed it.

To instrument every function of a service in the `prod` stage, set `observability: true` for that stage and deploy:

```yaml
# serverless.yml
org: myorg
app: my-app
service: my-service

provider:
  name: aws
  runtime: nodejs22.x # a runtime with trace support
  region: us-east-1

stages:
  prod:
    observability: true

functions:
  hello:
    handler: handler.hello
```

```bash
serverless deploy --stage prod
```

Trace instrumentation applies to the Node.js and Python runtimes listed in [Supported AWS Lambda runtimes](#supported-aws-lambda-runtimes). After the functions are instrumented and invoked, their data appears on the [Metrics](./metrics.md) and [Traces](./traces.md) pages of the Dashboard.

## Prerequisites

- A Serverless Framework account. The CLI must be signed in with `serverless login`, or have an Access Key in `SERVERLESS_ACCESS_KEY`; a License Key can't use Dashboard features. In CI, use an Access Key of the org named in `serverless.yml`: a key of another org stops the command with `The provided Access Key is not for the Org "myorg". Please provide an Access Key for the "myorg" Org.`
- `org` and `app` set in `serverless.yml`. If the app doesn't exist in the org yet, the Dashboard creates it the first time the CLI runs with that `app` value. See [Dashboard overview and setup](../README.md).
- For the first deploy to an AWS account: AWS credentials that can create a CloudFormation stack with named IAM roles (`CAPABILITY_NAMED_IAM`) in `us-east-1`. The roles and their permissions are in the [IAM role template](https://github.com/serverless/console/blob/main/instrumentation/aws/iam-role-cfn-template.yaml).
- Functions on a [supported runtime](#supported-aws-lambda-runtimes) in a [supported Region](#supported-aws-regions).

## Turn on observability in serverless.yml

The `observability` setting under `stages` turns Dashboard instrumentation on or off for one stage of a service. It applies to every function of the service; there is no per-function setting. A stage's own value takes precedence over the value under `stages.default`:

```yaml
# serverless.yml
org: myorg
app: my-app
service: my-service

stages:
  prod:
    observability: true
  dev:
    observability: true
  default:
    observability: false
```

`stages.<stage>.observability` accepts these values:

| Value                                        | Effect                                                                    |
| -------------------------------------------- | ------------------------------------------------------------------------- |
| `true`, `dashboard` or `provider: dashboard` | Instruments the service's functions for the Dashboard on deploy.          |
| `false`                                      | Removes Dashboard instrumentation from the service's functions on deploy. |
| Not set (and not set under `default`)        | The deploy doesn't change Dashboard instrumentation.                      |

The same setting selects other observability providers; see [observability](../../observability/README.md). Without `app` in `serverless.yml`, `true` or `false` stops the deploy with:

```text
To instrument your service, you must set the "app" property in your config file.
```

### What serverless deploy does with observability turned on

`serverless deploy` (not `serverless deploy function`) runs these steps with the deployment's AWS credentials and Region:

1. Looks up the AWS account of the credentials in the Dashboard org.
2. If the account isn't connected yet, creates the `Serverless-Inc-Role-Stack` CloudFormation stack in `us-east-1` from the Dashboard's template and waits for it, then prints that the integration is almost done and that you will receive an email when it is ready.
3. After the CloudFormation deploy, asks the Dashboard to instrument every function of the service in the deployment's Region, in batches of 50, skipping functions that are already instrumented. It waits up to 3 minutes per batch and lists the functions it couldn't instrument, with the reason. On the deploy that connects the account, instrumentation continues in the background instead.

The steps don't prompt, so they run in CI and for AI agents. Running the deploy again only instruments functions that aren't instrumented yet. If `Serverless-Inc-Role-Stack` already exists in the account but the account is connected to a different org, the CLI prints this warning and doesn't instrument the functions:

```text
The AWS account with the ID "123456789012", already has a Serverless Framework Observability integration into a different Serverless Framework Organization. Serverless Framework Observability will not be successfully set-up due to this. Please remove the other integration from the other AWS account first.
```

## Connect an AWS account in the Dashboard

Connecting an AWS account in the Dashboard lets you instrument any Lambda function in it, including functions deployed with other tools:

1. In the [Dashboard](https://app.serverless.com), open **Settings** and then **Integrations**.
2. Sign in to the AWS account in another browser tab, as a user who can create a CloudFormation stack with IAM roles.
3. In **Integrations**, select **Add Integration**. The AWS Console opens the CloudFormation quick-create page for `Serverless-Inc-Role-Stack` in `us-east-1`. Select **Create stack**.
4. Return to the Dashboard and wait for the integration to finish.
5. On the integration, select **Edit**, turn on **Instrument** for the functions to monitor, and select **Save**. Instrumentation runs in the background.

Give each integration a name (for example `production`) so it's easy to find in the Dashboard filters. Repeat these steps for each AWS account. Data from invocations before a function was instrumented isn't collected; invoke the functions after instrumenting them.

## Supported AWS Lambda runtimes

The Dashboard adds trace instrumentation (the SDK Layer and its environment variables) to functions on these runtimes:

- `nodejs12.x`, `nodejs14.x`, `nodejs16.x`, `nodejs18.x`, `nodejs20.x`, `nodejs22.x`
- `python3.8`, `python3.9`, `python3.10`, `python3.11`

For functions on `go1.x`, `provided` and `provided.al2`, the Dashboard collects logs only. Functions on other runtimes, such as `nodejs24.x` or `python3.12`, appear in the integration's function list, and instrumenting them, from `serverless deploy` or in the Dashboard, adds no Layer, environment variables or log subscription filter to them. For which runtimes AWS still supports, see [Lambda runtimes](https://docs.aws.amazon.com/lambda/latest/dg/lambda-runtimes.html).

## Supported AWS Regions

Dashboard observability covers functions in these AWS Regions: `us-east-1`, `us-east-2`, `us-west-1`, `us-west-2`, `af-south-1`, `ap-east-1`, `ap-south-1`, `ap-northeast-1`, `ap-northeast-2`, `ap-northeast-3`, `ap-southeast-1`, `ap-southeast-2`, `ap-southeast-3`, `ca-central-1`, `eu-central-1`, `eu-west-1`, `eu-west-2`, `eu-west-3`, `eu-south-1`, `eu-north-1`, `me-south-1` and `sa-east-1`.

## What the AWS account integration creates

The `Serverless-Inc-Role-Stack` CloudFormation stack in `us-east-1` contains these IAM roles:

- `ServerlessRole`: the Dashboard assumes it, with an External ID unique to the integration, to read and instrument resources.
- `ServerlessMonitoringRole`: used by the CloudWatch metric stream, Kinesis Data Firehose and CloudWatch Logs in your account to deliver data.
- `ServerlessEventSubscriptionExecutionRole`: used by EventBridge to deliver AWS events to the Dashboard.

Every action the roles allow is listed, with a comment and a link to AWS documentation, in the [IAM role template](https://github.com/serverless/console/blob/main/instrumentation/aws/iam-role-cfn-template.yaml).

The integration creates a CloudTrail trail in `us-east-1` and EventBridge rules that send Lambda change events to the Dashboard. In each Region with Lambda functions, it creates a CloudWatch metric stream for `AWS/Lambda` and `AWS/ApiGateway` metrics and Kinesis Data Firehose delivery streams for metrics and logs, with S3 buckets that hold data the streams couldn't deliver. For each instrumented function, it adds:

- A CloudWatch Logs subscription filter named `serverless_logs-filter` on the function's log group. It forwards the Lambda `START`, `END` and `REPORT` lines, the SDK's telemetry lines, and lines that contain errors or timeouts.
- For a [supported runtime](#supported-aws-lambda-runtimes), a Lambda Layer whose name starts with `sls-sdk-node` or `sls-sdk-python`, and the environment variables `SLS_ORG_ID` and `AWS_LAMBDA_EXEC_WRAPPER` (`/opt/sls-sdk-node/exec-wrapper.sh` or `/opt/sls-sdk-python/exec_wrapper.py`).

The Layer is an internal extension that wraps your handler through the Lambda [wrapper script](https://docs.aws.amazon.com/lambda/latest/dg/runtimes-modify.html#runtime-wrapper) setting. Instrumentation replaces any other value of `AWS_LAMBDA_EXEC_WRAPPER` on the function. At the end of each invocation, the SDK in the Layer writes the trace to the function's log as a line that starts with `SERVERLESS_TELEMETRY.`.

The Dashboard changes the Layer and environment variables with the Lambda API, outside of CloudFormation, so they aren't in the service's CloudFormation template, and a CloudFormation update of a function can remove them. The integration receives the `CreateFunction`, `UpdateFunctionCode`, `UpdateFunctionConfiguration` and `DeleteFunction` events, including the ones a `serverless deploy` causes, checks the changed function, and instruments it again when its instrumentation is on but missing or outdated. Logs shown in the Dashboard are read from the function's CloudWatch Logs log group in your account.

## How trace sampling works

The SDK decides at the end of each invocation, in each Lambda execution environment, whether to send the full trace. A sampled-out trace keeps the `aws.lambda`, `aws.lambda.initialization` and `aws.lambda.invocation` spans, so metrics stay complete, and drops the other spans, the captured errors and warnings, and the custom tags.

The SDK sends the full trace when any of these is true:

- The execution environment has recorded fewer than 5 gaps between invocations, for example right after a cold start.
- The average of the last 5 gaps between invocations is longer than 1 second in the Node.js SDK, or longer than 1 millisecond in the Python SDK.
- The invocation ends with an error, or captures an error event. Captured warnings don't prevent sampling.
- `SLS_SDK_DEBUG` is set on the function.
- The Python SDK sees `SLS_DISABLE_TRACE_SAMPLING` set on the function.

Otherwise, the Node.js SDK sends the full trace for 20% of invocations. For API Gateway and function URL requests it sends 10%, and also sends the full trace of the request that follows a sent one.

## Turn off observability for a service

To remove Dashboard instrumentation from a service's functions in a stage, set `observability: false` for that stage and deploy:

```yaml
# serverless.yml
org: myorg
app: my-app
service: my-service

stages:
  prod:
    observability: false
```

The next `serverless deploy --stage prod` removes the Layer, the environment variables and the log subscription filter from the service's functions in the deployment's Region. The AWS account integration stays connected; to remove it, use **Remove** on the integration in the Dashboard.

## Disconnect an AWS account

To stop observability for a whole AWS account, open **Settings** and then **Integrations** in the Dashboard and select **Remove** on the account. The Dashboard removes the instrumentation from the account's functions, removes the resources it created, and deletes `Serverless-Inc-Role-Stack`. Deleting the stack yourself leaves the functions instrumented.

## Turn off trace sampling

To send every full trace from a function that uses the Python SDK, set `SLS_DISABLE_TRACE_SAMPLING` on it. Any non-empty value, including `false`, turns sampling off. Set it for all functions under `provider.environment`, or for one function under its `environment`:

```yaml
provider:
  environment:
    SLS_DISABLE_TRACE_SAMPLING: true
```

The Node.js SDK (`@serverless/aws-lambda-sdk` 0.15.15) reads `SLS_DISABLE_TRACE_SAMPLING` but applies sampling regardless of its value.

## Turn off AWS SDK spans

The SDK records each AWS SDK request as an `aws.sdk.<service>.<operation>` span, with its duration and tags such as the table, queue or topic name. To stop recording these spans, set `SLS_DISABLE_AWS_SDK_MONITORING` to any non-empty value, for all functions or per function:

```yaml
provider:
  environment:
    SLS_DISABLE_AWS_SDK_MONITORING: true
```

## Turn off HTTP spans

The SDK records each outgoing HTTP and HTTPS request as a span with its method, host, path and status code. To stop recording these spans, set `SLS_DISABLE_HTTP_MONITORING` to any non-empty value, for all functions or per function:

```yaml
provider:
  environment:
    SLS_DISABLE_HTTP_MONITORING: true
```

## Capture errors, tags and custom spans with the SDK

The SDK in the Layer instruments functions without code changes. To capture handled errors and warnings, add tags to traces, create custom spans or set the endpoint of a request, call the SDK from your handler:

- [Dashboard observability SDKs](./sdk/README.md)
- [Node.js SDK](./sdk/nodejs.md)
- [Python SDK](./sdk/python.md)

## Related pages

- [Dashboard metrics](./metrics.md)
- [Dashboard traces](./traces.md)
- [Troubleshoot Dashboard observability](./troubleshoot.md)
- [Dashboard overview and setup](../README.md)
