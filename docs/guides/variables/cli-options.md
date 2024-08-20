<!--
title: Serverless Framework - Variables - CLI Options
description: Learn how to reference CLI options in your Serverless Framework configuration using the ${opt:<option>} syntax.
short_title: Serverless Variables - CLI Options
keywords: ['Serverless Framework', 'CLI Options', 'Variables', 'Configuration']
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/guides/variables/cli-options)

<!-- DOCS-SITE-LINK:END -->

# Reference CLI Options

To reference CLI options that you passed, use the `${opt:<option>}` syntax in your `serverless.yml` configuration file. It is valid to use the empty string in place of `<option>`. This looks like "`${opt:}`" and the result of declaring this in your `serverless.yml` is to embed the complete `options` object (i.e. all the command line options from your `serverless` command).

```yml
service: new-service
provider: aws
functions:
  hello:
    name: ${opt:stage}-hello
    handler: handler.hello
  world:
    name: ${opt:stage}-world
    handler: handler.world
```

In the above example, you're dynamically adding a prefix to the function names by referencing the `stage` option that you pass in the CLI when you run `serverless deploy --stage dev`. So when you deploy, the function name will always include the stage you're deploying to.
