<!--
title: serverless remove
description: Delete a deployed service's CloudFormation stack, deployment artifacts and ECR repository from one stage and region with serverless remove.
short_title: remove
keywords:
  [
    'serverless remove',
    'Serverless Framework CLI',
    'delete CloudFormation stack',
    'remove AWS Lambda service',
    'tear down stage',
  ]
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/aws/cli-reference/remove)

<!-- DOCS-SITE-LINK:END -->

# serverless remove

`serverless remove` deletes a deployed service from one stage and region: its CloudFormation stack with every resource in it, its deployment artifacts in the deployment bucket, and its ECR repository. Use it to tear down a stage you no longer need. To go back to an earlier deployment instead, use [`serverless rollback`](./rollback.md).

```bash
serverless remove --stage dev --region us-east-1
```

Without `--stage` and `--region`, the command removes the stage in `provider.stage` and `provider.region`, or stage `dev` in `us-east-1`.

**Warning:** `serverless remove` deletes the stack's resources, including stateful ones such as DynamoDB tables and S3 buckets defined under `resources`, unless they have a [`DeletionPolicy`](https://docs.aws.amazon.com/AWSCloudFormation/latest/TemplateReference/aws-attribute-deletionpolicy.html) of `Retain`. It doesn't ask for confirmation.

## Options

`serverless remove` accepts these options:

| Option          | Alias | Value     | Default                             | Required | Description                                               |
| --------------- | ----- | --------- | ----------------------------------- | -------- | --------------------------------------------------------- |
| `--stage`       | `-s`  | string    | `provider.stage`, else `dev`        | No       | Stage to remove.                                          |
| `--region`      | `-r`  | string    | `provider.region`, else `us-east-1` | No       | AWS Region of that stage.                                 |
| `--aws-profile` |       | string    | `provider.profile`                  | No       | AWS profile whose credentials the command uses.           |
| `--config`      | `-c`  | file path | `serverless.yml`                    | No       | Service configuration file to use.                        |
| `--verbose`     |       | flag      | off                                 | No       | Print each CloudFormation stack event during the removal. |

`serverless remove` also accepts the options every command takes: `--param="key=value"` (repeatable), `--org`, `--app`, `--debug` and `--help` (`-h`). For an AWS SAM or CloudFormation project, it takes `--stack` and `--bucket`; see [AWS SAM and CloudFormation](../../../guides/sam.md).

## What serverless remove deletes

`serverless remove` does this, in order:

1. Deletes the service's objects under `<deploymentPrefix>/<service>/<stage>/` in the deployment bucket (in the shared or stack-owned bucket, their earlier object versions too), and the stage's Dev Mode payloads. Deleting earlier versions needs the `s3:ListBucketVersions` permission. Without it, the command deletes only the current objects, so in a versioned bucket the earlier versions stay.
2. Deletes the CloudFormation stack `<service>-<stage>` (or `provider.stackName`) and waits for the deletion to finish. A deployment bucket that the stack owns is deleted with it.
3. Deletes the ECR repository `serverless-<service>-<stage>` and its images, when the service has one.

Before the stack is deleted, the command also removes the base path mappings and web app aliases of custom domains set in `provider.domain` or `provider.domains`; after it, it deletes the log groups of [web apps](../guide/web-apps.md).

`serverless remove` keeps:

- the region's shared deployment bucket, which other services use, and a bucket set in `provider.deploymentBucket`;
- resources with `DeletionPolicy: Retain`;
- Lambda@Edge functions of `cloudFront` events: the command prints a reminder to delete them yourself after the CloudFront distribution's removal has propagated.

After a removal has finished, a second `serverless remove` finds no stack and treats the stack deletion as complete.

## Run serverless remove in CI

`serverless remove` asks no confirmation and has no prompts of its own, so it runs unattended. In CI, sign in with `SERVERLESS_ACCESS_KEY` or `SERVERLESS_LICENSE_KEY`; see [Non-interactive use](./README.md#non-interactive-use-ci-and-ai-agents). Pass `--stage` explicitly, so the command removes the stage you intend.

## Output of serverless remove

```text
Removing "my-service" from stage "dev" (us-east-1)

✔ Service my-service has been successfully removed (28s)
```

## Provided lifecycle events

- `remove:remove`

## Examples

### Remove a preview stage

```bash
serverless remove --stage pr-123
```

This removes the stack `my-service-pr-123` in the region from `provider.region`, or `us-east-1`.

### Remove a stage and print each stack event

```bash
serverless remove --stage dev --region us-east-1 --verbose
```

## Related commands

- [`serverless deploy`](./deploy.md) deploys the service again.
- [`serverless info`](./info.md) shows what is deployed in a stage before you remove it.
- [Deployment bucket](../../../guides/deployment-bucket.md) explains the shared bucket that `serverless remove` keeps.
