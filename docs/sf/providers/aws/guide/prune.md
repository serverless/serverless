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
    includeArtifacts: true # Also mark deployment artifacts no longer backed by any version
```

### Configuration Options

| Option             | Type    | Default | Description                                                    |
| ------------------ | ------- | ------- | -------------------------------------------------------------- |
| `automatic`        | boolean | `false` | Enable automatic pruning after deploy                          |
| `number`           | integer | -       | Number of versions to keep (required for automatic)            |
| `includeLayers`    | boolean | `false` | Include Lambda layers in pruning                               |
| `includeArtifacts` | boolean | `false` | Also mark deployment artifacts no longer backed by any version |

`includeArtifacts` is most useful when using self-managed code storage, where deployment artifacts back live Lambda versions and are retained until pruned. The sweep works in any storage mode. In the default copy mode the automatic post-deploy cleanup already enforces the `maxPreviousDeploymentArtifacts` retention window, so a steady-state sweep usually finds nothing new; there it is mainly useful for retiring artifact directories left over from earlier reference-mode deployments after switching back to copy mode. See [Artifact retention in reference mode](../../../guides/deployment-bucket#artifact-retention-in-reference-mode) for the full retention story.

The artifact sweep learns which functions and layers to protect from your local service configuration, so run `prune --includeArtifacts` with the same service configuration that produced those deployments. The sweep also honors `provider.deploymentBucket.maxPreviousDeploymentArtifacts` (default `5`) as an unconditional retention window: the newest N deployments are always kept, whether or not their artifacts are still pinned. In reference mode the deploy-time artifact cleanup does not run, so this retention window applies only during the sweep.

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

# Also mark unreferenced deployment artifacts (most useful in reference mode)
serverless prune -n 3 --includeArtifacts
```

## Alias Protection

Versions that are referenced by Lambda aliases will **never** be deleted, regardless of the `number` setting. This ensures stable deployments and traffic shifting configurations remain intact.

## Layer Version Protection

When pruning layers (`--includeLayers` or `-l`), a layer version that is still attached to an existing version of one of this service's own functions is retained even if it falls outside the `number` window. This protection is derived from your local service configuration, which is another reason to run `prune` with the same configuration that produced the deployments.

Attachments from other services or accounts cannot be detected, so layer versions consumed only by functions outside this service remain your responsibility to manage.

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
