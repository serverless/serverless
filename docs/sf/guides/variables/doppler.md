<!--
title: Serverless Framework - Variables - Doppler Secrets
description: How to reference Doppler secrets
short_title: Serverless Variables - Doppler secrets
keywords: ['Serverless Framework', 'Doppler', 'Variables', 'Secrets']
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/guides/variables/doppler)

<!-- DOCS-SITE-LINK:END -->

# Reference Doppler Secrets

In Serverless Framework V.4, we introduced the ${doppler} variable, providing
seamless integration with Doppler, a modern secrets management platform.
This feature allows you to securely retrieve secrets from Doppler at
deployment time, enhancing the security and flexibility of your serverless
service.

You can quickly reference Doppler secrets with the following syntax:

```yaml
service: my-service
provider:
  environment:
    DB_PASSWORD: ${doppler:my-project/DB_PASSWORD}
```

This will fetch the `DB_PASSWORD` secret from the stage you're deploying to in the `my-project` Doppler project. However, you MUST have the `DOPPLER_TOKEN` env var set.

For more advanced configuration, keep reading.

## Configure the Doppler Resolver

```yaml
stages:
  default:
    resolvers:
      doppler:
        type: doppler
        token: ${env:My_DOPPLER_TOKEN} # Your Doppler access token.
        project: backend-service # Your Doppler project
        config: dev # Doppler configs are equivalent to Serverless stages
  prod:
    resolvers:
      doppler:
        token: ${env:My_DOPPLER_TOKEN}
        project: backend-service
        config: prod
```

Configuration options:

- `type` - (required) - The type of resolver. Set it to `doppler` to use the Doppler resolver.
- `token` - (optional) - The Doppler token to authenticate with the Doppler service.
- `project` - (optional) - The Doppler project name to fetch secrets from
- `config` - (optional) - The Doppler config (environment) name to use, defaults to the current stage name you're running the framework in.

The `token` field is optional; however, in that case, the token must be set in
either the `DOPPLER_TOKEN` or `DOPPLER_ACCESS_TOKEN` environment variable. An error
will be thrown if no token is available.

The `project` field is optional. However, if not specified in the config, it must be provided in the variable reference (see below).

The `config` field is optional. If it isn't provided, it will default to the current stage name of your serverless service. For example, if you deploy with
`serverless deploy --stage prod`, it will use "prod" as the config name.

## Using the `doppler` resolver

There are two ways to reference secrets from Doppler:

### 1. With project configured in resolver:

When the project is specified in the resolver configuration as shown above, you can directly reference the secret name:

```yaml
service: my-service
provider:
  environment:
    DB_PASSWORD: ${doppler:DB_PASSWORD}
    API_KEY: ${doppler:API_KEY}
```

### 2. With project specified in variable reference:

If you haven't specified a project in the resolver configuration, or want to override it, you can include the project name in the variable reference:

```yaml
service: my-service
provider:
  environment:
    DB_PASSWORD: ${doppler:backend-service/DB_PASSWORD}
    API_KEY: ${doppler:frontend-service/API_KEY}
```

## Using Multiple Projects or Environments

Doppler's configs (environments) map naturally to Serverless Framework stages. A common pattern is to use the same project across different environments:

```yaml
stages:
  dev:
    resolvers:
      doppler:
        type: doppler
        project: backend-service
        # config will default to "dev"
  staging:
    resolvers:
      doppler:
        type: doppler
        project: backend-service
        # config will default to "staging"
  prod:
    resolvers:
      doppler:
        type: doppler
        project: backend-service
        # config will default to prod
```

## Error Handling

The resolver will throw clear error messages in these cases:

- No token available in config or environment variables
- No project specified (either in config or variable reference)
- Invalid format when specifying project in variable reference
- Authentication failures with Doppler
- Other API errors from Doppler (with detailed error messages)
