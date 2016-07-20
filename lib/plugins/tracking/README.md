# Tracking

This plugin implements a way to toggle the [framework usage tracking](/docs/usage-tracking) functionality.

```
serverless tracking --enable
```

Enable / disable the usage tracking functionality.

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
