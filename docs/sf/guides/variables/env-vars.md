<!--
title: Serverless Framework - Variables - Environment
description: How to reference Environment Variables
short_title: Serverless Variables - Env Vars
keywords: ['Serverless Framework', 'Environment Variables', 'Configuration']
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/guides/variables/env-vars)

<!-- DOCS-SITE-LINK:END -->

# Reference Environment Variables

To reference environment variables, use the `${env:SOME_VAR}` syntax in your `serverless.yml` configuration file.

**Note:**

Keep in mind that sensitive information which is provided through environment variables can be written into less protected or publicly accessible build logs, CloudFormation templates, et cetera.

```yml
service: new-service
provider: aws
functions:
  hello:
    name: ${env:FUNC_PREFIX}-hello
    handler: handler.hello
  world:
    name: ${env:FUNC_PREFIX}-world
    handler: handler.world
```

In the above example you're dynamically adding a prefix to the function names by referencing the `FUNC_PREFIX` env var. So you can easily change that prefix for all functions by changing the `FUNC_PREFIX` env var.

## Loading variables from `.env` files

Serverless Framework reads `.env` and `.env.${stage}` from the directory containing your `serverless.yml` automatically — no configuration needed. Values become available as `${env:KEY}` placeholders throughout your config.

### Loading additional `.env` files from a custom location

For monorepos that share configuration across multiple services, `useDotenv` can point at additional `.env` file(s) outside the service directory. Local files are still loaded automatically.

```yaml
# api/serverless.yml
useDotenv: ../ # also load ../.env and ../.env.${stage} as shared defaults
```

The value is a single path or an array of paths, each resolved relative to the service directory:

```yaml
useDotenv:
  - ./overrides.env # specific overrides (file)
  - ../ # shared defaults (directory)
```

| Entry shape        | What gets loaded                                                             |
| ------------------ | ---------------------------------------------------------------------------- |
| **File path**      | exactly that file. No stage-suffix probing                                   |
| **Directory path** | `<dir>/.env.${stage}` (if a stage is set) then `<dir>/.env`                  |
| **Array**          | entries load in array order; earlier entries beat later ones for shared keys |
| **Missing path**   | silently skipped — same as a missing local `.env`                            |

### Precedence

Highest to lowest:

1. `process.env` (system environment)
2. Local `.env.${stage}`
3. Local `.env`
4. Custom entries in array order (within a directory entry, `.env.${stage}` beats `.env`)

The local files always win, so custom paths act as shared defaults that per-service files can override. `dotenv` uses first-write-wins, so the load order above directly produces this chain.

### Notes

- Path strings are taken literally — Serverless variable placeholders (`${opt:stage}`, `${self:…}`, etc.) are **not** resolved inside `useDotenv`, because the value is read before the resolver runs. Use the directory form when you need stage-specific custom files.
- `useDotenv` is per-service. Declaring it at the top level of `serverless-compose.yml` has no effect; each child service declares its own.
- `${env:…}` placeholders inside `provider.stage` cannot reference values from any `.env` file (local or custom) — stage resolution runs before `.env` files are loaded.
