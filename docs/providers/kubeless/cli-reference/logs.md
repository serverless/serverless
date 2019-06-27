<!--
title: Serverless Framework Commands - Kubeless - Logs
menuText: logs
menuOrder: 4
description: View logs of your Kubeless Function within your terminal using the Serverless Framework
layout: Doc
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/kubeless/cli-reference/logs)

<!-- DOCS-SITE-LINK:END -->

# Kubeless - Logs

Lets you watch the logs of a specific function.

```bash
serverless logs -f hello
```

## Options

- `--function` or `-f` The function you want to fetch the logs for. **Required**
- `--startTime` A specific unit in time to start fetching logs from (ie: `2010-10-20` or `1469705761`). Here's a list of the supported string formats:

```bash
30m                   # since 30 minutes ago
2h                    # since 2 hours ago
3d                    # since 3 days ago

2013-02-08            # A calendar date part
2013-W06-5            # A week date part
2013-039              # An ordinal date part

20130208              # Basic (short) full date
2013W065              # Basic (short) week, weekday
2013W06               # Basic (short) week only
2013050               # Basic (short) ordinal date

2013-02-08T09         # An hour time part separated by a T
20130208T080910,123   # Short date and time up to ms, separated by comma
20130208T080910.123   # Short date and time up to ms
20130208T080910       # Short date and time up to seconds
20130208T0809         # Short date and time up to minutes
20130208T08           # Short date and time, hours only
```

- `--filter` You can specify a filter string to filter the log output. This is useful if you want to to get the `error` logs for example.
- `--tail` or `-t` You can optionally tail the logs and keep listening for new logs in your terminal session by passing this option.
- `--count` or `-n` You can print the last N lines of the log.

## Examples

```bash
serverless logs -f hello --startTime 5h
```

This will fetch the logs that happened in the past 5 hours.

```bash
serverless logs -f hello --startTime 1469694264
```

This will fetch the logs that happened starting at epoch `1469694264`.

```bash
serverless logs -f hello -t
```

Serverless will tail the platform log output and print new log messages coming in.

```bash
serverless logs -f hello --filter serverless
```

This will fetch only the logs that contain the string `serverless`
