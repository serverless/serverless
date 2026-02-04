<!--
title: Serverless Framework Commands - AWS Lambda - Prune
description: Clean up old Lambda function and layer versions
short_title: Commands - Prune
keywords: ['Serverless', 'Framework', 'AWS Lambda', 'prune', 'cleanup', 'versions']
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/aws/cli-reference/prune)

<!-- DOCS-SITE-LINK:END -->

# AWS - Prune

The `prune` command removes old versions of deployed Lambda functions and layers, keeping only the specified number of most recent versions.

```bash
serverless prune -n <number>
```

## Options

- `--number` or `-n` **Required.** Number of previous versions to keep.
- `--stage` or `-s` The stage to prune.
- `--region` or `-r` The region to prune.
- `--function` or `-f` Limit pruning to a specific function.
- `--layer` or `-l` Limit pruning to a specific layer.
- `--includeLayers` or `-i` Include layers in pruning.
- `--dryRun` or `-d` Preview what would be deleted without deleting.
- `--verbose` Enable detailed output.

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
