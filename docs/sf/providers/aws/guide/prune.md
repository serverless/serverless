<!--
title: Lambda Version Pruning
description: Delete old Lambda function, layer and sandbox image versions after each deploy or on demand, and clean up unused deployment artifacts.
short_title: Version Pruning
keywords:
  [
    'Serverless Framework',
    'AWS Lambda',
    'prune Lambda versions',
    'Lambda code storage',
    'layer versions',
    'cleanup',
  ]
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/aws/guide/prune)

<!-- DOCS-SITE-LINK:END -->

# Lambda Version Pruning

Version pruning deletes old published versions of your Lambda functions, and optionally old layer versions, [sandbox](./sandboxes.md) image versions and unused deployment artifacts. Lambda keeps every published version until you delete it, and each one counts toward the account's Lambda code storage quota; with the default `versionFunctions: true`, every `serverless deploy` publishes a new version of each changed function. Prune after every deploy with `custom.prune`, or on demand with `serverless prune`.

To keep the three newest versions of each function after every deploy, add:

```yaml
# serverless.yml
custom:
  prune:
    automatic: true
    number: 3
```

After the next `serverless deploy`, the Framework deletes older versions of every function in the service, and the image versions of its sandboxes beyond the same `number`. Versions that an alias points to are always kept.

## Prune versions on demand

To prune without deploying, run `serverless prune` with the number of versions to keep. `-n` (`--number`) is required on every run:

```bash
serverless prune -n 3
```

To limit a run to one function or layer, pass its name from `serverless.yml`:

```bash
serverless prune -n 3 --function myFunction
```

```bash
serverless prune -n 3 --layer myLayer
```

To prune function and layer versions together, add `--includeLayers`:

```bash
serverless prune -n 3 --includeLayers
```

A run without `--function`, `--layer` or `--sandbox` prunes function versions and the image versions of every sandbox. `--function` and `--layer` leave sandboxes alone, and `--sandbox <name>` prunes only that sandbox's image versions. All options, with their short forms, are on the [`serverless prune` command page](../cli-reference/prune.md).

## Preview what pruning deletes

To list the versions a run would delete without deleting them, add `--dryRun` and `--verbose`:

```bash
serverless prune -n 3 --dryRun --verbose
```

Candidates are listed by deployed function name:

```text
Dry-run enabled, no pruning actions will be performed.
my-service-dev-myFunction:4 selected for deletion.
my-service-dev-myFunction:3 selected for deletion.
```

## Configuration reference for custom.prune

`custom.prune` accepts these keys; configuration validation reports any other key:

| Key                | Type                 | Default | Description                                                                                                                                     |
| ------------------ | -------------------- | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `automatic`        | boolean              | `false` | Prune after every `serverless deploy`.                                                                                                          |
| `number`           | integer, `0` or more | none    | Versions to keep. Required for `automatic`: without it, nothing is pruned. `0` deletes every version that no alias points to.                   |
| `includeLayers`    | boolean              | `false` | Also prune the service's layer versions after a deploy.                                                                                         |
| `includeArtifacts` | boolean              | `false` | Also delete deployment artifacts that no surviving version uses; see [Delete unused deployment artifacts](#delete-unused-deployment-artifacts). |

`number` and `includeLayers` apply to automatic pruning only: `serverless prune` always takes `-n`, and prunes layers only with `--includeLayers` or `--layer`. `includeArtifacts` applies to both, like the `--includeArtifacts` flag.

## Versions pruning keeps

Pruning sorts a function's versions newest first and keeps the `number` newest, with these exceptions:

- A version that a Lambda alias points to as its primary version is never deleted and doesn't count toward `number`, so aliases keep working.
- A version that receives a share of an alias's traffic through weighted alias routing, as during a gradual traffic shift, has no such exemption. When it falls outside the `number` newest, Lambda refuses to delete it because the alias references it, and pruning stops with that error. Prune after the traffic shift completes.
- `$LATEST` is never deleted.
- A Lambda@Edge version that Lambda can't delete because it is replicated is skipped with a warning.

## Layer versions

To prune layer versions after every deploy, set `includeLayers: true`; on demand, pass `--includeLayers` or `--layer <name>` to `serverless prune`. A layer version that is still attached to an existing version of one of this service's functions is kept even when it is older than the `number` newest. The Framework finds those attachments from the functions in your local `serverless.yml`, so run `prune` with the configuration that produced the deployments. Attachments from other services or accounts aren't detected; a layer version used only by functions outside this service can be deleted.

## Sandbox image versions

Every deploy that changes a [sandbox](./sandboxes.md)'s artifact builds a new version of its MicroVM image, and AWS limits the versions each image can have (50 by default; the **Versions per MicroVM Image** quota in Service Quotas). Pruning keeps the version that serves launches plus the `number` most recent older versions, so `number: 0` keeps only the live version. With `automatic: true`, sandbox image versions are pruned after every deploy, with the same `number` as functions.

Pruning never deletes:

- the image's live version,
- a version that a pending, running, suspending or suspended MicroVM uses, since a suspended MicroVM resumes from its version,
- a version that is still building, for example during a concurrent deploy.

Failed versions are deleted without counting toward `number`. After deleting, `prune` waits until AWS has removed the versions, so a deploy that follows has room for its new version.

A MicroVM your own code starts with an explicit `imageVersion` can't launch after that version is pruned. Keep `number` high enough for any version you pin.

Pruning sandbox image versions needs `lambda:GetMicrovmImage`, `lambda:ListMicrovmImageVersions`, `lambda:GetMicrovmImageVersion`, `lambda:ListMicrovms` and `lambda:DeleteMicrovmImageVersion`. Without them, automatic pruning logs a warning and the deploy still succeeds, while `serverless prune` stops with an error that names the missing permissions.

If a deploy reaches the limit, the error says so and shows the commands to recover:

```text
Sandbox "echo" has reached the maximum number of image versions AWS allows.
Remove old versions with "serverless prune -n 5", then deploy again.
```

## Delete unused deployment artifacts

`includeArtifacts: true`, or `--includeArtifacts` on `serverless prune`, adds a sweep of the deployment bucket after the versions are pruned. The sweep deletes the deployment directories of this service and stage whose artifacts no surviving function or layer version uses, and the sandbox zips that no remaining deployment points to (zips uploaded within the last hour are kept). It is most useful with self-managed code storage (`codeStorageMode: reference`), where artifacts back live versions and the post-deploy cleanup of old deployments doesn't run; see [Artifact retention in reference mode](../../../guides/deployment-bucket.md#artifact-retention-in-reference-mode).

**Warning:** The sweep deletes objects with plain S3 delete requests. On a versioned bucket (the Framework-managed deployment bucket, and any bucket used with `codeStorageMode: reference`), that writes delete markers and the object versions stay recoverable. On an unversioned bucket (an in-stack deployment bucket without `deploymentBucket.versioning: true`, or a bucket you name that has versioning off), the deletion is permanent. Run with `--dryRun --verbose` first.

The sweep keeps:

- the newest `provider.deploymentBucket.maxPreviousDeploymentArtifacts` deployments (default `5`), whether or not a version uses them,
- any deployment whose artifact backs a surviving function or layer version,
- any deployment it can't prove unused: a directory without a zip, or an artifact without checksum metadata or that can't be read.

The sweep learns which functions and layers to protect from your local `serverless.yml`, so run it with the configuration that produced the deployments. It runs only on unscoped runs: `--function`, `--layer` and `--sandbox` skip it.

```bash
serverless prune -n 3 --includeArtifacts --dryRun --verbose
```

In the default copy mode, the post-deploy cleanup already keeps only the newest `maxPreviousDeploymentArtifacts` deployments, so the sweep mostly finds directories left from earlier reference-mode deployments.

## Related

- [`serverless prune` command](../cli-reference/prune.md)
- [Deployment bucket](../../../guides/deployment-bucket.md) for artifact retention and code storage modes
- [Lambda function versions](https://docs.aws.amazon.com/lambda/latest/dg/configuration-versions.html) in the AWS Lambda developer guide

Lambda version pruning is derived from the [serverless-prune-plugin](https://github.com/claygregory/serverless-prune-plugin) by Clay Gregory and contributors.
