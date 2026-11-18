<!--
title: serverless prune
description: Delete old Lambda function versions, layer versions and sandbox image versions of a deployed service, keeping the newest ones, with serverless prune.
short_title: prune
keywords:
  [
    'serverless prune',
    'Serverless Framework CLI',
    'delete old Lambda versions',
    'Lambda layer versions',
    'sandbox image versions',
  ]
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/aws/cli-reference/prune)

<!-- DOCS-SITE-LINK:END -->

# serverless prune

`serverless prune` deletes the old published versions of a deployed service's Lambda functions, and the old image versions of its [sandboxes](../guide/sandboxes.md), keeping the `--number` newest of each. With `--includeLayers` it also prunes layer versions, and with `--includeArtifacts` it deletes deployment artifacts that no remaining version uses. Run it by hand with this command; to prune after every deploy, set `custom.prune` as the [version pruning guide](../guide/prune.md) describes.

```bash
serverless prune --number 3
```

**Warning:** Deleted versions can't be restored, and [`serverless rollback function`](./rollback-function.md) can't restore code from a deleted version. Preview the run with `--dryRun --verbose` first.

## Options

`serverless prune` accepts these options:

| Option               | Alias | Value     | Default                             | Required | Description                                                                                                         |
| -------------------- | ----- | --------- | ----------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------- |
| `--number`           | `-n`  | number    |                                     | Yes      | Number of versions to keep besides `$LATEST`, aliased versions and a sandbox's live version.                        |
| `--function`         | `-f`  | string    | All functions                       | No       | Prune only this function, as named under `functions`. Sandboxes are left alone.                                     |
| `--layer`            | `-l`  | string    |                                     | No       | Prune only this layer, as named under `layers`. Without `--includeLayers`, ignored when `--function` is set.        |
| `--sandbox`          |       | string    |                                     | No       | Prune only this sandbox's image versions, as named under `sandboxes`.                                               |
| `--includeLayers`    | `-i`  | boolean   | `false`                             | No       | Also prune the versions of every layer in the service. Ignored on a `--sandbox` run.                                |
| `--includeArtifacts` | `-a`  | boolean   | `false`                             | No       | Also delete unused deployment artifacts. See [Deployment artifacts](#deployment-artifacts). Skipped on scoped runs. |
| `--dryRun`           | `-d`  | boolean   | `false`                             | No       | Delete nothing. With `--verbose`, list what would be deleted.                                                       |
| `--verbose`          |       | boolean   | `false`                             | No       | Print each version deleted, kept or selected.                                                                       |
| `--stage`            | `-s`  | string    | `provider.stage`, else `dev`        | No       | Stage to prune.                                                                                                     |
| `--region`           | `-r`  | string    | `provider.region`, else `us-east-1` | No       | AWS Region of the stage.                                                                                            |
| `--aws-profile`      |       | string    | `provider.profile`                  | No       | AWS profile whose credentials the command uses.                                                                     |
| `--config`           | `-c`  | file path | `serverless.yml`                    | No       | Service configuration file to use.                                                                                  |

The command also accepts the options every command takes: `--param="key=value"` (repeatable), `--org`, `--app`, `--debug` and `--help` (`-h`).

## What serverless prune deletes

`serverless prune` chooses what to prune from the scope options:

| Options                                    | Pruned                                                              |
| ------------------------------------------ | ------------------------------------------------------------------- |
| None                                       | Every function, and every sandbox's image versions.                 |
| `--includeLayers`                          | Every function and every layer, and every sandbox's image versions. |
| `--function`                               | That function.                                                      |
| `--layer`                                  | That layer.                                                         |
| `--sandbox`                                | That sandbox's image versions.                                      |
| `--sandbox` with `--function` or `--layer` | The function or layer, and that sandbox's image versions.           |

For each function, the command keeps `$LATEST`, every version a Lambda alias points to, and the `--number` newest other versions, and deletes the rest. Aliased versions don't count toward `--number`. A Lambda@Edge version that Lambda can't delete because it is replicated is skipped with a warning.

## Layer versions

For each layer, `serverless prune` keeps the `--number` newest versions. An older version that is still attached to an existing version of one of this service's functions is kept too. Attachments from other services or accounts can't be detected, so a layer used only outside this service loses its old versions.

## Sandbox image versions

For each sandbox, `serverless prune` keeps the image's live version plus `--number` older successful versions, and never deletes a version that a MicroVM still uses or that is still building. Failed versions are deleted without counting toward `--number`. A sandbox that isn't deployed is skipped. Pruning sandbox image versions needs `lambda:GetMicrovmImage`, `lambda:ListMicrovmImageVersions`, `lambda:GetMicrovmImageVersion`, `lambda:ListMicrovms` and `lambda:DeleteMicrovmImageVersion`; without them, the command stops with an error that names them. See [Sandbox image versions](../guide/prune.md#sandbox-image-versions) in the pruning guide.

## Deployment artifacts

With `--includeArtifacts`, after pruning versions, `serverless prune` looks at the stage's deployment folders in the deployment bucket that are older than the newest `provider.deploymentBucket.maxPreviousDeploymentArtifacts` (default `5`). A folder whose code no remaining function or layer version uses is deleted with plain S3 delete requests. Any folder the command can't prove unused is kept. For a service with sandboxes, sandbox zips that no remaining deployment points to are deleted, except zips uploaded within the last hour. The sweep is skipped on runs scoped with `--function`, `--layer` or `--sandbox`. See [Artifact retention in reference mode](../../../guides/deployment-bucket.md#artifact-retention-in-reference-mode).

**Warning:** On a versioned bucket (the Framework-managed deployment bucket, and any bucket used with `codeStorageMode: reference`), the delete requests write delete markers and the object versions stay recoverable. On an unversioned bucket (an in-stack deployment bucket without `deploymentBucket.versioning: true`, or a bucket you name that has versioning off), the deletion is permanent. Run with `--dryRun --verbose` first.

## Side effects and CI use

- `serverless prune` deletes function versions, layer versions and sandbox image versions in AWS, and with `--includeArtifacts` deletes objects in the deployment bucket. Re-running it with the same `--number` deletes nothing more until new versions are published.
- The command does not prompt, so it runs unattended in CI. Run it with `--dryRun --verbose` first to see the candidates.
- Pruning functions calls `lambda:ListVersionsByFunction`, `lambda:ListAliases` and `lambda:DeleteFunction`; pruning layers calls `lambda:ListLayerVersions` and `lambda:DeleteLayerVersion`.

Each step prints a line when it finishes:

```text
✔ Pruning of functions complete
✔ Pruning of sandbox image versions complete
```

With `--verbose`, the command also prints each version it deletes, such as `Deleting function version my-service-dev-hello:2.`; with `--dryRun --verbose`, each candidate, such as `my-service-dev-hello:2 selected for deletion.`

## Provided lifecycle events

- `prune:prune`

## Examples

### Keep the 3 newest versions of every function

```bash
serverless prune -n 3
```

### Preview what a prune run would delete

```bash
serverless prune -n 3 --dryRun --verbose
```

### Prune one function

```bash
serverless prune -n 5 -f myFunction
```

### Prune functions and layers

```bash
serverless prune -n 3 --includeLayers
```

### Prune one layer

```bash
serverless prune -n 3 -l myLayer
```

### Prune the image versions of one sandbox

```bash
serverless prune -n 3 --sandbox mySandbox
```

### Also delete unused deployment artifacts

```bash
serverless prune -n 3 --includeArtifacts
```

## Related commands

- [`serverless deploy list functions`](./deploy-list.md) lists the versions of each function.
- [`serverless rollback function`](./rollback-function.md) restores a function's code from one of its versions.
- [`serverless rollback`](./rollback.md) restores a whole earlier deployment.
