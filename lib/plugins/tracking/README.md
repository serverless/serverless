# Tracking

This plugin implements a way to toggle the [framework usage tracking](/docs/usage-tracking) functionality.

```
serverless tracking --enabled yes
```

Enable / disable the usage tracking functionality.

## Options
- `--enabled` or `-e` "yes" or "no". **Required**.

## Provided lifecycle events
- `tracking:tracking`

## Examples

### Disable tracking

```
serverless tracking --enabled no
```

This example will disable usage tracking.
