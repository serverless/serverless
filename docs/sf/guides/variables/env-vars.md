<!--
title: Environment Variables in serverless.yml
description: Read shell environment variables and .env file values in serverless.yml with env variables, with defaults and the errors for unset names.
short_title: Environment Variables
keywords: ['Serverless Framework', 'Environment Variables', 'env variable', 'dotenv', '.env file', 'Configuration']
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/guides/variables/env-vars)

<!-- DOCS-SITE-LINK:END -->

# Environment Variables in serverless.yml

An `${env:NAME}` variable reads the environment variable `NAME` while the Serverless Framework resolves `serverless.yml`, from your shell or from a `.env` file in the service directory. Use it for values that differ between machines or CI jobs, such as a name prefix, an account-specific setting or a feature flag.

The following `serverless.yml` prefixes both function names with the value of `FUNC_PREFIX`, and falls back to `dev` when the variable isn't set:

```yaml
# serverless.yml
service: my-service

provider:
  name: aws
  runtime: nodejs24.x

functions:
  hello:
    name: ${env:FUNC_PREFIX, 'dev'}-hello
    handler: handler.hello
  world:
    name: ${env:FUNC_PREFIX, 'dev'}-world
    handler: handler.world
```

Deploy with the variable set in the shell:

```bash
FUNC_PREFIX=team-a serverless deploy
```

The functions are named `team-a-hello` and `team-a-world`.

An `${env:...}` variable sets a value in `serverless.yml` at deploy time. To pass environment variables to your Lambda functions at runtime, set them under `provider.environment` or a function's `environment`, as described in [Environment variables for functions](../../providers/aws/guide/functions.md#environment-variables).

## Syntax of the env variable

```text
${env:NAME}
${env:NAME, DEFAULT_VALUE}
```

- `NAME` (required): the environment variable's name, case-sensitive on Linux and macOS.
- `DEFAULT_VALUE` (optional): the value to use when `NAME` isn't set. It can be a quoted string (`'dev'`), a number, `true`, `false`, or another variable written without the `${}`, such as `${env:FUNC_PREFIX, env:USER, 'dev'}`. The Framework tries each source from left to right and uses the first one that has a value.

## Where env values come from

The Framework reads `${env:...}` values from the process environment of the `serverless` command. Before it resolves variables, it loads `.env.<stage>` and `.env` from the service directory (the directory that contains `serverless.yml`) into that environment. When the same name is set in several places, the first of these wins:

1. The shell environment, set before `serverless` runs.
2. `.env.<stage>`, for example `.env.prod` when you run `serverless deploy --stage prod`.
3. `.env`.

The following `.env` file sets `FUNC_PREFIX` for every stage that has no `.env.<stage>` file and no `FUNC_PREFIX` in the shell:

```text
FUNC_PREFIX=team-a
```

To load `.env` files from another directory (for example, shared files in a monorepo) or to turn off `.env` loading with `useDotenv: false`, see [Dotenv files](../../providers/aws/guide/serverless.yml.md#dotenv-files) in the `serverless.yml` reference.

The stage is determined before the `.env` files are loaded, so an `${env:...}` variable in `provider.stage` reads only the shell environment.

## Values an env variable returns

An `${env:...}` variable always returns a string. A variable set to `true` returns the string `"true"`; to pass a boolean to a setting that requires one, wrap the variable in `strToBool`, as described in [Read string variable values as boolean values](./README.md#read-string-variable-values-as-boolean-values).

A variable set to an empty string (`FUNC_PREFIX=`) returns an empty string, and its default value isn't used.

## Unset environment variables

When `NAME` isn't set and the variable has no default value, the command stops with an error that names the variable and where it's used:

```text
Cannot resolve '${env:FUNC_PREFIX}' variable at 'functions.hello.name'. No value is available for this variable, and no default value was provided. Please check your variable definitions or provide a default value.
```

To fix it, set the variable in the shell or a `.env` file, or add a default value after a comma.

## Secrets in env variables

The value of an `${env:...}` variable is written into the configuration the Framework generates: the CloudFormation template, and the function's environment when you use the variable there. It also appears in the output of `serverless print`. [SSM variables](./aws/ssm.md) keep a secret out of `serverless.yml` and your shell, but the Framework resolves them the same way, so their values appear in the same places. To keep a secret out of templates, build output and the function's configuration, store it in AWS Systems Manager Parameter Store or AWS Secrets Manager and read it in your function code at runtime.

## Related variable sources

- [Variables](./README.md): how variables work, and the list of all variable sources.
- [CLI option variables](./cli-options.md): read options passed to the `serverless` command.
- [SSM Parameter Store variables](./aws/ssm.md): read parameters and secrets from AWS.
- [Doppler variables](./doppler.md): read secrets from Doppler.
