<!--
title: Serverless Framework Commands - AWS Lambda - Prune
description: Clean up old Lambda function, layer and sandbox image versions
short_title: Commands - Prune
keywords: ['Serverless', 'Framework', 'AWS Lambda', 'prune', 'cleanup', 'versions']
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/aws/cli-reference/prune)

<!-- DOCS-SITE-LINK:END -->

# AWS - Prune

The `prune` command removes old versions of deployed Lambda functions, layers and [sandbox](../guide/sandboxes.md) images, keeping only the specified number of most recent versions.

```bash
serverless prune -n <number>
```

## Options

- `--number` or `-n` **Required.** Number of previous versions to keep.
- `--stage` or `-s` The stage to prune.
- `--region` or `-r` The region to prune.
- `--function` or `-f` Limit pruning to a specific function.
- `--layer` or `-l` Limit pruning to a specific layer.
- `--sandbox` Limit pruning to the image versions of a specific sandbox.
- `--includeLayers` or `-i` Include layers in pruning.
- `--includeArtifacts` or `-a` Also mark deployment artifacts that no longer back any function or layer version, and delete sandbox zips that no remaining deployment points to. Skipped on `--function`/`--layer` scoped runs.
- `--dryRun` or `-d` Preview what would be deleted without deleting.
- `--verbose` Enable detailed output.

## Layer Version Protection

When pruning layers, a layer version that is still attached to an existing version of one of this service's own functions is retained, even if it falls outside the retained `--number`. This is derived from your local service configuration. Attachments from other services or accounts cannot be detected and remain your responsibility to manage.

## Sandbox Image Versions

For each sandbox, `prune` keeps the image's live version plus `--number` older versions, and never deletes a version that a MicroVM still uses or that is still building. See [Sandbox image versions](../guide/prune.md#sandbox-image-versions).

## Provided lifecycle events

- `prune:prune`

## Examples

### Keep 3 most recent versions

```bash
serverless prune -n 3
```

### Dry-run to preview deletions

```bash
serverless prune -n 3 --dryRun --verbose
```

### Prune a specific function

```bash
serverless prune -n 5 -f myFunction
```

### Prune including layers

```bash
serverless prune -n 3 --includeLayers
```

### Prune only a specific layer

```bash
serverless prune -n 3 -l myLayer
```

### Prune the image versions of one sandbox

```bash
serverless prune -n 3 --sandbox mySandbox
```

### Also mark unreferenced deployment artifacts

```bash
serverless prune -n 3 --includeArtifacts
```

See [Artifact retention in reference mode](../../../guides/deployment-bucket#artifact-retention-in-reference-mode) for how this interacts with self-managed code storage.
