<!--
title: serverless reconcile
description: Mark billable service instances whose CloudFormation stacks were deleted outside serverless remove as removed, with serverless reconcile.
short_title: reconcile
keywords:
  [
    'serverless reconcile',
    'Serverless Framework CLI',
    'billable instances',
    'instance credits',
    'deleted CloudFormation stack',
  ]
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/aws/cli-reference/reconcile)

<!-- DOCS-SITE-LINK:END -->

# serverless reconcile

`serverless reconcile` compares your org's open billable instances with the AWS CloudFormation stacks in the AWS account of the credentials it runs with, and reports every instance whose stack was deleted as removed, so it stops counting toward your usage. [`serverless remove`](./remove.md) reports a removal itself; use `serverless reconcile` after stacks were deleted another way, such as in the AWS console or by a custom workflow. The command works on the whole AWS account, not one service: run it from any directory, once per AWS account.

```bash
serverless reconcile
```

The command prints how many instances it reconciled:

```text
✔ Successfully reconciled 3 instances for my-org org in AWS Account 123456789012.

To view your org's billable instances for the current month, run the "serverless usage" command.

If you have any questions about your usage, please contact support@serverless.com.
```

When every instance still has its stack, it prints `No instances to reconcile for my-org org in AWS Account 123456789012.`

## Options

`serverless reconcile` accepts these options:

| Option          | Alias | Value   | Default                                                                | Required | Description                             |
| --------------- | ----- | ------- | ---------------------------------------------------------------------- | -------- | --------------------------------------- |
| `--org`         |       | string  | The service's `org`, else `SERVERLESS_ORG_NAME`, else your default org | No       | Org whose instances to reconcile.       |
| `--aws-profile` |       | string  | The AWS SDK's default credentials                                      | No       | AWS profile whose account to reconcile. |
| `--help`        | `-h`  | boolean | `false`                                                                | No       | Show the command's help.                |

## How serverless reconcile decides

`serverless reconcile` runs these steps:

1. Looks up the AWS account ID of the credentials.
2. Reads the org's open billable instances whose CloudFormation stack is in that account.
3. Lists the CloudFormation stacks in each AWS Region those instances' stacks are in, three Regions at a time.
4. Reports each instance whose stack no longer exists, or is `DELETE_COMPLETE`, as removed, in batches of 100.

An instance in a Region whose stacks can't be listed is skipped, and the command prints a warning naming the Region. If a batch fails after earlier batches succeeded, the command prints how many instances it reconciled and asks you to run it again; instances already reconciled aren't processed twice.

To view the instances that remain, run [`serverless usage`](./usage.md).

## Reconcile several AWS accounts

`serverless reconcile` reconciles only the AWS account of its credentials. For stacks in several accounts, run it once per account, with that account's credentials:

```bash
serverless reconcile --aws-profile production
```

Inside a service directory whose provider credentials are set in the Serverless Framework Dashboard, the command uses those credentials.

## AWS Region for the account lookup

`serverless reconcile` looks up the AWS account ID in `us-east-1` by default. Where that Region is blocked, or VPC endpoints exist only in certain Regions, set the `AWS_REGION` environment variable:

```bash
AWS_REGION=eu-central-1 serverless reconcile
```

## Side effects and CI use

- `serverless reconcile` changes no AWS resources: it calls `sts:GetCallerIdentity` and `cloudformation:ListStacks`. It updates the org's instance records in the Serverless Framework Dashboard, and is safe to re-run.
- The command needs a signed-in user. It does not prompt otherwise, so in CI set the `SERVERLESS_ACCESS_KEY` or `SERVERLESS_LICENSE_KEY` environment variable.
- In an account with many stacks the command can take a few minutes.

## Examples

### Reconcile the instances of a specific org

```bash
serverless reconcile --org my-org
```

## Related commands

- [`serverless usage`](./usage.md) lists your org's billable instances.
- [`serverless remove`](./remove.md) removes a service and reports the removal.
