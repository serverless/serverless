<!--
title: Serverless Framework Commands - Tencent-SCF - Logs
menuText: logs
menuOrder: 10
description: View logs of your Tencent-SCF function within your terminal using the Serverless Framework
layout: Doc
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/tencent/cli-reference/logs/)

<!-- DOCS-SITE-LINK:END -->

# Tencent-SCF - Logs

Lets you watch the logs of a specific function deployed in Tencent Cloud.

```bash
serverless logs -f hello

# Optionally tail the logs with -t
serverless logs -f hello -t
```

## Options

- `--function` or `-f` The function you want to fetch the logs for. **Required**
- `--stage` or `-s` The stage you want to view the function logs for. If not provided, the plugin will use the default stage listed in `serverless.yml`. If that doesn't exist either it'll just fetch the logs from the `dev` stage.
- `--region` or `-r` The region you want to view the function logs for. If not provided, the plugin will use the default region listed in `serverless.yml`. If that doesn't exist either it'll just fetch the logs from the `ap-guangzhou` region.
- `--startTime` A specific unit in time to start fetching logs from (ie: `2019-7-12 00:00:00` ).
- `--tail` or `-t` You can optionally tail the logs and keep listening for new logs in your terminal session by passing this option.
- `--interval` or `-i` If you choose to tail the output, you can control the interval at which the framework polls the logs with this option. The default is `1000`ms.

## Examples

**Note:** There's a small lag between invoking the function and actually having the log event registered in Tencent Cloud Log Service. So it takes a few seconds for the logs to show up right after invoking the function.

```bash
serverless logs -f hello
```

This will fetch the logs from last 10 minutes as startTime was not given.

```bash
serverless logs -f hello -t
```

Serverless will tail the function log output and print new log messages coming in starting from 10 seconds ago.
