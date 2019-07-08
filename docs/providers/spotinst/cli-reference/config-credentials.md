<!--
title: Serverless Framework Commands - Spotinst Functions - Config Credentials
menuText: config credentials
menuOrder: 1
description: Configure Serverless credentials for Spotinst Functions
layout: Doc
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/spotinst/cli-reference/config-credentials)

<!-- DOCS-SITE-LINK:END -->

# Spotinst Functions - Config Credentials

```bash
serverless config credentials -p spotinst -a <ACCOUNT_ID> -t <TOKEN>
```

## Example

```bash
serverless config credentials -p spotinst -a act-92879641 -t eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJpc3778jnkjhjbfsllo
```

## Options

- `--provider` or `-p` The provider name.
- `--account` or `-a` Spotinst Account ID.
- `--token` or `-t` Spotinst Access Token.
