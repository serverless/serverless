<!--
title: serverless package
description: Build a service's code packages and CloudFormation templates without deploying, with serverless package, to inspect them or deploy them later.
short_title: package
keywords:
  [
    'serverless package',
    'Serverless Framework CLI',
    'package AWS Lambda',
    'CloudFormation template',
    'serverless package --package',
  ]
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/aws/cli-reference/package)

<!-- DOCS-SITE-LINK:END -->

# serverless package

`serverless package` builds everything a deployment needs, the code packages and the CloudFormation templates, into `.serverless` without deploying it. Use it to inspect what would be deployed, or to build once in CI and deploy the same package later with `serverless deploy --package`. [`serverless deploy`](./deploy.md) runs the same packaging step itself.

```bash
serverless package
```

## Options

`serverless package` accepts these options:

| Option              | Alias | Value     | Default                             | Required | Description                                                                                          |
| ------------------- | ----- | --------- | ----------------------------------- | -------- | ---------------------------------------------------------------------------------------------------- |
| `--stage`           | `-s`  | string    | `provider.stage`, else `dev`        | No       | Stage to package for.                                                                                |
| `--region`          | `-r`  | string    | `provider.region`, else `us-east-1` | No       | AWS Region to package for.                                                                           |
| `--aws-profile`     |       | string    | `provider.profile`                  | No       | AWS profile whose credentials the command uses.                                                      |
| `--config`          | `-c`  | file path | `serverless.yml`                    | No       | Service configuration file to use.                                                                   |
| `--package`         | `-p`  | directory | `package.path`, else `.serverless`  | No       | Directory to write the package to, relative to the current working directory. Replaced on every run. |
| `--minify-template` |       | flag      | off                                 | No       | Write the compiled CloudFormation template without whitespace.                                       |

`serverless package` also accepts the options every command takes: `--param="key=value"` (repeatable), `--org`, `--app`, `--verbose`, `--debug` and `--help` (`-h`).

The `--package` directory is deleted and written again on every run, so the command rejects the service directory itself and any directory that contains it. Use a dedicated directory inside the service, such as `.serverless-package`, or outside it, such as `../artifacts`.

## Files that serverless package writes

`serverless package` empties `.serverless` (keeping a Dev Mode session's `dev/` folder) and writes:

- the code packages: `<service>.zip`, or `<function>.zip` per function with `package.individually`, and `<layer>.zip` per layer;
- `cloudformation-template-create-stack.json`, the template that creates the stack;
- `cloudformation-template-update-stack.json`, the full compiled template;
- `serverless-state.json`, the resolved service that `serverless deploy --package` reads.

With `--package` or `package.path`, these files are moved from `.serverless` to that directory. To change what goes into the code packages, see [Packaging](../guide/packaging.md).

## AWS access during serverless package

`serverless package` needs AWS credentials, though it deploys nothing. Unless the service sets `provider.deploymentBucket` or uses the legacy in-stack deployment bucket, it looks up the region's shared deployment bucket, and creates the bucket and its SSM parameter when they don't exist yet. See [AWS Credentials Requirement for Packaging](../guide/packaging.md#aws-credentials-requirement-for-packaging) and [Deployment bucket](../../../guides/deployment-bucket.md).

`serverless package` is safe to re-run, and has no prompts of its own. In CI, sign in with `SERVERLESS_ACCESS_KEY` or `SERVERLESS_LICENSE_KEY`; see [Non-interactive use](./README.md#non-interactive-use-ci-and-ai-agents).

## Output of serverless package

```text
Packaging "my-service" for stage "dev" (us-east-1)

✔ Service packaged (2s)
```

## Provided lifecycle events

- `package:cleanup`
- `package:initialize`
- `package:setupProviderConfiguration`
- `package:createDeploymentArtifacts`
- `package:compileLayers`
- `package:compileFunctions`
- `package:compileEvents`
- `package:finalize`

## Examples

### Package for a specific stage and region

```bash
serverless package --stage prod --region eu-central-1
```

### Build a package in CI and deploy it in a later step

```bash
serverless package --stage prod --region eu-central-1 --package ./artifacts
```

```bash
serverless deploy --stage prod --region eu-central-1 --package ./artifacts
```

The first command writes the package to `./artifacts`; the second, run later from the same service directory with the same stage, region and AWS account, deploys it without packaging again. See [Run serverless deploy in CI](./deploy.md#run-serverless-deploy-in-ci).

## Related commands

- [`serverless deploy`](./deploy.md) packages and deploys the service.
- [`serverless print`](./print.md) shows the resolved `serverless.yml` without packaging.
- [`serverless diff`](./diff.md) compares a package with the deployed stack.
