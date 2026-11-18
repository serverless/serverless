<!--
title: Serverless Core Variables
description: Read the stage of the current run and a per-run instance ID in serverless.yml with the Serverless Core (sls) variables.
short_title: Core Variables (sls)
keywords: ['Serverless Framework', 'sls stage', 'sls instanceId', 'Core Variables', 'Variables']
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/guides/variables/core)

<!-- DOCS-SITE-LINK:END -->

# Serverless Core Variables

The `${sls:...}` variables expose two values the Serverless Framework computes for each run: the stage being deployed (`${sls:stage}`) and an ID that changes on every CLI run (`${sls:instanceId}`). Use `${sls:stage}` whenever a name or setting depends on the stage, instead of repeating the stage logic yourself.

The following `serverless.yml` names a DynamoDB table after the stage and records the CLI run that deployed the function:

```yaml
# serverless.yml
service: my-service

provider:
  name: aws
  runtime: nodejs24.x
  environment:
    TABLE_NAME: my-service-${sls:stage}-users
    DEPLOYMENT_ID: ${sls:instanceId}

functions:
  hello:
    handler: handler.hello
```

Running `serverless deploy --stage prod` sets `TABLE_NAME` to `my-service-prod-users`.

## Stage name

`${sls:stage}` returns the stage of the current run, taken from the first of these that is set:

1. The `--stage` option, or its alias `-s`.
2. `provider.stage` in `serverless.yml`.
3. `dev`.

This is the same value as `${opt:stage, self:provider.stage, 'dev'}`, in one variable. Use `${sls:stage}` instead of `${self:provider.stage}`, which returns only what the file sets and ignores `--stage`.

`${sls:stage}` can be part of another variable's key, for example to pick a stage-specific file: `${file(./config.${sls:stage}.json):dbHost}`.

## Instance ID

`${sls:instanceId}` returns the time the Serverless CLI process started, in milliseconds since the Unix epoch, as a string (for example `1793491279117`). The value is set once per CLI run, so every `${sls:instanceId}` in that run returns the same value, and the next run returns a different one.

Use it where a value must change on every deployment, for example to make a CloudFormation custom resource run again or to tag a deployment. A function that uses `${sls:instanceId}` in its configuration, as in the opening example, has a changed configuration on every deployment, so the Framework updates the function each time.

## Unknown core variable names

Only `stage` and `instanceId` are available. Any other name stops the command with an error, for example for `${sls:region}`:

```text
Failed to resolve variable 'region' with resolver 'framework' and provider 'sls': Error: Resolver framework is not supported
```

To read the region, use `${aws:region}` ([AWS variables](./aws/README.md)) or `${opt:region, self:provider.region, 'us-east-1'}` ([CLI options](./cli-options.md)).

## Related variable sources

- [Variables](./README.md): how variables work, and the list of all variable sources.
- [CLI option variables](./cli-options.md): read any option passed to the command.
- [Self-reference variables](./self.md): reuse values from the same `serverless.yml`.
- [Parameters](../parameters.md): stage-specific values set with `params`.
