<!--
title: serverless usage
description: Show your org's Instance Credit usage for the current month with serverless usage, and export the billable instances to a CSV file.
short_title: usage
keywords:
  [
    'serverless usage',
    'Serverless Framework CLI',
    'Instance Credits',
    'billable instances',
    'Serverless Framework billing',
  ]
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/aws/cli-reference/usage)

<!-- DOCS-SITE-LINK:END -->

# serverless usage

`serverless usage` shows how many Instance Credits your org has used this month, that is, how many billable Service Instances it has, and saves the list of those instances to `<org>-instances.csv` in the current directory. It reads the usage from the Serverless Framework Dashboard and changes nothing in AWS or in the Dashboard. To remove instances whose CloudFormation stacks no longer exist from the list, run [`serverless reconcile`](./reconcile.md).

```bash
serverless usage
```

The command works inside or outside a service directory. It needs a Dashboard sign-in or key ([`serverless login`](./login.md)) and AWS credentials: it resolves them as `serverless deploy` does before it reads the usage.

## Options

`serverless usage` accepts these options:

| Option          | Alias | Value    | Default                                                                      | Required | Description                                         |
| --------------- | ----- | -------- | ---------------------------------------------------------------------------- | -------- | --------------------------------------------------- |
| `--org`         |       | org name | `org` in `serverless.yml`, else `SERVERLESS_ORG_NAME`, else your default org | No       | Org whose usage to show.                            |
| `--aws-profile` |       | string   | `provider.profile`, else the AWS credential chain                            | No       | AWS profile whose credentials the command resolves. |

The command also accepts `--verbose`, `--debug` and `--help` (`-h`). With `SERVERLESS_ACCESS_KEY` or a License Key, the command shows the usage of the key's org.

## Billable instances file

When the org has at least one billable instance, `serverless usage` writes `<org>-instances.csv` to the current directory, replacing a file of that name from an earlier run. With no billable instances it writes no file. The file has this header and one row per instance:

```text
Instance ID,Age (Days),Type,User
```

- **Instance ID**: the CloudFormation stack ID for an instance deployed with Serverless Framework v4; for an instance the Dashboard manages only, the Dashboard's instance ID, built from the service, region and stage names.
- **Age (Days)**: the number of days the instance has existed. An instance counts toward a month only after it has existed for more than 10 days that month ([pricing](../../../guides/upgrading-v4.md#pricing)).
- **Type**: `CLI` (deployed with Serverless Framework v4), `Dashboard` (managed by the Dashboard), or `CLI + Dashboard`.
- **User**: the user or License Key that deployed the instance, as `user:<name>` or `license:<label>`; empty when that isn't known.

## Run serverless usage without a terminal

Without a sign-in, `serverless usage` in a terminal shows the sign-in menu of [`serverless login`](./login.md); without a terminal (CI, a script, an AI agent) it stops with an error that names `SERVERLESS_ACCESS_KEY` and `SERVERLESS_LICENSE_KEY`. Set one of them, or sign in first. The command never prompts otherwise, and re-running it only rewrites the CSV file.

## Output of serverless usage

The command prints the count and the file name:

```text
The acme org used 18 Instance Credits this month.

A list of billable instances has been saved to acme-instances.csv in the current directory.

If you have any questions about your usage, please contact support@serverless.com.
```

## Examples

### Show the usage of your default org

```bash
serverless usage
```

### Show the usage of another org

```bash
serverless usage --org my-org
```

## Related commands

- [`serverless reconcile`](./reconcile.md) removes instances whose stacks were deleted outside the Framework.
- [`serverless remove`](./remove.md) removes a service instance.
- [`serverless login`](./login.md) signs in to the Dashboard.
