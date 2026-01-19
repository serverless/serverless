<!--
title: Serverless Framework Commands - Login AWS SSO
description: Login to AWS using SSO (IAM Identity Center) authentication.
short_title: Commands - Login AWS SSO
keywords:
  [
    'Serverless',
    'Framework',
    'login',
    'AWS',
    'SSO',
    'IAM Identity Center',
    'authentication',
    'credentials',
  ]
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/aws/cli-reference/login-aws-sso)

<!-- DOCS-SITE-LINK:END -->

# AWS - Login SSO

The `login aws sso` command authenticates with AWS using SSO (IAM Identity Center). This is for users who have configured SSO via `aws configure sso` and want the Serverless Framework to use their SSO session.

```bash
serverless login aws sso
```

## Options

- `--aws-profile` - AWS profile name containing SSO configuration (defaults to `default`)
- `--sso-session` - SSO session name to use (if profile references a session)

## Prerequisites

Before using this command, you must have SSO configured in your `~/.aws/config`. Run:

```bash
aws configure sso
```

This creates the necessary `[sso-session]` and `[profile]` entries.

## Examples

Login using the default profile's SSO configuration:

```bash
serverless login aws sso
```

Login using a specific profile:

```bash
serverless login aws sso --aws-profile mycompany-dev
```

## How It Works

1. The command reads SSO configuration from `~/.aws/config`
2. Opens your browser to the SSO authorization page
3. After authenticating, tokens are cached in `~/.aws/sso/cache/`
4. These tokens are 100% compatible with AWS CLI - both tools share the same cache

## AWS Config Format

**Modern format (recommended):**

```ini
[sso-session mycompany]
sso_start_url = https://mycompany.awsapps.com/start
sso_region = us-east-1
sso_registration_scopes = sso:account:access

[profile mycompany-dev]
sso_session = mycompany
sso_account_id = 123456789012
sso_role_name = DeveloperAccess
region = us-west-2
```

**Legacy format:**

```ini
[profile mycompany-dev]
sso_start_url = https://mycompany.awsapps.com/start
sso_region = us-east-1
sso_account_id = 123456789012
sso_role_name = DeveloperAccess
region = us-west-2
```

## AWS CLI Compatibility

The Serverless Framework SSO login uses the same token cache (`~/.aws/sso/cache/`) as AWS CLI. This means:

- Your existing SSO sessions work seamlessly with the Serverless Framework
- No need to log in separately for each tool
- One consent prompt covers both tools
