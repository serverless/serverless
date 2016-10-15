<!--
title: Serverless Tracking CLI Command
menuText: Tracking
description: Enable or Disable anonymous usage tracking for Serverless
layout: Doc
-->

# Tracking

This plugin implements a way to toggle the [framework usage tracking](../usage-tracking.md) functionality.

```
serverless tracking --enable
```

## Options
- `--enable` or `-e`.
- `--disable` or `-d`

## Provided lifecycle events
- `tracking:tracking`

## Examples

### Disable tracking

```
serverless tracking --disable
```

This example will disable usage tracking.
