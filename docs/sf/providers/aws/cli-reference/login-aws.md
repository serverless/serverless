<!--
title: Serverless Framework Commands - Login AWS
description: Login to AWS using browser-based authentication.
short_title: Commands - Login AWS
keywords:
  [
    'Serverless',
    'Framework',
    'login',
    'AWS',
    'authentication',
    'credentials',
  ]
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/aws/cli-reference/login-aws)

<!-- DOCS-SITE-LINK:END -->

# AWS - Login

The `login aws` command authenticates with AWS using browser-based authentication. This generates short-lived credentials backed by your AWS Console session, without requiring the AWS CLI.

```bash
serverless login aws
```

## Options

- `--aws-profile` - AWS profile name to configure (defaults to `default`)
- `--region` or `-r` - AWS region to configure

## Examples

Login and configure the default profile:

```bash
serverless login aws
```

Login with a specific profile and region:

```bash
serverless login aws --aws-profile myprofile --region us-west-2
```

## How It Works

1. The command opens your browser to the AWS sign-in page
2. After authenticating with your AWS Console credentials, you're redirected back
3. Temporary credentials are cached in `~/.aws/login/cache/`
4. Your AWS config file (`~/.aws/config`) is updated with a `login_session` reference

> **Note:** Sessions expire after 12 hours. Run `serverless login aws` again to refresh your credentials.
