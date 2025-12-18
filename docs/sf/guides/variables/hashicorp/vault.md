<!--
title: Serverless Framework - Variables - HashiCorp Vault Secrets
description: How to reference HashiCorp Vault Secrets
short_title: Serverless Variables - HashiCorp Vault Secrets
keywords: ['Serverless Framework', 'HashiCorp', 'Vault', 'Secrets', 'Variables']
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/guides/variables/hashicorp/vault)

<!-- DOCS-SITE-LINK:END -->

# Reference HashiCorp Vault Secrets

In Serverless Framework V.4, we introduced the ${vault} variable, providing
seamless integration with HashiCorp Vault, a popular secret management tool.
This feature allows you to securely retrieve secrets from HashiCorp Vault at
deployment time, enhancing the security and flexibility of your serverless
service.

## Configure the HashiCorp Vault Resolver

```yaml
stages:
  default:
    resolvers:
      vault:
        type: vault
        address: http://127.0.0.1:8200
        token: ${env:VAULT_TOKEN}
        version: v1
        path: secret/data/mongo
```

Configuration options:

- `address` - (optional) - The URL address of the Vault server
- `token` - (optional) - The Vault token to authenticate with the Vault server
- `version` - (optional) - The version of the Vault API to use
- `path` - (optional) - The path to the secret in Vault

All of the configuration options are optional.

The `address` field is optional. If it isn't provided, the resolver will first
try to get the address from the `VAULT_ADDR` environment variable. If that is
not set, it will default to `http://127.0.0.1:8200`.

The `token` field is optional; however, in that case the token must be set in
the `VAULT_TOKEN` environment variable. An error will be thrown if neither is
set.

The `version` field is optional. If it isn't provided, it will default to `v1`.

The `path` field is optional. Getting a secret from Vault is required, so the
path must be either specified in the config, as shown above, or it must be
specified in the variable reference, e.g. `${terraform:secret/data/mongo/credentials.password}`.

## Using the `vault` resolver

To reference a secret from HashiCorp Vault, use the following syntax:

```yaml
${vault:secret/data/mongo/credentials.password}
```

The above example will fetch the secret at the path `secret/data/mongo` from the
Vault server. It assumes that the response includes an object like this:

```json
{
  "credentials": {
    "password": "abc123"
  }
}
```

The `credentials.password`, therefore will resolve to the value `abc123`.

If a path is specified in both the configuration and in the variable reference,
then the configuration path will be used as a prefix to the variable reference.

For example, in this case the `secret/data` will be used as a prefix:

```yaml
stages:
  default:
    resolvers:
      vault:
        path: secret/data


${vault:mongo/credentials.password}
```

As a result, the variable `${vault:mongo/credentials.password}` will resolve to
the path `secret/data/mongo`, as the `secret/data` is used as a prefix to the
path in the variable, `mongo`. The path, `credentials.password` is resolved as
before.

## Using the `vault` resolver without a configuration

All the fields in the configuration are optional. While the fields are optional,
the address, token, and path must be provided. If the address and token are
defined as environment variables, `VAULT_ADDR` and `VAULT_TOKEN`, respectively,
then, and the variable reference includes the path, then the resolver will work
without any configuration at `stages.default.vault.*`.
