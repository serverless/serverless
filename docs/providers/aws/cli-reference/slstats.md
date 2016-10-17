<!--
title: Serverless Framework Commands - AWS Lambda - Serverless Stats
menuText: Serverless Stats
menuOrder: 8
description: Enables or disables Serverless Statistic logging within the Serverless Framework.
layout: Doc
-->

# Serverless Statistics

This plugin implements a way to toggle [framework statistics](../framework-statistics.md).

```
serverless slstats --enable
```

## Options
- `--enable` or `-e`.
- `--disable` or `-d`

## Provided lifecycle events
- `slstats:slstats`

## Examples

### Disabling it

```
serverless slstats --disable
```

This example will disable framework statistics.