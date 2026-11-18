<!--
title: serverless deploy list
description: List a service's stored deployments and their timestamps, or its functions' Lambda versions, with serverless deploy list before a rollback.
short_title: deploy list
keywords:
  [
    'serverless deploy list',
    'serverless deploy list functions',
    'Serverless Framework CLI',
    'list deployments',
    'Lambda function versions',
  ]
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/aws/cli-reference/deploy-list)

<!-- DOCS-SITE-LINK:END -->

# serverless deploy list

`serverless deploy list` lists the deployments of a service's stage that are stored in the deployment bucket, with the timestamp of each. `serverless deploy list functions` lists the Lambda versions of each deployed function. Use the first before [`serverless rollback`](./rollback.md) and the second before [`serverless rollback function`](./rollback-function.md); neither changes the deployed service.

```bash
serverless deploy list
```

## Options

`serverless deploy list` and `serverless deploy list functions` accept these options:

| Option          | Alias | Value     | Default                             | Required | Description                                     |
| --------------- | ----- | --------- | ----------------------------------- | -------- | ----------------------------------------------- |
| `--stage`       | `-s`  | string    | `provider.stage`, else `dev`        | No       | Stage whose deployments or functions to list.   |
| `--region`      | `-r`  | string    | `provider.region`, else `us-east-1` | No       | AWS Region of that stage.                       |
| `--aws-profile` |       | string    | `provider.profile`                  | No       | AWS profile whose credentials the command uses. |
| `--config`      | `-c`  | file path | `serverless.yml`                    | No       | Service configuration file to use.              |

Both commands also accept the options every command takes: `--param="key=value"` (repeatable), `--org`, `--app`, `--verbose`, `--debug` and `--help` (`-h`).

## Deployments that serverless deploy list shows

`serverless deploy list` reads the folders under `<deploymentPrefix>/<service>/<stage>/` in the deployment bucket. Each [`serverless deploy`](./deploy.md) that uploads creates one folder, and keeps the newest `provider.deploymentBucket.maxPreviousDeploymentArtifacts` (default `5`); with `codeStorageMode: reference` it keeps all of them until [`serverless prune --includeArtifacts`](./prune.md) removes them.

For each deployment the command prints the date in UTC, the timestamp that `serverless rollback --timestamp` takes, and the files:

```text
2026-10-30 14:02:11 UTC
Timestamp: 1793368931482
Files:
  - compiled-cloudformation-template.json
  - my-service.zip
  - serverless-state.json
```

When the stage has no deployments in the bucket, the command prints `No deployments found, if that's unexpected ensure that stage and region are correct`.

## Function versions that serverless deploy list functions shows

`serverless deploy list functions` prints each function's name and its Lambda versions, `$LATEST` included: all of them when there are five or fewer, otherwise the latest five.

```text
hello
  All Versions: $LATEST, 1, 2, 3
```

`serverless deploy` publishes these versions unless `provider.versionFunctions` is `false`; [`serverless deploy function`](./deploy-function.md) publishes none. Every function in `serverless.yml` must be deployed, or the command stops with the Lambda error for the missing one.

## Provided lifecycle events

- `deploy:list:log`
- `deploy:list:functions:log`

## Examples

### List the deployments of a stage

```bash
serverless deploy list --stage prod --region eu-central-1
```

### List deployed functions and their versions

```bash
serverless deploy list functions
```

## Related commands

- [`serverless rollback`](./rollback.md) restores a listed deployment.
- [`serverless rollback function`](./rollback-function.md) restores a function's code from a listed version.
- [`serverless deploy`](./deploy.md) creates the deployments.
