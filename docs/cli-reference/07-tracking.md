<!--
title: Serverless Tracking CLI Command
description: Enable or Disable anonymous usage tracking for Serverless
layout: Page
-->

# Tracking

This plugin implements a way to toggle the [framework usage tracking](/docs/usage-tracking) functionality.

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
