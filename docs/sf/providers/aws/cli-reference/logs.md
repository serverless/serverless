<!--
title: serverless logs
description: Print or tail the CloudWatch logs of a deployed Lambda function, AgentCore agent, sandbox or web app in your terminal with serverless logs.
short_title: logs
keywords:
  [
    'serverless logs',
    'Serverless Framework CLI',
    'Lambda CloudWatch logs',
    'tail Lambda logs',
    'AgentCore agent logs',
  ]
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/aws/cli-reference/logs)

<!-- DOCS-SITE-LINK:END -->

# serverless logs

`serverless logs` prints a deployed Lambda function's log events from Amazon CloudWatch Logs, from the last 10 minutes by default, and with `--tail` keeps printing new ones. It only reads logs. It shows what the code deployed in AWS logged; to run a stage's invocations on your machine and see their output there, use [`serverless dev`](./dev.md). The same command reads the logs of [AgentCore Runtime agents](../guide/agents/README.md), [sandboxes](../guide/sandboxes.md) and [web apps](../guide/web-apps.md).

```bash
serverless logs --function hello
```

The command prints the start of the time range, then each event, with the `START`, `END` and `REPORT` lines condensed:

```text
Logs Start Time: 2026-10-30 14:02:11

START - 8f2c1c55-0f1e-4f1a-9d47-3d1f3e6a2b10 - Version: $LATEST
2026-10-30 14:05:42.118 - 8f2c1c55-0f1e-4f1a-9d47-3d1f3e6a2b10 -
INFO	Processing order 1042
END - 8f2c1c55-0f1e-4f1a-9d47-3d1f3e6a2b10
REPORT - 8f2c1c55-0f1e-4f1a-9d47-3d1f3e6a2b10
Duration: 2.31 ms	Billed Duration: 3 ms	Memory Size: 1024 MB	Max Memory Used: 68 MB
```

Log events reach CloudWatch Logs a few seconds after an invocation, so run the command again when the latest invocation is missing.

## Options

`serverless logs` accepts these options. One of `--function`, `--agent`, `--sandbox` or `--web-app` is required, and they can't be combined:

| Option          | Alias | Value                       | Default                             | Required    | Description                                                                                 |
| --------------- | ----- | --------------------------- | ----------------------------------- | ----------- | ------------------------------------------------------------------------------------------- |
| `--function`    | `-f`  | string                      |                                     | One of four | Function whose logs to print, as named under `functions` in `serverless.yml`.               |
| `--agent`       | `-a`  | string                      |                                     | One of four | Agent whose logs to print, as named under `ai.agents`. See [Agent logs](#agent-logs).       |
| `--sandbox`     |       | string                      |                                     | One of four | Sandbox whose logs to print, as named under `sandboxes`. See [Sandbox logs](#sandbox-logs). |
| `--web-app`     |       | string                      |                                     | One of four | Web app whose logs to print, as named under `webApps`. See [Web app logs](#web-app-logs).   |
| `--startTime`   |       | `30m`, `2h`, `3d` or a date | `10m`; `15s` with `--tail`          | No          | Start of the time range. See [Time range and filters](#time-range-and-filters).             |
| `--filter`      |       | string                      |                                     | No          | CloudWatch Logs filter pattern; only matching events are printed.                           |
| `--tail`        | `-t`  | boolean                     | `false`                             | No          | Keep printing new events until you stop the command.                                        |
| `--interval`    | `-i`  | milliseconds                | `1000`                              | No          | With `--tail`, how often to poll for new events.                                            |
| `--stage`       | `-s`  | string                      | `provider.stage`, else `dev`        | No          | Stage of the deployed function.                                                             |
| `--region`      | `-r`  | string                      | `provider.region`, else `us-east-1` | No          | AWS Region of the deployed function.                                                        |
| `--aws-profile` |       | string                      | `provider.profile`                  | No          | AWS profile whose credentials the command uses.                                             |
| `--config`      | `-c`  | file path                   | `serverless.yml`                    | No          | Service configuration file to use.                                                          |

The command also accepts the options every command takes: `--param="key=value"` (repeatable), `--org`, `--app`, `--verbose`, `--debug` and `--help` (`-h`).

## Time range and filters

The `serverless logs` `--startTime` option accepts a relative time or a date:

```text
30m                   # since 30 minutes ago
2h                    # since 2 hours ago
3d                    # since 3 days ago

2013-02-08            # A calendar date
20130208              # Basic (short) full date
2013-02-08T09         # An hour time part separated by a T
2013-02-08T09:10:11   # Date and time up to seconds
2013-02-08T09:10:11Z  # Date and time with a time zone
20130208T080910       # Short date and time up to seconds
```

A date without a time zone is read as UTC. Relative times take only minutes (`m`), hours (`h`) and days (`d`).

`--filter` takes a [CloudWatch Logs filter pattern](https://docs.aws.amazon.com/AmazonCloudWatch/latest/logs/FilterAndPatternSyntax.html); a single term such as `ERROR` matches the events that contain it.

Without `--tail`, the command makes one request: it prints one page of results, as many events as fit in 1 MB, up to 10,000 ([`FilterLogEvents`](https://docs.aws.amazon.com/AmazonCloudWatchLogs/latest/APIReference/API_FilterLogEvents.html)), from the 50 log streams with the most recent events. To see older events in a busy log group, narrow the range with `--startTime` or the events with `--filter`. Neither option changes which streams are read, so an event in a stream outside those 50 isn't printed; to search every stream of the log group, use [CloudWatch Logs Insights](https://docs.aws.amazon.com/AmazonCloudWatch/latest/logs/AnalyzingLogData.html). When nothing matches, the command prints `No logs found from start time: <time>`.

## Follow logs with --tail

With `--tail`, `serverless logs` polls every `--interval` milliseconds (default `1000`) and prints events newer than the last one it printed, starting 15 seconds back unless `--startTime` is set. Each poll looks up the most recent log streams again, so streams from new execution environments are picked up. The command runs until you stop it, for example with Ctrl+C.

## Agent logs

`serverless logs --agent` reads the `/aws/bedrock-agentcore/runtimes/<runtime-id>-DEFAULT` log group of a deployed [AgentCore Runtime agent](../guide/agents/README.md), finding the runtime ID in the stack's outputs. It takes `--startTime`, `--filter`, `--tail` and `--interval` as for functions. Until the agent has been invoked, the command stops with `No existing log streams for the agent. The agent may not have been invoked yet.` or a missing log group error.

```bash
serverless logs --agent myAgent --tail
```

## Sandbox logs

`serverless logs --sandbox` reads the `/aws/lambda-microvms/<service>-<name>-<stage>` log group of a [sandbox](../guide/sandboxes.md) and prints every event since `--startTime` (default 10 minutes), across all pages. It takes `--startTime` and `--filter`; `--interval` is not used, and `--tail` prints the same window followed by the notice that following is not available for sandbox logs. Before the sandbox has been built or run, the command stops with `Log group '<name>' not found. The sandbox may not have been built or run yet.`

```bash
serverless logs --sandbox mySandbox --startTime 1h
```

## Web app logs

`serverless logs --web-app` reads a [web app](../guide/web-apps.md)'s `/aws/lambda/web/<function-name>.local` log group, where its lines arrive first, and takes `--startTime`, `--filter`, `--tail` and `--interval` as for functions. `<function-name>` is `<service>-<stage>-<name>` unless the web app sets `name`. Before the web app has logged anything, for example right after its first deploy, the command stops with `No logs yet for web app "api". Send it a request, then run this command again.`

```bash
serverless logs --web-app api --tail
```

The identity running the command needs this permission; a grant on the `/aws/lambda/web/<function-name>` log group does not cover the `.local` one:

```json
{
  "Effect": "Allow",
  "Action": ["logs:DescribeLogStreams", "logs:FilterLogEvents"],
  "Resource": "arn:aws:logs:<region>:<account-id>:log-group:/aws/lambda/web/<function-name>.local:*"
}
```

See [Logs](../guide/web-apps.md#logs) in the web apps guide.

## Side effects and CI use

- `serverless logs` only reads CloudWatch Logs and is safe to re-run. For a function it calls `logs:DescribeLogStreams` and `logs:FilterLogEvents` on the function's log group.
- The command does not prompt. Without `--tail` it returns after one read, so it suits scripts and CI; with `--tail` it runs until it is stopped.
- Before the function has logged anything, the command stops with `No existing streams for the function`.
- A function whose log group uses the `INFREQUENT_ACCESS` log class stops the command with an error, because that log class does not support the CloudWatch Logs APIs the command uses; read those logs with [CloudWatch Logs Insights](https://docs.aws.amazon.com/AmazonCloudWatch/latest/logs/AnalyzingLogData.html).

## Provided lifecycle events

- `logs:logs`

## Examples

### Print the last 5 hours of a function's logs

```bash
serverless logs --function hello --startTime 5h
```

### Print a function's logs from a UTC date and time

```bash
serverless logs --function hello --startTime 2026-10-30T08:00:00
```

### Print only the events that contain a term

```bash
serverless logs --function hello --filter ERROR
```

### Follow a function's logs in a specific stage

```bash
serverless logs --function hello --stage prod --tail
```

### Follow logs with a 5-second polling interval

```bash
serverless logs --function hello --tail --interval 5000
```

## Related commands

- [`serverless invoke`](./invoke.md) invokes a deployed function; its `--log` option prints that invocation's log.
- [`serverless metrics`](./metrics.md) prints a function's invocation, error and duration metrics.
- [`serverless dev`](./dev.md) runs a stage's invocations on your machine.
