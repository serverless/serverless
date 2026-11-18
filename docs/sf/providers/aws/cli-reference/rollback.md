<!--
title: serverless rollback
description: Return a deployed service's CloudFormation stack to an earlier deployment kept in the deployment bucket with serverless rollback --timestamp.
short_title: rollback
keywords:
  [
    'serverless rollback',
    'Serverless Framework CLI',
    'rollback deployment',
    'CloudFormation rollback',
    'serverless rollback --timestamp',
  ]
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/aws/cli-reference/rollback)

<!-- DOCS-SITE-LINK:END -->

# serverless rollback

`serverless rollback` returns a service's CloudFormation stack to an earlier deployment that is still stored in the deployment bucket: its template and its code packages. Use it to undo a deployment of the whole service. To restore only one function's code from a Lambda version, use [`serverless rollback function`](./rollback-function.md).

```bash
serverless rollback --timestamp 1793178942120
```

Take the timestamp from [`serverless deploy list`](./deploy-list.md). Without `--timestamp`, `serverless rollback` prints the same list and changes nothing.

## Options

`serverless rollback` accepts these options:

| Option          | Alias | Value     | Default                             | Required | Description                                                                                                                                                      |
| --------------- | ----- | --------- | ----------------------------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--timestamp`   | `-t`  | string    | none                                | No       | Deployment to restore: the `Timestamp` that `serverless deploy list` prints, or a date string of the same moment. Without it, the command lists the deployments. |
| `--stage`       | `-s`  | string    | `provider.stage`, else `dev`        | No       | Stage to roll back.                                                                                                                                              |
| `--region`      | `-r`  | string    | `provider.region`, else `us-east-1` | No       | AWS Region of that stage.                                                                                                                                        |
| `--aws-profile` |       | string    | `provider.profile`                  | No       | AWS profile whose credentials the command uses.                                                                                                                  |
| `--config`      | `-c`  | file path | `serverless.yml`                    | No       | Service configuration file to use.                                                                                                                               |
| `--verbose`     |       | flag      | off                                 | No       | Print each CloudFormation stack event during the rollback.                                                                                                       |

`serverless rollback` also accepts the options every command takes: `--param="key=value"` (repeatable), `--org`, `--app`, `--debug` and `--help` (`-h`).

## What serverless rollback changes in AWS

`serverless rollback --timestamp <timestamp>` finds the deployment folder for that timestamp under `<deploymentPrefix>/<service>/<stage>/` in the deployment bucket, then updates the stack with the template stored there, directly or through a change set as `provider.deploymentMethod` sets. CloudFormation then changes every resource that differs, including function code, which the stored template points to in the same folder. The command waits for the update to finish.

Run the command from the service directory: it reads the service name, stage and deployment prefix from `serverless.yml`. It uploads nothing and creates no deployment folder.

Only deployments still in the bucket can be restored. [`serverless deploy`](./deploy.md) keeps the newest `provider.deploymentBucket.maxPreviousDeploymentArtifacts` (default `5`). When the timestamp matches none of them, the command stops with:

```text
Couldn't find a deployment for the timestamp: 1793178942120. Please verify that the timestamp, stage and region are correct.
```

When the stack already matches that deployment, the command prints `No updates to be performed. Rollback skipped.` and changes nothing, so it is safe to re-run.

## Deploy again after serverless rollback

`serverless deploy` compares the local package with the newest deployment in the bucket, not with the deployment the stack runs after a rollback. When your files still match that newest deployment, the next `serverless deploy` is skipped with `No changes to deploy. Deployment skipped.`; run `serverless deploy --force` to deploy them.

## Run serverless rollback in CI

`serverless rollback` has no prompts of its own. In CI, always pass `--timestamp`, `--stage` and `--region`, and sign in with `SERVERLESS_ACCESS_KEY` or `SERVERLESS_LICENSE_KEY`; see [Non-interactive use](./README.md#non-interactive-use-ci-and-ai-agents).

## Output of serverless rollback

```text
Rolling back my-service to timestamp "1793178942120"

✔ Service rolled back to timestamp "1793178942120" (32s)
```

## Provided lifecycle events

- `rollback:initialize`
- `rollback:rollback`

## Examples

### Find a deployment and roll back to it

List the stored deployments:

```bash
serverless deploy list
```

The list shows each deployment's date in UTC and its timestamp:

```text
2026-10-28 09:15:42 UTC
Timestamp: 1793178942120
Files:
  - compiled-cloudformation-template.json
  - my-service.zip
  - serverless-state.json

2026-10-30 14:02:11 UTC
Timestamp: 1793368931482
Files:
  - compiled-cloudformation-template.json
  - my-service.zip
  - serverless-state.json
```

Roll back to the deployment of October 28:

```bash
serverless rollback --timestamp 1793178942120
```

### Roll back a specific stage

```bash
serverless rollback --timestamp 1793178942120 --stage prod --region eu-central-1
```

## Related commands

- [`serverless deploy list`](./deploy-list.md) lists the deployments you can roll back to.
- [`serverless rollback function`](./rollback-function.md) restores one function's code from a Lambda version.
- [`serverless deploy`](./deploy.md) deploys the current `serverless.yml` again.
