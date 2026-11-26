<!--
title: Deploying to AWS
description: How serverless deploy, serverless deploy function and serverless deploy --package ship a service to AWS, what each changes, and the settings that affect them.
short_title: Deploying
keywords:
  [
    'Serverless Framework',
    'serverless deploy',
    'deploy function',
    'CloudFormation deployment',
    'deployment bucket',
  ]
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/aws/guide/deploying)

<!-- DOCS-SITE-LINK:END -->

# Deploying to AWS

The Serverless Framework deploys a service to AWS in three ways:

- `serverless deploy` deploys the whole service (functions, events and resources) as one AWS CloudFormation stack. Use it for any change to `serverless.yml`, and in CI/CD.
- `serverless deploy function` updates one function's code and configuration directly, without CloudFormation. Use it for fast iterations during development.
- `serverless deploy --package` deploys artifacts built earlier with `serverless package`.

Run `serverless deploy` in the directory that holds `serverless.yml`:

```bash
serverless deploy
```

The deploy goes to the `dev` stage in `us-east-1` unless `provider.stage` and `provider.region` in `serverless.yml`, or `--stage` and `--region`, say otherwise:

```bash
serverless deploy --stage prod --region eu-central-1
```

It uses the AWS credentials described in [which credentials a deploy uses](./credentials.md#which-credentials-a-deploy-uses). Add `--verbose` to print the CloudFormation progress, and `--config` (or `-c`) to use a configuration file other than `serverless.yml`.

## Deploy the service

`serverless deploy` turns `serverless.yml` into a CloudFormation template and creates or updates the service's stack, named `<service>-<stage>` unless `provider.stackName` is set. When an update fails, CloudFormation rolls the stack back to its previous state, unless `provider.disableRollback` is set.

### How a deploy works

1. The Framework resolves the deployment bucket, which stores the zip files and the compiled template. By default it is a [shared deployment bucket per AWS Region](../../../guides/deployment-bucket.md), created on the first deploy to that Region. A service whose stack already contains a stack-managed deployment bucket (for example, one first deployed with an earlier major version) keeps using it, except inside [Serverless Compose](../../../guides/compose.md), where services always use the shared bucket. `provider.deploymentBucket` sets a bucket of your own.
2. With the legacy stack-managed bucket (`provider.enableLegacyDeploymentBucket: true`) and no stack yet, the Framework creates a stack that holds only the bucket. Otherwise, no such initial stack is created.
3. The Framework packages the functions into zip files (see [Packaging](./packaging.md)), unless `--package` or `package.path` names a directory of artifacts that `serverless package` built earlier (see [Deploying a package](#deploying-a-package)).
4. For [container images](./functions.md#referencing-container-image-as-a-target) built from a local `path`, the Framework creates the service's ECR repository if needed, runs `docker login` against it, and builds and pushes the images.
5. Unless `--force` is passed, the Framework compares the hashes of the compiled CloudFormation template, the service state file and the zip files with those of the newest deployment in the bucket. When all of them match, and no object of that deployment was uploaded after the functions were last updated, the deploy stops here without changing anything.
6. The Framework uploads the zip files and the compiled template to the deployment bucket, under `<deploymentPrefix>/<service>/<stage>/`.
7. CloudFormation creates the stack (first deploy) or updates it with the new template.

By default, each deploy that changes a function's code or configuration publishes a new version of it. `provider.versionFunctions: false` turns that off, and a function's own `versionFunction` overrides the provider setting. Functions with `durableConfig`, `provisionedConcurrency` or `snapStart` are always versioned, and `versionFunction: false` on a function with `durableConfig` stops the deploy with an error. See [Versioning deployed functions](./functions.md#versioning-deployed-functions).

A deploy needs AWS permissions for CloudFormation, for the resources in the stack, and for SSM and S3 to resolve the deployment bucket and upload the artifacts; inside Serverless Compose, also for the state bucket. See [AWS credentials requirement for packaging](./packaging.md#aws-credentials-requirement-for-packaging).

### Deployment method

By default, the Framework updates the stack with [direct updates](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-direct.html). To deploy through [CloudFormation change sets](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-changesets.html) instead, set `provider.deploymentMethod` to `changesets` (allowed values: `direct`, `changesets`; default `direct`):

```yaml
provider:
  name: aws
  deploymentMethod: changesets
```

### Deployment bucket settings

These `provider` settings change where and how the artifacts are stored:

- `deploymentBucket`: a bucket of your own, by `name`, with settings such as `serverSideEncryption`. See the [Deployment Bucket guide](../../../guides/deployment-bucket.md) for every key.
- `deploymentPrefix`: the S3 key prefix of the artifacts. Default `serverless`.
- `deploymentBucket.skipPolicySetup`: don't create the default bucket policy. Applies only to the stack-managed deployment bucket.
- `deploymentBucket.versioning: true`: turn on versioning for the stack-managed deployment bucket. The shared deployment bucket is always versioned.
- `enableLegacyDeploymentBucket: true`: use a deployment bucket created and managed by the service's own stack. The `--enable-legacy-deployment-bucket` flag and the `ENABLE_LEGACY_DEPLOYMENT_BUCKET` environment variable do the same.

`--aws-s3-accelerate` uploads through S3 Transfer Acceleration, which the Framework turns on only for the stack-managed deployment bucket. With `provider.deploymentBucket`, the deploy stops with `S3_TRANSFER_ACCELERATION_ON_EXISTING_BUCKET`; with the shared deployment bucket, the bucket's acceleration setting is not changed.

### AWS SDK for JavaScript v3 for Framework calls

The Framework's own calls to AWS during packaging and deployment (S3 uploads, CloudFormation updates) use the AWS SDK for JavaScript v2 code path by default. To use the v3 code path, set `SLS_AWS_SDK=3` in the environment, on your machine or in the CI pipeline:

```bash
SLS_AWS_SDK=3 serverless deploy
```

Both paths read credentials through the standard AWS credential provider chain. The setting doesn't affect your function code, which uses whatever SDK you bundle or the runtime provides; AWS has [ended support for the v2 SDK](https://aws.amazon.com/blogs/developer/announcing-end-of-support-for-aws-sdk-for-javascript-v2/), so use `@aws-sdk/*` (v3) clients in handlers.

### AWS endpoint settings

The Framework's AWS SDK v3 clients send their requests to the endpoint the AWS SDKs' [service-specific endpoint settings](https://docs.aws.amazon.com/sdkref/latest/guide/feature-ss-endpoints.html) name, when you set one. Use them to deploy to a local emulator such as [AWS Emulator](https://docs.aws.amazon.com/emulator/latest/userguide/what-is-service.html), together with `SLS_AWS_SDK=3`. For an emulator that serves HTTPS with its own certificate, also set `NODE_EXTRA_CA_CERTS` to that certificate's path before you run a command, so Node.js, and with it the Framework, trusts it. The clients read, in this order:

1. `AWS_ENDPOINT_URL_<SERVICE>`, for one service, such as `AWS_ENDPOINT_URL_S3` or `AWS_ENDPOINT_URL_CLOUDFORMATION`.
2. `AWS_ENDPOINT_URL`, for every service.
3. `endpoint_url` in the shared config file (`AWS_CONFIG_FILE`, default `~/.aws/config`), in the `services` section the profile names, then in the profile itself. The profile is the one `AWS_PROFILE` names, else `default`; `provider.profile` and `--aws-profile` choose credentials, not the endpoint.

The calls on the AWS SDK v2 code path, the default described in [AWS SDK for JavaScript v3 for Framework calls](#aws-sdk-for-javascript-v3-for-framework-calls), use AWS's own endpoints and ignore these settings. Set `SLS_AWS_SDK=3` to send them to the configured endpoint too.

| Calls                                                                                                                                                                                                                                                                                     | Endpoint when a setting is present                 |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| Account ID lookup, the `${aws:accountId}`, `${cf:}`, `${ssm:}`, `${s3:}` and `${terraform:outputs:}` variables, the shared deployment bucket, `serverless invoke`, Dev Mode, custom domains                                                                                               | The configured endpoint                            |
| The calls of `serverless deploy` (CloudFormation stacks and change sets, S3 artifact uploads), `deploy list`, `info`, `logs`, `metrics`, `remove`, `rollback` and `diff`, most calls of `deploy function`, `rollback function` and `prune`, and plugins' calls through `provider.request` | AWS's own endpoints, unless `SLS_AWS_SDK=3` is set |

With `SLS_AWS_SDK=3`, `provider.request` serves S3, STS, ECR, CloudFormation, CloudWatch, CloudWatch Logs, Lambda, IAM, API Gateway (REST and HTTP APIs), IoT and Lambda microVMs; a call to another service stops with `AWS_V3_UNSUPPORTED_SERVICE`.

With an endpoint set, each command names it before it starts. With `SLS_AWS_SDK=3`:

```text
Using the configured AWS endpoint https://127.0.0.1:9297
```

Without it, the line adds that the AWS SDK v2 calls go to AWS's own endpoints.

To send one command's requests to AWS's own endpoints while these settings are present, set `AWS_IGNORE_CONFIGURED_ENDPOINT_URLS`:

```bash
AWS_IGNORE_CONFIGURED_ENDPOINT_URLS=true serverless deploy
```

Behind an HTTPS proxy (`HTTPS_PROXY`), AWS SDK v3 requests to a configured endpoint whose host `NO_PROXY` lists go directly to it, such as `https://127.0.0.1:9297` with `NO_PROXY=localhost,127.0.0.1`; all other AWS requests use the proxy as before.

With the `serverless-localstack` plugin, the plugin's endpoint settings apply.

## Deploy a single function

`serverless deploy function` updates one function without touching the CloudFormation stack, which makes it much faster than a full deploy:

```bash
serverless deploy function --function myFunction
```

1. The Framework packages the function into a zip file.
2. It compares the hash of the zip (for an image function, the image digest) with the code hash of the deployed function, and skips the code update when they match, unless `--force` is passed.
3. Otherwise, it uploads the zip directly to the function with the Lambda `UpdateFunctionCode` API, bypassing the deployment bucket and CloudFormation.
4. If the function's configuration (such as memory size, timeout or environment variables) differs from `serverless.yml`, it updates that too. `--update-config` updates only the configuration, without deploying code.

The function must already exist: otherwise the command stops with `FUNCTION_NOT_YET_DEPLOYED`, so deploy the service once with `serverless deploy` first. Changes made this way are not in the stack's template, so use the command during development and keep `serverless deploy` for CI/CD and production. See the [`deploy function` command](../cli-reference/deploy-function.md) for its options.

## Deploying a package

`serverless deploy --package` deploys a directory created earlier with `serverless package`, without packaging again. Build the artifacts once (for example in a CI build step) and deploy them in a later step:

```bash
serverless package --package path-to-package
serverless deploy --package path-to-package
```

The deploy reads the zip files and templates from that directory and uses them to create or update the stack. `package.path` in `serverless.yml` does the same as `--package`. See the [`deploy` command](../cli-reference/deploy.md) for every option.

## Recover a stack in UPDATE_ROLLBACK_FAILED

When a deploy fails and CloudFormation then can't roll back one of the stack's resources, for example a resource changed or deleted outside the stack, the stack stays in `UPDATE_ROLLBACK_FAILED`. Every later `serverless deploy` stops with:

```text
Stack:arn:aws:cloudformation:us-east-1:123456789012:stack/my-service-dev/... is in UPDATE_ROLLBACK_FAILED state and can not be updated.
```

The stack must return to `UPDATE_ROLLBACK_COMPLETE` before it accepts another deploy. Run the commands below with the credentials and Region of the deploy, adding `--region` (and `--profile`) when your AWS CLI defaults differ. Fix what blocks the rollback if you can, then continue the rollback:

```bash
aws cloudformation continue-update-rollback --stack-name my-service-dev
```

If you can't fix it, force the rollback to complete. CloudFormation skips every resource whose rollback failed, including resources in nested stacks, and marks it `Resource skipped during UpdateRollback`:

```bash
aws cloudformation continue-update-rollback --stack-name my-service-dev --force-rollback
```

**Warning:** A skipped resource no longer matches the stack's template. Before the next deploy, check each skipped resource and bring it in line with the stack's current template, the one the rollback restored (`aws cloudformation get-template --stack-name my-service-dev`, or the nested stack's template for a resource in a nested stack), not with the changed `serverless.yml`; run [drift detection](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/detect-drift-resource.html) on it to see the differences. Drift detection covers only [resource types that support it](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/resource-import-supported-resources.html) and only the properties the template sets, so compare other resources with the template yourself. Then run `serverless deploy`. See [Continue rolling back an update](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-continueupdaterollback.html).

## Related pages

- [Packaging](./packaging.md): what goes into the artifacts.
- [Deployment Bucket](../../../guides/deployment-bucket.md): the shared bucket and your own bucket.
- [AWS credentials](./credentials.md): where a deploy's credentials come from.
- [`serverless deploy`](../cli-reference/deploy.md): command options.
