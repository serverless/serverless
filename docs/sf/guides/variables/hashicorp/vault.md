<!--
title: HashiCorp Vault Secret Variables
description: Read HashiCorp Vault secrets in serverless.yml with vault variables, configure the address, token, API version and path prefix, and use defaults.
short_title: Vault Secrets
keywords: ['Serverless Framework', 'HashiCorp', 'Vault', 'vault variable', 'Secrets', 'Variables']
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/guides/variables/hashicorp/vault)

<!-- DOCS-SITE-LINK:END -->

# HashiCorp Vault Secret Variables

A `${vault:<path>/<property>}` variable reads a secret from a HashiCorp Vault server while the Serverless Framework loads `serverless.yml`. Use it to keep secrets such as database passwords in Vault instead of in `serverless.yml` or CI settings.

The following `serverless.yml` reads the `credentials.password` property of the `secret/data/mongo` secret:

```yaml
# serverless.yml
service: my-service

provider:
  name: aws
  runtime: nodejs24.x

functions:
  hello:
    handler: handler.hello
    environment:
      MONGO_PASSWORD: ${vault:secret/data/mongo/credentials.password}
```

Deploy with the Vault address and a token in the environment:

```bash
VAULT_ADDR=https://vault.example.com:8200 VAULT_TOKEN=YOUR_VAULT_TOKEN serverless deploy
```

Replace `YOUR_VAULT_TOKEN` with a Vault token that can read the secret. If the secret holds `{"credentials": {"password": "example-password"}}`, `MONGO_PASSWORD` is `example-password`.

## Syntax of the vault variable

```text
${vault:SECRET_PATH/PROPERTY}
${RESOLVER_NAME:SECRET_PATH/PROPERTY}
```

- `SECRET_PATH`: the path of the secret in Vault's HTTP API, without the version prefix. For a KV version 2 secrets engine mounted at `secret`, that's `secret/data/<name>`.
- `PROPERTY`: the part after the last `/`, a dot path inside the secret (`credentials.password`).
- `RESOLVER_NAME`: the name of a resolver with `type: vault` under `stages.<stage>.resolvers`; see [Configure a Vault resolver](#configure-a-vault-resolver). Without a declared resolver, use `vault`.

For a path in a KV version 2 secrets engine, the variable reads the secret's own key-value pairs (the `data.data` object of Vault's response), so `PROPERTY` starts at your keys. KV version 1 secrets aren't supported: their variables get no value. For other secrets engines, it reads the `data` object of the response.

When the property doesn't exist in the secret, the variable uses its default (`${vault:secret/data/mongo/credentials.password, 'none'}`), otherwise the command stops with a `Cannot resolve` error. An error from Vault, such as a missing token, a secret path that doesn't exist or a denied request, stops the command even when a default is set.

## Vault address and token

Without a resolver, the `vault` variable reads its settings from the environment:

- `VAULT_ADDR`: the Vault server's URL. Default: `http://localhost:8200/`.
- `VAULT_TOKEN`: the token sent in the `X-Vault-Token` header. Without a token, the command stops with `No Vault token provided. Please provide a token in the Vault configuration or set the VAULT_TOKEN environment variable.`

## Configure a Vault resolver

To set the address, token, API version or a path prefix in `serverless.yml`, declare a resolver with `type: vault`. The following resolver reads the token from `MY_VAULT_TOKEN` and prefixes every path with `secret/data`:

```yaml
stages:
  default:
    resolvers:
      vault:
        type: vault
        address: https://vault.example.com:8200
        token: ${env:MY_VAULT_TOKEN}
        path: secret/data

provider:
  name: aws

functions:
  hello:
    handler: handler.hello
    environment:
      MONGO_PASSWORD: ${vault:mongo/credentials.password}
```

With the `path` prefix, `${vault:mongo/credentials.password}` reads the `secret/data/mongo` secret.

| Key       | Type   | Default                                     | Description                                                                    |
| --------- | ------ | ------------------------------------------- | ------------------------------------------------------------------------------ |
| `type`    | String | Required                                    | `vault`.                                                                       |
| `address` | String | `VAULT_ADDR`, then `http://localhost:8200/` | URL of the Vault server.                                                       |
| `token`   | String | `VAULT_TOKEN`                               | Vault token.                                                                   |
| `version` | String | `v1`                                        | Vault HTTP API version, the first segment of the request path.                 |
| `path`    | String | None                                        | Prefix added before the secret path of every variable that uses this resolver. |

Another key stops the command with `Only 'token', 'address', 'version', and 'path' are allowed in the Vault configuration`.

A resolver can have any name. To read from two Vault servers or with two tokens, declare two resolvers with `type: vault` and reference each by name, for example `${prodVault:mongo/credentials.password}`.

## Related

- [Variables in serverless.yml](../README.md): syntax, defaults and resolvers.
- [Terraform state outputs](./terraform.md): read outputs of a Terraform state.
- [Doppler secrets](../doppler.md): read secrets from Doppler.
