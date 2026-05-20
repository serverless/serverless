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

Values come from `process.env` (system environment) and from `.env` / `.env.${stage}` files that the framework loads automatically. To load additional `.env` files from a custom location (e.g. a shared file in a monorepo), see the [`useDotenv` reference](../../providers/aws/guide/serverless.yml.md#dotenv-files).
