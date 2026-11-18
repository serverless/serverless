<!--
title: serverless login aws sso
description: Sign in to AWS IAM Identity Center (AWS SSO) with serverless login aws sso, using an SSO profile from ~/.aws/config and the AWS CLI token cache.
short_title: login aws sso
keywords:
  [
    'serverless login aws sso',
    'Serverless Framework CLI',
    'AWS SSO',
    'IAM Identity Center',
    'aws sso login',
    'AWS credentials',
  ]
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/aws/cli-reference/login-aws-sso)

<!-- DOCS-SITE-LINK:END -->

# serverless login aws sso

`serverless login aws sso` signs you in to AWS IAM Identity Center (AWS SSO) in the browser for an SSO profile that is already in `~/.aws/config`, and caches the token where the AWS CLI and SDKs read it, as `aws sso login` does. Use it when your organization gives you AWS access through IAM Identity Center; use [`serverless login aws`](./login-aws.md) to sign in with AWS Console credentials instead, and [`serverless login`](./login.md) for the Serverless Framework Dashboard.

```bash
serverless login aws sso --aws-profile my-dev
```

The command needs a terminal and a browser on the same machine, and works inside or outside a service directory. It doesn't need a Dashboard sign-in.

## Options

`serverless login aws sso` accepts these options:

| Option          | Alias | Value  | Default                     | Required | Description                                                                         |
| --------------- | ----- | ------ | --------------------------- | -------- | ----------------------------------------------------------------------------------- |
| `--aws-profile` |       | string | `default`                   | No       | AWS profile whose SSO settings to read.                                             |
| `--sso-session` |       | string | The profile's `sso_session` | No       | `[sso-session]` section to sign in to; takes precedence over the profile's setting. |

The command also accepts `--verbose`, `--debug` and `--help` (`-h`).

## SSO configuration that serverless login aws sso reads

`serverless login aws sso` reads `~/.aws/config`, or the file `AWS_CONFIG_FILE` names, and doesn't change it. Create the configuration once with the AWS CLI:

```bash
aws configure sso
```

That command writes an `[sso-session]` section and a profile that uses it:

```ini
[sso-session my-company]
sso_start_url = https://my-company.awsapps.com/start
sso_region = us-east-1
sso_registration_scopes = sso:account:access

[profile my-dev]
sso_session = my-company
sso_account_id = 123456789012
sso_role_name = DeveloperAccess
region = us-west-2
```

From the `[sso-session]` section the command reads `sso_start_url`, `sso_region` and `sso_registration_scopes` (comma-separated, default `sso:account:access`). The AWS SDK then uses the profile's `sso_account_id` and `sso_role_name` to get credentials for a deploy.

A profile in the legacy format, without an `[sso-session]` section, works too; the command reads `sso_start_url` and `sso_region` from the profile and uses the `sso:account:access` scope:

```ini
[profile my-dev]
sso_start_url = https://my-company.awsapps.com/start
sso_region = us-east-1
sso_account_id = 123456789012
sso_role_name = DeveloperAccess
region = us-west-2
```

## Files serverless login aws sso writes

The command writes two files in `~/.aws/sso/cache/`, both readable only by your user and named as the AWS CLI names them:

- **The client registration**: the OIDC client the command registers with IAM Identity Center. Later runs reuse it until it expires.
- **The token**: the SSO access token, its expiry and the refresh token.

The AWS CLI and SDKs read the same cache, so a token from `aws sso login` works for the Framework and a token from `serverless login aws sso` works for the AWS CLI, until it expires. The command doesn't write `~/.aws/config`, `~/.aws/credentials` or the Framework's `~/.serverlessrc`.

## Use the profile with the Framework

Select the SSO profile as any other profile: with `--aws-profile`, `provider.profile` in `serverless.yml`, or `AWS_PROFILE`. See [which credentials a deploy uses](../guide/credentials.md#which-credentials-a-deploy-uses).

```bash
serverless deploy --aws-profile my-dev
```

When the token expires, commands stop with an error that names `serverless login aws sso`; run it again. Re-running the command at any time is safe: it replaces the cached token.

## Errors from serverless login aws sso

- ``The `login aws sso` command requires an interactive environment (TTY) to authenticate.``: the command ran without a terminal (CI, a pipe, an AI agent). Run it in a terminal.
- `No SSO configuration found. Please run 'aws configure sso' first to set up SSO for profile "...".` (or `for session "..."` when an SSO session is used): the profile has no `sso_session` or `sso_start_url`, or the `[sso-session]` section has no `sso_start_url`. Run `aws configure sso`, or pass the right `--aws-profile` or `--sso-session`.
- `Missing sso_region in SSO configuration. Please run 'aws configure sso' to complete setup.`: add `sso_region` to the `[sso-session]` section or the legacy profile.
- `Login timed out. Please try again.`: the browser sign-in wasn't completed within 5 minutes.

## Output of serverless login aws sso

The command opens the IAM Identity Center authorization page in your default browser (with `--verbose` it also prints the URL; if the browser can't be opened, it prints the URL to copy). On success it prints:

```text
✔ Successfully logged in to AWS SSO (session: my-company).
```

## Examples

### Sign in for the default profile

```bash
serverless login aws sso
```

### Sign in to a named SSO session

```bash
serverless login aws sso --sso-session my-company
```

## Related commands

- [`serverless login aws`](./login-aws.md) signs in with AWS Console credentials.
- [`serverless login`](./login.md) signs in to the Serverless Framework Dashboard.
- [Configuring IAM Identity Center authentication with the AWS CLI](https://docs.aws.amazon.com/cli/latest/userguide/cli-configure-sso.html) explains the SSO settings.
