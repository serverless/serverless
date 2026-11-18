<!--
title: serverless deploy
description: Deploy a whole service to AWS through CloudFormation with serverless deploy, and the options for stages, packages, CI and S3 uploads.
short_title: deploy
keywords:
  [
    'serverless deploy',
    'Serverless Framework CLI',
    'deploy AWS Lambda',
    'CloudFormation deployment',
    'serverless deploy --stage',
    'serverless deploy --package',
  ]
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/aws/cli-reference/deploy)

<!-- DOCS-SITE-LINK:END -->

# serverless deploy

`serverless deploy` packages a service and deploys it to AWS as one CloudFormation stack: its Lambda functions, events, IAM roles and the resources in `serverless.yml`. Run it after a change to events, IAM, resources or other stack configuration, and in CI. To update one function's code and configuration during development, without CloudFormation, use [`serverless deploy function`](./deploy-function.md) instead; it doesn't update events, IAM roles or other resources.

```bash
serverless deploy
```

Without `--stage` and `--region`, the command deploys to `provider.stage` and `provider.region` from `serverless.yml`, or to stage `dev` in `us-east-1` when those are not set.

## Options

`serverless deploy` accepts these options:

| Option                              | Alias | Value     | Default                             | Required | Description                                                                                                                                                                                   |
| ----------------------------------- | ----- | --------- | ----------------------------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--stage`                           | `-s`  | string    | `provider.stage`, else `dev`        | No       | Stage to deploy to.                                                                                                                                                                           |
| `--region`                          | `-r`  | string    | `provider.region`, else `us-east-1` | No       | AWS Region to deploy to.                                                                                                                                                                      |
| `--aws-profile`                     |       | string    | `provider.profile`                  | No       | AWS profile whose credentials the command uses.                                                                                                                                               |
| `--config`                          | `-c`  | file path | `serverless.yml`                    | No       | Service configuration file to use (`serverless.yml`, `.yaml`, `.json`, `.js`, `.mjs`, `.cjs` or `.ts`).                                                                                       |
| `--package`                         | `-p`  | directory | `package.path`, else `.serverless`  | No       | Deploy a directory created by [`serverless package`](./package.md), relative to the current working directory, and skip packaging. Without it, the command packages into `.serverless` first. |
| `--verbose`                         |       | flag      | off                                 | No       | Print each CloudFormation stack event during the deployment, and the stack outputs after it.                                                                                                  |
| `--force`                           |       | flag      | off                                 | No       | Deploy even when nothing changed since the latest deployment.                                                                                                                                 |
| `--conceal`                         |       | flag      | off                                 | No       | Print API Gateway API key names without their values.                                                                                                                                         |
| `--aws-s3-accelerate`               |       | flag      | off                                 | No       | Enable [S3 Transfer Acceleration](https://docs.aws.amazon.com/AmazonS3/latest/userguide/transfer-acceleration.html) on the service stack's own deployment bucket and upload through it.       |
| `--no-aws-s3-accelerate`            |       | flag      | none                                | No       | Suspend S3 Transfer Acceleration on the service stack's own deployment bucket.                                                                                                                |
| `--enable-legacy-deployment-bucket` |       | flag      | off                                 | No       | Use a deployment bucket created and owned by the service's stack instead of the region's shared deployment bucket.                                                                            |
| `--minify-template`                 |       | flag      | off                                 | No       | Write the compiled CloudFormation template in `.serverless` without whitespace.                                                                                                               |
| `--enforce-hash-update`             |       | flag      | off                                 | No       | Override every function's description so each one publishes a new version. Only for [migrating the Lambda hashing algorithm](../guide/functions.md#lambda-hashing-algorithm-migration).       |

`serverless deploy` also accepts the options every command takes: `--param="key=value"` (repeatable) for the `${param:...}` variable source, `--org` and `--app` for the Dashboard, `--debug` and `--help` (`-h`).

The two S3 Transfer Acceleration flags change the bucket that the service's stack owns, which the service uses with `--enable-legacy-deployment-bucket`, `provider.enableLegacyDeploymentBucket: true`, the `ENABLE_LEGACY_DEPLOYMENT_BUCKET` environment variable, or a stack deployed with such a bucket before. They need the `s3:PutAccelerateConfiguration` permission, and AWS charges for accelerated transfers. With `provider.deploymentBucket` set, `--aws-s3-accelerate` stops the deployment with an error.

`serverless deploy` has no `--function` option; to deploy one function, run [`serverless deploy function`](./deploy-function.md). For an AWS SAM or CloudFormation project, `serverless deploy` takes `--stack` and `--bucket`; see [AWS SAM and CloudFormation](../../../guides/sam.md).

## What serverless deploy changes in AWS

A run of `serverless deploy` does this, in order:

1. Packages the service into `.serverless`, unless `--package` or `package.path` names an existing package.
2. Looks up the CloudFormation stack `<service>-<stage>` (or `provider.stackName`). When it doesn't exist yet, the stack is created in step 5 with the full template; with a stack-owned deployment bucket, it is created here, with just the bucket.
3. Compares the compiled template, the service state and every code package with the latest deployment stored in the deployment bucket. When all of them match and the last deploy completed (it didn't fail or roll back), it stops and prints `No changes to deploy. Deployment skipped.`
4. Uploads the template, the state file and the code packages to a new folder `<deploymentPrefix>/<service>/<stage>/<timestamp>/` in the deployment bucket.
5. Updates the stack, directly or through a change set (`provider.deploymentMethod`; see [Deployment method](../guide/deploying.md#deployment-method)), and waits for CloudFormation to finish.
6. Deletes the oldest deployment folders, keeping the newest `provider.deploymentBucket.maxPreviousDeploymentArtifacts` (default `5`). With `codeStorageMode: reference` it keeps them all; [`serverless prune --includeArtifacts`](./prune.md) removes them.

Unless `provider.versionFunctions` is `false`, each deployed function change publishes a new Lambda version. The kept deployment folders are what [`serverless deploy list`](./deploy-list.md) shows and [`serverless rollback`](./rollback.md) restores. For the bucket itself, see [Deployment bucket](../../../guides/deployment-bucket.md).

`serverless deploy` is safe to re-run: with no changes the deployment is skipped, and with changes the stack is updated to match `serverless.yml`.

## Run serverless deploy in CI

In CI, and whenever no one is at a terminal, the CLI skips sign-in prompts: a run without credentials stops with a message that names the keys to set. Set `SERVERLESS_ACCESS_KEY` or `SERVERLESS_LICENSE_KEY` and provide AWS credentials; see [Deploy in your own CI/CD](../../../guides/dashboard/cicd/running-in-your-own-cicd.md) for which key to use, and [Non-interactive use](./README.md#non-interactive-use-ci-and-ai-agents).

To build once and deploy the same package, run `serverless package --package <dir>` in one step and `serverless deploy --package <dir>` in a later one:

- Run both from the service directory: `serverless deploy --package` still loads `serverless.yml`, then deploys the templates, state file and code packages from `<dir>`.
- Carry `<dir>` between the steps at the same path relative to the working directory.
- Use the same stage, region and AWS account in both steps. The package names the deployment bucket of that account and region.

`--force` works with `--package` and deploys the package even when it matches the latest deployment.

`SLS_AWS_MONITORING_FREQUENCY` sets how often, in milliseconds, the command polls CloudFormation for stack events (default `5000`):

```bash
SLS_AWS_MONITORING_FREQUENCY=10000 serverless deploy
```

## Output of serverless deploy

A successful deployment prints the stack name, then the service's endpoints and functions (trimmed):

```text
Deploying "my-service" to stage "dev" (us-east-1)

✔ Service deployed to stack my-service-dev (45s)

endpoint: GET - https://abc123example.execute-api.us-east-1.amazonaws.com/hello
functions:
  hello: my-service-dev-hello (1.2 kB)
```

With `--verbose`, the output also has a `Stack Outputs:` section. [`serverless info`](./info.md) prints the same summary for a deployed service without deploying.

## Provided lifecycle events

- `deploy:deploy`
- `deploy:finalize`

## Examples

### Deploy to a specific stage and region

```bash
serverless deploy --stage prod --region eu-central-1
```

This deploys the stack `my-service-prod` in `eu-central-1`, separate from the stacks of other stages.

### Deploy a package built earlier

```bash
serverless deploy --package ./artifacts
```

This skips packaging and deploys the contents of `./artifacts`, created with `serverless package --package ./artifacts`.

### Deploy when nothing changed

```bash
serverless deploy --force
```

This uploads a new deployment and updates the stack even when the package matches the latest deployment.

## Related commands

- [`serverless package`](./package.md) builds the package without deploying it.
- [`serverless diff`](./diff.md) shows what a deployment would change.
- [`serverless info`](./info.md) prints the deployed service's endpoints and functions.
- [`serverless remove`](./remove.md) deletes the deployed stack.
