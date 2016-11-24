<!--
title: Serverless Framework Commands - AWS Lambda - Setup
menuText: Setup
menuOrder: 10
description: Easily set up AWS profiles.
layout: Doc
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->
### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/aws/cli-reference/setup)
<!-- DOCS-SITE-LINK:END -->

# Setup

This plugin helps you with the setup of your AWS profiles.

```bash
serverless setup --provider provider --key key --secret secret
```

## Options

- `--provider` or `-p` The provider (in this case `aws`). **Required**.
- `--key` or `-k` The `aws_access_key_id`. **Required**.
- `--secret` or `-s` The `aws_secret_access_key`. **Required**.
- `--profile` or `-n` The name of the profile which should be created.

## Provided lifecycle events

- `setup:setup`

## Examples

### Setup the `default` profile

```bash
serverless setup --provider aws --key 1234 --secret 5678
```

This example will setup the `default` profile with the `aws_access_key_id` of `1234` and the `aws_secret_access_key` of `5678`.

### Setup a custom profile

```bash
serverless setup --provider aws --key 1234 --secret 5678 --profile custom-profile
```

This example create and setup a `custom-profile` profile with the `aws_access_key_id` of `1234` and the `aws_secret_access_key` of `5678`.
