<!--
title: Serverless Remove CLI Command
description: Remove a deployed service with the Serverless CLI
layout: Doc
-->

# Remove

Removes the deployed service which is defined in your current working directory.

```
serverless remove
```

## Options
- `--stage` or `-s` The name of the stage in service.
- `--region` or `-r` The name of the region in stage.
- `--verbose` or `-v` Shows all stack events during deployment.

## Provided lifecycle events
- `remove:remove`

## Examples

### Removal of service in specific stage and region

```
serverless remove --stage dev --region us-east-1
```

This example will remove the deployed service of your current working directory with the stage `dev` and the region `us-east-1`.
