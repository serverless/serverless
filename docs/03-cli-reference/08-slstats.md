<!--
title: Serverless SlStats CLI Command
menuText: Stats
description: Enable or disable framework statistics
layout: Doc
-->

# SlStats

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
