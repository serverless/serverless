<!--
title: serverless deploy function
description: Update one Lambda function's code and configuration without CloudFormation with serverless deploy function, for fast development loops.
short_title: deploy function
keywords:
  [
    'serverless deploy function',
    'Serverless Framework CLI',
    'update Lambda function code',
    'deploy single function',
    'serverless deploy -f',
  ]
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/aws/cli-reference/deploy-function)

<!-- DOCS-SITE-LINK:END -->

# serverless deploy function

`serverless deploy function` updates one deployed Lambda function's code and configuration directly through the Lambda API, without CloudFormation, which makes it faster than a full deploy. Use it while developing; use [`serverless deploy`](./deploy.md) for the first deployment, for changes to events or resources, and for staging and production.

```bash
serverless deploy function --function hello
```

`hello` is the function's name under `functions` in `serverless.yml`. The function must already be deployed; otherwise the command stops and asks you to run `serverless deploy` first.

## Options

`serverless deploy function` accepts these options:

| Option            | Alias | Value         | Default                             | Required | Description                                                              |
| ----------------- | ----- | ------------- | ----------------------------------- | -------- | ------------------------------------------------------------------------ |
| `--function`      | `-f`  | function name | none                                | Yes      | Function to deploy, as named under `functions` in `serverless.yml`.      |
| `--stage`         | `-s`  | string        | `provider.stage`, else `dev`        | No       | Stage of the deployed function.                                          |
| `--region`        | `-r`  | string        | `provider.region`, else `us-east-1` | No       | AWS Region of the deployed function.                                     |
| `--aws-profile`   |       | string        | `provider.profile`                  | No       | AWS profile whose credentials the command uses.                          |
| `--config`        | `-c`  | file path     | `serverless.yml`                    | No       | Service configuration file to use.                                       |
| `--update-config` | `-u`  | flag          | off                                 | No       | Update only the function's configuration, without deploying code.        |
| `--force`         |       | flag          | off                                 | No       | Upload the code even when it matches the code the function already runs. |

`serverless deploy function` also accepts the options every command takes: `--param="key=value"` (repeatable), `--org`, `--app`, `--verbose`, `--debug` and `--help` (`-h`).

## What serverless deploy function changes in AWS

`serverless deploy function` packages the one function and then:

1. Uploads the code package to the function with the Lambda API, or points a container image function at its new image. When the code matches what the function runs, it skips the upload and prints `Code did not change. Function deployment skipped.` (`Image did not change. Function deployment skipped.` for a container image function).
2. Updates the function's configuration from `serverless.yml`, unless no setting changed.
3. After an update, waits until the function is active and the update has finished.

The configuration update covers `handler`, `runtime`, `memorySize`, `timeout`, `description`, `environment`, `layers`, `role`, `vpc`, `kmsKeyArn`, `onError`, `snapStart`, and the `command`, `entryPoint` and `workingDirectory` of `image`. When an `environment` value is a CloudFormation reference such as `!Ref` or `!GetAtt`, the function's environment stays as it is and the command prints a warning. Changes to events, IAM statements or `resources` need `serverless deploy`.

`serverless deploy function` doesn't touch the deployment bucket or the CloudFormation stack, and publishes no Lambda version, so [`serverless rollback function`](./rollback-function.md) can't return to code deployed this way. The command is safe to re-run: unchanged code and configuration are skipped.

## How serverless deploy function relates to the stack

After `serverless deploy function`, the function differs from what the CloudFormation stack last deployed. A later `serverless deploy` doesn't undo a configuration change made this way: CloudFormation changes only what differs from the template it deployed last, and when nothing else changed, the deploy is skipped. Running `serverless deploy function` again from the configuration you want puts back the settings that `serverless.yml` sets. It sends `vpc`, `kmsKeyArn`, `description`, `onError` and `snapStart` only when they are set, so removing one of them from `serverless.yml` leaves the deployed value in place: a VPC attached with `serverless deploy function` stays attached after you remove `vpc`.

With `codeStorageMode: reference`, `serverless deploy function` stores the code in Lambda-managed storage. The next `serverless deploy` that runs returns the function to reference mode; when nothing else changed, run `serverless deploy --force`. See [Code Storage Mode](../../../guides/deployment-bucket.md#code-storage-mode-self-managed-lambda-code-storage).

These cases stop the command with an error:

- The function is a [web app](../guide/web-apps.md): `"<name>" is a web app. Deploy it with serverless deploy.`
- The function switches between a handler and a container image: run `serverless deploy`.
- The function isn't deployed yet: run `serverless deploy`.

## Run serverless deploy function in CI

`serverless deploy function` has no prompts of its own. Without a terminal, sign in with `SERVERLESS_ACCESS_KEY` or `SERVERLESS_LICENSE_KEY`; see [Non-interactive use](./README.md#non-interactive-use-ci-and-ai-agents). For deployments from CI, prefer `serverless deploy`, which keeps the stack and the functions in step.

## Output of serverless deploy function

When both the code and the configuration changed, the command prints:

```text
Deploying function "hello" to stage "dev" (us-east-1)

✔ Function code deployed (4s)
✔ Function configuration updated (5s)
```

When no setting changed, the second line is `Function configuration did not change, so the update was skipped.`, followed by a hint to run `serverless deploy`.

## Provided lifecycle events

- `deploy:function:initialize`
- `deploy:function:packageFunction`
- `deploy:function:deploy`

## Examples

### Deploy a function to a specific stage and region

```bash
serverless deploy function --function hello --stage dev --region us-east-1
```

### Update only a function's configuration

```bash
serverless deploy function --function hello --update-config
```

This applies settings such as `timeout` and `memorySize` without uploading code.

### Upload unchanged code again

```bash
serverless deploy function --function hello --force
```

## Related commands

- [`serverless deploy`](./deploy.md) deploys the whole service through CloudFormation.
- [`serverless invoke`](./invoke.md) runs the deployed function.
- [`serverless logs`](./logs.md) shows the function's logs.
