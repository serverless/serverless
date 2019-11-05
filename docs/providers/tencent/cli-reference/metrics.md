<!--
title: Serverless Framework Commands - Tencent-SCF - Metrics
menuText: metrics
menuOrder: 11
description: View metrics of a specific Tencent-SCF function within your terminal using the Serverless Framework
layout: Doc
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/tencent/cli-reference/metrics/)

<!-- DOCS-SITE-LINK:END -->

# Tencent-SCF - Metrics

Lets you watch the metrics of a specific function.

```bash
serverless metrics
```

## Options

- `--function` or `-f` The function you want to fetch the metrics for.
- `--stage` or `-s` The stage you want to view the function metrics for. If not provided, the plugin will use the default stage listed in `serverless.yml`. If that doesn't exist either it'll just fetch the metrics from the `dev` stage.
- `--region` or `-r` The region you want to view the function metrics for. If not provided, the plugin will use the default region listed in `serverless.yml`. If that doesn't exist either it'll just fetch the metrics from the `ap-guangzhou` region.
- `--startTime` A specific unit in time to start fetching metrics from (ie: `"2019-7-12 00:10:00"`).
- `--endTime` A specific unit in time to end fetching metrics from (ie: `"2019-7-12 00:10:00"`).

## Examples

**Note:** There's a small lag between invoking the function and actually having access to the metrics. It takes a few seconds for the metrics to show up right after invoking the function.

### See service wide metrics for the last 24h

```bash
serverless metrics
```

Displays service wide metrics for the last 24h.

### See service wide metrics for a specific timespan

```bash
serverless metrics --startTime "2019-11-01 00:00:00" --endTime "2019-11-02 00:00:00"
```

Displays service wide metrics for the time between November 1, 2019 and November 2, 2019.

### See all metrics for the function `hello` of the last 24h

```bash
serverless metrics --function hello
```

Displays all `hello` function metrics for the last 24h.

### See metrics for the function `hello` of a specific timespan

```bash
serverless metrics --function hello --startTime "2019-11-01 00:00:00" --endTime "2019-11-02 00:00:00"
```

Displays all `hello` function metrics for the time between November 1, 2019 and November 2, 2019.
