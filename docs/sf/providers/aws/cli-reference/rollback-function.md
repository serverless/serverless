<!--
title: serverless rollback function
description: Restore one Lambda function's code from an earlier published version with serverless rollback function, without a full stack rollback.
short_title: rollback function
keywords:
  [
    'serverless rollback function',
    'Serverless Framework CLI',
    'rollback Lambda function version',
    'restore function code',
  ]
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/aws/cli-reference/rollback-function)

<!-- DOCS-SITE-LINK:END -->

# serverless rollback function

`serverless rollback function` copies the code of one of a function's published [Lambda versions](https://docs.aws.amazon.com/lambda/latest/dg/configuration-versions.html) back to the function, without CloudFormation. Use it to undo a bad code change in one function quickly. To return the whole service, configuration included, to an earlier deployment, use [`serverless rollback`](./rollback.md).

```bash
serverless rollback function --function hello --function-version 3
```

`hello` is the function's name under `functions` in `serverless.yml`; take the version from [`serverless deploy list functions`](./deploy-list.md).

## Options

`serverless rollback function` accepts these options:

| Option               | Alias | Value         | Default                             | Required | Description                                                            |
| -------------------- | ----- | ------------- | ----------------------------------- | -------- | ---------------------------------------------------------------------- |
| `--function`         | `-f`  | function name | none                                | Yes      | Function to roll back, as named under `functions` in `serverless.yml`. |
| `--function-version` |       | string        | none                                | Yes      | Published Lambda version whose code to restore, such as `3`.           |
| `--stage`            | `-s`  | string        | `provider.stage`, else `dev`        | No       | Stage of the function.                                                 |
| `--region`           | `-r`  | string        | `provider.region`, else `us-east-1` | No       | AWS Region of that stage.                                              |
| `--aws-profile`      |       | string        | `provider.profile`                  | No       | AWS profile whose credentials the command uses.                        |
| `--config`           | `-c`  | file path     | `serverless.yml`                    | No       | Service configuration file to use.                                     |

`serverless rollback function` also accepts the options every command takes: `--param="key=value"` (repeatable), `--org`, `--app`, `--verbose`, `--debug` and `--help` (`-h`).

## What serverless rollback function changes in AWS

`serverless rollback function` reads the given version of the function and updates the function's code (`$LATEST`) with that version's `.zip` package. For a function stored with `codeStorageMode: reference`, it points the function at the S3 object version that the Lambda version uses.

The command restores functions packaged as `.zip` files. A container image function has no code package to restore, and the command stops with `TypeError: Failed to parse URL from undefined`. To roll back a container image function, roll back the service with [`serverless rollback`](./rollback.md), or deploy the function with the earlier image.

The command changes only the code:

- The function's configuration (memory, timeout, environment and so on) stays as it is.
- No new Lambda version is published, and the CloudFormation stack isn't updated.
- Aliases and event sources that target a published version keep that version.

Versions exist only for functions deployed with [`serverless deploy`](./deploy.md) while `provider.versionFunctions` is `true`, the default. [`serverless deploy function`](./deploy-function.md) publishes no versions. When the version doesn't exist, the command stops with:

```text
Function "hello" with version "3" not found. Please check if you've deployed "hello" and version "3" is available for this function. Please check the docs for more info.
```

Running the command again with the same version restores the same code, so it is safe to re-run. To deploy the code from your files again, run `serverless deploy`; when nothing changed since the last deployment, it is skipped, so run `serverless deploy --force`.

## Run serverless rollback function in CI

`serverless rollback function` has no prompts of its own. In CI, pass `--stage` and `--region` and sign in with `SERVERLESS_ACCESS_KEY` or `SERVERLESS_LICENSE_KEY`; see [Non-interactive use](./README.md#non-interactive-use-ci-and-ai-agents).

## Output of serverless rollback function

```text
Rolling back function hello to version "3"

✔ Successfully rolled back function hello to version "3" (3s)
```

## Provided lifecycle events

- `rollback:function:rollback`

## Examples

### Find a version and restore its code

List each function's versions:

```bash
serverless deploy list functions
```

```text
hello
  All Versions: $LATEST, 1, 2, 3
```

Restore the code of version `2`:

```bash
serverless rollback function --function hello --function-version 2
```

### Roll back a function in a specific stage

```bash
serverless rollback function -f hello --function-version 2 --stage prod --region eu-central-1
```

## Related commands

- [`serverless deploy list functions`](./deploy-list.md) lists the versions you can restore.
- [`serverless rollback`](./rollback.md) returns the whole service to an earlier deployment.
- [`serverless deploy function`](./deploy-function.md) deploys one function's current code.
