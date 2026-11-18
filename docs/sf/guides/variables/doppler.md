<!--
title: Doppler Secret Variables
description: Read secrets from Doppler in serverless.yml with doppler variables, set the token, project and config, and map Doppler configs to stages.
short_title: Doppler Secrets
keywords: ['Serverless Framework', 'Doppler', 'doppler variable', 'Secrets', 'secrets manager', 'Variables']
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/guides/variables/doppler)

<!-- DOCS-SITE-LINK:END -->

# Doppler Secret Variables

A `${doppler:...}` variable reads a secret from [Doppler](https://docs.doppler.com/docs/secrets), a secrets manager, while the Serverless Framework resolves `serverless.yml`. Use it to keep secrets such as database passwords and API keys in Doppler instead of in `serverless.yml`, `.env` files or CI settings.

The following `serverless.yml` reads the `DB_PASSWORD` secret of the `backend-service` Doppler project and passes it to the function as an environment variable:

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
      DB_PASSWORD: ${doppler:backend-service/DB_PASSWORD}
```

Deploy with a Doppler token in the `DOPPLER_TOKEN` environment variable:

```bash
DOPPLER_TOKEN=YOUR_DOPPLER_TOKEN serverless deploy --stage prod
```

Replace `YOUR_DOPPLER_TOKEN` with a Doppler token that can read the project, for example a [service token](https://docs.doppler.com/docs/service-tokens). The Framework reads the secret from the Doppler config named after the stage, `prod` in this example.

## Syntax of the doppler variable

```text
${doppler:SECRET_NAME}
${doppler:PROJECT/SECRET_NAME}
${RESOLVER_NAME:SECRET_NAME}
${RESOLVER_NAME:PROJECT/SECRET_NAME}
```

- `PROJECT` (optional): the Doppler project. It takes precedence over the `project` set in the resolver configuration, and it's required when the resolver configuration sets no `project`. The reference can contain only one `/`.
- `SECRET_NAME` (required): the name of the secret in Doppler.
- `RESOLVER_NAME`: the name of a Doppler resolver declared under `stages.<stage>.resolvers`; see [Configure a Doppler resolver](#configure-a-doppler-resolver). Without a declared resolver, use `doppler`, which reads the token from `DOPPLER_TOKEN` and the config from the stage name.

The variable returns the secret's computed value, a string with any Doppler secret references in it expanded.

## Configure a Doppler resolver

To set the token, project or config in `serverless.yml` instead of in every variable, declare a resolver with `type: doppler` under `stages.<stage>.resolvers`. The following `serverless.yml` reads the token from `MY_DOPPLER_TOKEN` and sets the project once, so variables name only the secret:

```yaml
# serverless.yml
service: my-service

stages:
  default:
    resolvers:
      doppler:
        type: doppler
        token: ${env:MY_DOPPLER_TOKEN}
        project: backend-service

provider:
  name: aws
  runtime: nodejs24.x

functions:
  hello:
    handler: handler.hello
    environment:
      DB_PASSWORD: ${doppler:DB_PASSWORD}
      API_KEY: ${doppler:API_KEY}
```

A Doppler resolver accepts these keys:

| Key       | Type   | Required | Default                                  | Description                                                                                                           |
| --------- | ------ | -------- | ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `type`    | String | Yes      |                                          | Must be `doppler`.                                                                                                    |
| `token`   | String | No       | The `DOPPLER_TOKEN` environment variable | The Doppler token used to read secrets. Write it as a variable (`${env:MY_DOPPLER_TOKEN}`), never as a literal value. |
| `project` | String | No       | None                                     | The Doppler project. A project in the variable (`${doppler:PROJECT/SECRET_NAME}`) takes precedence.                   |
| `config`  | String | No       | The stage name                           | The Doppler config (environment) to read secrets from.                                                                |

Any other key stops the command with an error, for example for a key named `foo`:

```text
Invalid configuration for resolver "doppler" of type "doppler" in stage "default": Only 'token', 'project', and 'config' are allowed in the Doppler configuration (unrecognized: 'foo')
```

The resolver's name is your choice. A resolver named `backendSecrets` is referenced as `${backendSecrets:DB_PASSWORD}`, and several Doppler resolvers can read from different projects or tokens in the same service.

## Map Doppler configs to stages

When a Doppler resolver sets no `config`, it reads from the Doppler config named after the stage: `serverless deploy --stage staging` reads from the `staging` config. To use this mapping, create a Doppler config for each stage with the stage's name; one resolver under `default` then serves every stage:

```yaml
stages:
  default:
    resolvers:
      doppler:
        type: doppler
        project: backend-service
```

When a stage's name differs from its Doppler config, set `config` for that stage. A resolver declared under a stage replaces the resolver of the same name under `default` completely, without merging keys, so repeat `type` and every key the stage needs:

```yaml
stages:
  default:
    resolvers:
      doppler:
        type: doppler
        project: backend-service
        config: dev
  prod:
    resolvers:
      doppler:
        type: doppler
        project: backend-service
        config: prd
```

With this configuration, `--stage prod` reads from the `prd` config and every other stage reads from `dev`. A stage-level resolver without `type` stops the command with `"type" attribute is missing in doppler resolver in stage prod`.

## Secret values in the deployed service

The Framework resolves a `${doppler:...}` variable when it reads `serverless.yml`, and the secret's value becomes part of the configuration it deploys. A secret used in a function's `environment` is stored in the function's configuration and the CloudFormation template, and appears in the output of `serverless print`. Each resolver fetches a secret once per command, however many variables reference it.

## Doppler variable errors

Every Doppler error stops the command, even when the variable has a default value after a comma (`${doppler:API_KEY, 'none'}`). The messages are prefixed with `Failed to resolve variable '<reference>' with resolver 'doppler' and provider 'doppler':`.

No token in the resolver configuration or in `DOPPLER_TOKEN`:

```text
No Doppler token provided. Please provide a token in the Doppler configuration or set the DOPPLER_TOKEN environment variable.
```

A token that Doppler rejects:

```text
Failed to authenticate with Doppler: Please provide a valid Doppler token either by setting the DOPPLER_TOKEN environment variable or by adding it to your resolver configuration.
```

No project in the variable or the resolver configuration:

```text
No project specified. Either include project in the resolver config, or reference it in the variable string as "${doppler:projectName/secretName}"
```

More than one `/` in the reference:

```text
When referencing a Doppler project in the variable string, it must be in format "${doppler:projectName/secretName}" with exactly one slash
```

Any other response from Doppler, such as a secret, project or config that doesn't exist, stops the command with `Error fetching secret from Doppler:` followed by Doppler's status code and message.

## Related variable sources

- [Variables](./README.md): how variables work, how resolvers are declared, and the list of all variable sources.
- [Environment variables](./env-vars.md): read the Doppler token and other values from the shell.
- [SSM Parameter Store variables](./aws/ssm.md): read secrets stored in AWS.
- [Vault variables](./hashicorp/vault.md): read secrets from HashiCorp Vault.
