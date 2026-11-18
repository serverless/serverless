<!--
title: serverless login aws
description: Get short-lived AWS credentials from your AWS Console sign-in with serverless login aws, saved to an AWS profile in ~/.aws/config.
short_title: login aws
keywords:
  [
    'serverless login aws',
    'Serverless Framework CLI',
    'AWS Console credentials',
    'aws login',
    'login_session',
    'AWS credentials',
  ]
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/aws/cli-reference/login-aws)

<!-- DOCS-SITE-LINK:END -->

# serverless login aws

`serverless login aws` signs you in to AWS in the browser with your AWS Management Console credentials (root user, IAM user or federated identity) and configures an AWS profile with short-lived credentials, the same way `aws login` does in the AWS CLI. Use it when you have no access keys on this machine; use [`serverless login aws sso`](./login-aws-sso.md) if you sign in through IAM Identity Center, and [`serverless login`](./login.md) for the Serverless Framework Dashboard.

```bash
serverless login aws
```

The command needs a terminal and a browser on the same machine, and works inside or outside a service directory. It doesn't need a Dashboard sign-in.

## Options

`serverless login aws` accepts these options:

| Option          | Alias | Value       | Default                        | Required | Description                                                                                                                                                                    |
| --------------- | ----- | ----------- | ------------------------------ | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `--aws-profile` |       | string      | `default`                      | No       | AWS profile to configure in `~/.aws/config`.                                                                                                                                   |
| `--region`      | `-r`  | Region code | `AWS_REGION`, else `us-east-1` | No       | AWS Region of the sign-in endpoint. When given, it's also saved as the profile's `region`; when not, a `region` already set stays, and a profile without one gets this Region. |

The command also accepts `--verbose`, `--debug` and `--help` (`-h`).

## Prerequisites for serverless login aws

- The IAM identity you sign in with has the `SignInLocalDevelopmentAccess` AWS managed policy, or a policy that allows the same AWS Sign-In actions. A root user needs none. See [Login for AWS local development using console credentials](https://docs.aws.amazon.com/cli/latest/userguide/cli-configure-sign-in.html).
- A terminal: without one (CI, a pipe, an AI agent) the command stops with ``The `login aws` command requires an interactive environment (TTY) to authenticate.`` In CI, give the Framework AWS credentials another way, such as the `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY` environment variables or a resolver: see [which credentials a deploy uses](../guide/credentials.md#which-credentials-a-deploy-uses).

## Files serverless login aws writes

After you sign in, the command writes two files:

- **The credential cache**: `~/.aws/login/cache/<hash>.json`, readable only by your user. It holds the temporary credentials and the refresh token, in the AWS CLI's format.
- **The AWS config file**: `~/.aws/config`, or the file `AWS_CONFIG_FILE` names. In the profile's section (`[default]` or `[profile <name>]`) it sets `login_session` to your identity's ARN and, as described for `--region`, `region`:

```ini
[profile my-dev]
login_session = arn:aws:iam::123456789012:user/jane
region = us-east-1
```

The command doesn't write `~/.aws/credentials` or the Framework's `~/.serverlessrc`.

## Use the profile with the Framework

The Framework reads the profile through the AWS SDK. A profile other than `default` must be selected, as for any profile: with `--aws-profile`, `provider.profile` in `serverless.yml`, or `AWS_PROFILE`. See [which credentials a deploy uses](../guide/credentials.md#which-credentials-a-deploy-uses).

```bash
serverless deploy --aws-profile my-dev
```

Use a profile that holds no access keys, role or SSO settings: the AWS SDK uses those before `login_session`.

The AWS CLI and SDKs refresh the cached credentials every 15 minutes. The session lasts up to the session duration of the IAM principal, at most 12 hours; after that, run `serverless login aws` again.

## Run serverless login aws again

Running the command again for the same identity refreshes the credential cache and rewrites the same values. If the profile already uses a different `login_session`, the command asks before it overwrites it:

```text
Profile my-dev is already configured to use session arn:aws:iam::123456789012:user/jane.
Do you want to overwrite it to use arn:aws:iam::123456789012:user/admin instead?
```

Answering **No** keeps the profile as it is; the new credentials are still cached.

## Output of serverless login aws

The command opens the sign-in page in your default browser (with `--verbose` it also prints the URL; if the browser can't be opened, it prints the URL to copy) and waits up to 5 minutes. On success it prints:

```text
✔ Successfully logged in. Saved session arn:aws:iam::123456789012:user/jane to profile "my-dev".
```

After 5 minutes without a sign-in it stops with `Login timed out. Please try again.`

## Examples

### Configure the default profile

```bash
serverless login aws
```

### Configure a named profile and Region

```bash
serverless login aws --aws-profile my-dev --region eu-central-1
```

## Related commands

- [`serverless login aws sso`](./login-aws-sso.md) signs in through IAM Identity Center.
- [`serverless login`](./login.md) signs in to the Serverless Framework Dashboard.
- [AWS credentials](../guide/credentials.md) covers every other way to give the Framework AWS credentials.
