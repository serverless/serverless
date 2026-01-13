<!--
title: Lambda Version Pruning
description: Automatically clean up old Lambda function and layer versions
short_title: Pruning
keywords:
  [
    'Serverless Framework',
    'AWS Lambda',
    'Prune',
    'Cleanup',
    'Versions',
  ]
-->

# Pruning Lambda Versions

Lambda version pruning is built into the Serverless Framework. Thanks to Clay Gregory and contributors for the [original serverless-prune-plugin](https://github.com/claygregory/serverless-prune-plugin).

## Why Prune?

AWS Lambda retains all published versions of your functions. Over time, this can:

- Consume storage quota
- Clutter the Lambda console
- Slow down deployment tooling that enumerates versions (due to pagination / extra API calls)

The prune feature automatically removes old versions while keeping a configurable number of recent versions.

## Configuration

Add the `prune` section to your `custom` block:

```yaml
custom:
  prune:
    automatic: true # Prune after each deploy
    number: 3 # Keep 3 most recent versions
    includeLayers: true # Also prune layer versions
```

### Configuration Options

| Option          | Type    | Default | Description                                |
| --------------- | ------- | ------- | ------------------------------------------ |
| `automatic`     | boolean | `false` | Enable automatic pruning after deploy      |
| `number`        | integer | -       | Number of versions to keep (required for automatic) |
| `includeLayers` | boolean | `false` | Include Lambda layers in pruning           |

## Manual Pruning

Use the `prune` command to manually clean up versions:

```bash
# Keep 5 most recent versions
serverless prune -n 5

# Preview what would be deleted
serverless prune -n 3 --dryRun --verbose

# Prune a specific function
serverless prune -n 3 -f myFunction

# Prune layers only
serverless prune -n 3 -l myLayer

# Prune functions and layers
serverless prune -n 3 --includeLayers
```

## Alias Protection

Versions that are referenced by Lambda aliases will **never** be deleted, regardless of the `number` setting. This ensures stable deployments and traffic shifting configurations remain intact.

## Dry Run Mode

Use `--dryRun` with `--verbose` to preview what would be deleted:

```bash
serverless prune -n 3 --dryRun --verbose
```

Output:

```
Prune: myFunction:4 selected for deletion.
Prune: myFunction:3 selected for deletion.
Prune: Dry-run enabled, no pruning actions will be performed.
```
