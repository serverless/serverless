<!--
title: License Keys
description: Authenticate the Serverless Framework CLI with a License Key from an environment variable, serverless.yml or AWS SSM, and manage keys with the API.
short_title: License Keys
keywords:
  [
    'Serverless Framework',
    'License Keys',
    'SERVERLESS_LICENSE_KEY',
    'licenseKey',
    'CLI authentication',
  ]
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/guides/license-keys)

<!-- DOCS-SITE-LINK:END -->

# License Keys

The Serverless Framework v4 CLI runs only when you are signed in or provide a key. A License Key is an org-level key that authenticates the CLI without a Dashboard user session: use it in CI/CD, for teams that don't use the Serverless Framework Dashboard, or to keep one key in a secrets store for everyone. To use Dashboard features, sign in with `serverless login` or use an Access Key instead.

To run a command with a License Key, set `SERVERLESS_LICENSE_KEY` in the environment:

```bash
export SERVERLESS_LICENSE_KEY="YOUR_LICENSE_KEY"
serverless deploy
```

Replace `YOUR_LICENSE_KEY` with a key from the Dashboard's [License Keys settings](https://app.serverless.com/settings/licenseKeys). A `serverless login` session on the same machine takes precedence over the License Key ([Which credential the CLI uses](#which-credential-the-cli-uses)).

## What a License Key does

A License Key identifies your org to Serverless, Inc. It grants no permissions in AWS or in the Dashboard.

- **Validated on every command.** Each command sends the License Key to Serverless, Inc. to validate it. When the API answers with an HTTP 5xx error, the CLI prints `Serverless API temporarily unavailable` and continues; when the API can't be reached at all, the command stops.
- **One org per key.** When `org` is set (`--org`, `org` in `serverless.yml`, or `SERVERLESS_ORG_NAME`) and names another org than the key's, the command stops with `The provided License Key is not for the Org "<org>".`
- **No Dashboard features.** A service that sets `app` stops with an error that starts with `This Service is enabled for Serverless Framework Dashboard because the "app" property is set.` Dashboard providers and parameters aren't loaded.
- **Many keys per org.** Create as many License Keys as you need, for example one per team, app, pipeline or developer, and delete a key to revoke it.

## Create a License Key

Create, list and delete License Keys in the Dashboard under [Settings > License Keys](https://app.serverless.com/settings/licenseKeys), or with the [License Keys API](#manage-license-keys-with-the-api). If you can't access the Dashboard, email [support@serverless.com](mailto:support@serverless.com) to have keys created or deleted for you.

## Provide the License Key to the CLI

The CLI reads a License Key from any of the following places. Pick the one that fits where the command runs; [Which credential the CLI uses](#which-credential-the-cli-uses) gives the order when several are present.

### `SERVERLESS_LICENSE_KEY` environment variable

Set `SERVERLESS_LICENSE_KEY` (or its alias `SERVERLESS_ORG_ACCESS_KEY`) in the shell or as a secret in your CI/CD pipeline. It takes precedence over `licenseKey` in `serverless.yml`. Each person or pipeline that runs the CLI needs its own copy of the key, so a key in a secrets store (the following options) scales better for larger teams.

### `licenseKey` in `serverless.yml`

Available in v4.4.5 and later. The top-level `licenseKey` property sets the License Key for the service. Reference the key from a secrets store with a [variable](./variables/README.md) rather than writing it into the file:

```yaml
# serverless.yml
service: my-service
licenseKey: ${ssm:/path/to/serverless-framework-license-key}

provider:
  name: aws
  runtime: nodejs24.x

functions:
  hello:
    handler: handler.hello
```

`${ssm:…}` reads from [AWS SSM Parameter Store or AWS Secrets Manager](./variables/aws/ssm.md) with the service's deployment credentials, so anyone who can deploy the service can read the key and no one has to hold a copy. To read from HashiCorp Vault, use `licenseKey: ${vault:secret/serverless-framework/license-key}` ([Vault](./variables/hashicorp/vault.md)). To read the key from a different AWS account than the one you deploy to, configure an AWS [resolver](./variables/aws/README.md) for that account.

### `/serverless-framework/license-key` SSM parameter

Available in v4.4.19 and later. When no other credential is present ([Which credential the CLI uses](#which-credential-the-cli-uses)), the CLI reads the License Key from the SSM parameter `/serverless-framework/license-key`, so services need no `licenseKey` and machines need no environment variable. Store the key in each AWS account and Region you deploy to:

```bash
aws ssm put-parameter \
  --name /serverless-framework/license-key \
  --description "Serverless Framework License Key" \
  --type SecureString \
  --value "YOUR_LICENSE_KEY" \
  --region us-east-1
```

The CLI reads the parameter, decrypting a `SecureString`, with these credentials and Region:

- In a service directory: the service's deployment credentials, Region and profile, the same ones `${ssm:…}` uses.
- Outside a service directory: the `--region` option (default `us-east-1`), and the `--aws-profile` option or the default AWS credential chain.

Those credentials need `ssm:GetParameter` on the parameter and, for a `SecureString` encrypted with a customer managed KMS key, `kms:Decrypt` on that key ([Parameter Store and AWS KMS](https://docs.aws.amazon.com/kms/latest/developerguide/services-parameter-store.html)). A CI/CD pipeline whose AWS credentials can read the parameter needs no License Key variable: the CLI reads the parameter on every command.

When the parameter can't be read (it doesn't exist in the Region the CLI reads, or access is denied), the CLI continues as if no key were found, and without a terminal the command stops with the sign-in error in [Which credential the CLI uses](#which-credential-the-cli-uses). Run the command with `--debug` to see why the read didn't succeed.

### License Key saved on your machine

When you run a command in a terminal without any credential, the CLI shows a menu. **Enter A License Key** validates the key you type and saves it in `~/.serverlessrc` (or in `~/.config/.serverlessrc` when only that file exists), under the key's org. Later commands on that machine use the saved key. `serverless logout` offers to delete a saved key.

## Which credential the CLI uses

When several credentials are present, the CLI uses the first of these:

1. An Access Key in `SERVERLESS_ACCESS_KEY` (or `SERVERLESS_USER_ACCESS_KEY`).
2. A user session saved by `serverless login` in `~/.serverlessrc`. While a session exists, the CLI doesn't use a License Key from the environment, `serverless.yml` or SSM; run `serverless logout` in a terminal to use the License Key.
3. A License Key from `SERVERLESS_LICENSE_KEY` (or `SERVERLESS_ORG_ACCESS_KEY`), else from `licenseKey` in `serverless.yml`.
4. A License Key saved in `~/.serverlessrc` by the **Enter A License Key** menu.
5. A License Key from the `/serverless-framework/license-key` SSM parameter, read only when none of the preceding are present.

The CLI also merges a `.serverlessrc` file in the working directory over the one in your home directory.

Without any credential and without a terminal (CI, a script, or an AI coding agent), the command stops with an error that starts with:

```text
You must sign in or use a License Key with Serverless Framework V.4 and later versions:
```

The rest of the message names the ways to sign in, including `SERVERLESS_LICENSE_KEY`. See [`serverless login`](../providers/aws/cli-reference/login.md) for signing in without a terminal.

## Manage License Keys with the API

The License Keys API creates, lists and deletes the License Keys of an org. Every request needs:

- `<org-id>`: your org ID, from [Settings > General](https://app.serverless.com/settings/general).
- `<access-key>`: an Access Key, from [Settings > Access Keys](https://app.serverless.com/settings/accessKeys), sent as a bearer token.

### Create a License Key with the API

Send a `POST` request with an optional `label`:

```bash
curl -X POST https://core.serverless.com/api/accesskeys/<org-id> \
  -H "Authorization: Bearer <access-key>" \
  -H "Content-Type: application/json" \
  -d '{"label": "example"}'
```

The response holds the new key in `data.key`:

```json
{
  "data": {
    "key": "eyJhbG...",
    "label": "example",
    "orgId": "<org-id>",
    "subscriptionId": "<subscription-id>",
    "version": "V2",
    "createdAt": 1738686791251,
    "updatedAt": 1738686791251
  }
}
```

### List License Keys with the API

Send a `GET` request:

```bash
curl -X GET https://core.serverless.com/api/accesskeys/<org-id> \
  -H "Authorization: Bearer <access-key>"
```

The response lists the org's keys in `data`, each with the fields of the create response:

```json
{
  "data": [
    {
      "key": "eyJhbG...",
      "label": "example",
      "orgId": "<org-id>",
      "subscriptionId": "<subscription-id>",
      "version": "V2",
      "createdAt": 1738686791251,
      "updatedAt": 1738686791251
    }
  ]
}
```

### Delete a License Key with the API

Send a `DELETE` request that names the key as `key` (or `accessKey`), with an optional `label`:

```bash
curl -X DELETE https://core.serverless.com/api/accesskeys/<org-id> \
  -H "Authorization: Bearer <access-key>" \
  -H "Content-Type: application/json" \
  -d '{"label": "example", "key": "eyJhbG..."}'
```

The API answers with HTTP status `204` and no body.

## Related pages

- [`serverless login`](../providers/aws/cli-reference/login.md): sign in with a Dashboard account instead.
- [AWS Credentials](../providers/aws/guide/credentials.md): the AWS credentials the CLI deploys with, which also read `${ssm:…}` and the SSM parameter.
- [Variables](./variables/README.md): reference secrets stores from `serverless.yml`.
