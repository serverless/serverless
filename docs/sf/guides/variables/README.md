<!--
title: Variables in serverless.yml
description: Insert values from CLI options, environment variables, files, AWS, Vault and other sources into serverless.yml with variables, defaults and resolvers.
short_title: Variables
keywords:
  [
    'Serverless Framework',
    'Variables',
    'serverless.yml',
    'dynamic configuration',
    'variable resolvers',
    'default values',
  ]
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/guides/variables)

<!-- DOCS-SITE-LINK:END -->

# Variables in serverless.yml

Variables insert values into `serverless.yml` when the Serverless Framework loads it: the stage, a CLI option, an environment variable, a file, an SSM parameter, a Terraform output and other sources. Use them to keep secrets out of `serverless.yml` and to give each stage its own values.

The following `serverless.yml` names the function after the stage and reads a table name from an environment variable, with a default:

```yaml
# serverless.yml
service: my-service

provider:
  name: aws
  runtime: nodejs24.x

functions:
  hello:
    handler: handler.hello
    name: ${sls:stage}-hello
    environment:
      TABLE_NAME: ${env:TABLE_NAME, 'users'}
```

With `serverless deploy --stage prod` and no `TABLE_NAME` in the environment, the function is named `prod-hello` and `TABLE_NAME` is `users`.

## Variable syntax

A variable is `${source:address}`, where `source` names where the value comes from and `address` says which value to read:

```yaml
custom:
  stage: ${sls:stage} # a built-in value
  memory: ${opt:memory} # a CLI option
  secret: ${ssm:/my-service/api-key} # an SSM parameter
  fromResolver: ${awsProd:ssm:/my-service/api-key} # a source declared under stages.<stage>.resolvers
  withDefault: ${env:LOG_LEVEL, 'info'} # a default after the comma
```

Variables work in property values, not in property keys: a key such as `${self:custom.name}Bucket:` stays literal text.

A variable can be the whole value or part of a string. As the whole value, it takes the type the source returns: a string, a number, a boolean, a list or an object. Inside a longer string, such as `arn:aws:sqs:${aws:region}:${aws:accountId}:my-queue`, the value must be a string, a number or a boolean; a list is joined with commas, and an object stops the command with an error.

## Default values

To use a fallback when a source has no value, add one or more alternatives after commas. The Framework tries them from left to right and uses the first that has a value:

```yaml
provider:
  name: aws
  stage: ${opt:stage, env:STAGE, 'dev'}

functions:
  hello:
    handler: handler.hello
    memorySize: ${opt:memory, 1024}
```

- A string default must be quoted, with single or double quotes: `${env:LOG_LEVEL, 'info'}`. An unquoted word stops the command with a `SyntaxError`.
- Numbers, `true` and `false` can be unquoted; they keep their type. A CLI option is always a string, so `--memory 2048` resolves to `'2048'`.
- A default can be another variable: `${env:DB_HOST, self:custom.defaultDbHost}`.
- A default applies only when the source has no value: an unset option or environment variable, a missing SSM parameter, file property or stack output. An error from the source, such as rejected AWS credentials, a network failure or an invalid file, stops the command even when a default is set.

Without a value and without a default, the command stops with `Cannot resolve '${...}' variable at '<path>'. No value is available for this variable, and no default value was provided.`

## Nested variables

A variable can contain other variables; the Framework resolves the inner ones first. The following example reads the `CREDS` property from `config.qa.json` when you run `serverless deploy --stage qa`:

```yaml
provider:
  name: aws
  environment:
    MY_SECRET: ${file(./config.${sls:stage}.json):CREDS}
```

A value read from a source can contain variables too, and those are resolved in turn. A chain of variables that refers back to itself stops the command with `Cyclic reference found`.

## Variable resolvers

A resolver is a named, configured source, declared under `stages.<stage>.resolvers` in `serverless.yml`. Declare one to read from a second AWS account, another Region, a Terraform state or a Vault server. The resolver's name becomes the variable's source:

```yaml
stages:
  default:
    resolvers:
      sharedAccount:
        type: aws
        profile: shared-account
        euSsm:
          type: ssm
          region: eu-west-1

provider:
  name: aws

functions:
  hello:
    handler: handler.hello
    environment:
      SHARED_ACCOUNT_ID: ${sharedAccount:accountId}
      API_KEY: ${sharedAccount:ssm:/shared/api-key}
      EU_API_KEY: ${sharedAccount:euSsm:/shared/api-key}
```

This service also deploys with the `shared-account` profile: a single `type: aws` resolver supplies the deployment credentials when neither `provider.profile` nor `provider.resolver` is set. To deploy with other credentials, set `provider.profile`, or declare another `type: aws` resolver and name it in `provider.resolver`.

- `type` is required and selects the source, for example `aws`, `terraform`, `vault` or `doppler`. A resolver of type `aws` can declare nested resolvers (`euSsm` in the example) of type `ssm`, `s3` or `cf`; nested resolver names must be unique within a stage.
- `${<resolver>:ssm:<path>}`, `${<resolver>:s3:<address>}` and `${<resolver>:cf:<address>}` use the AWS resolver's credentials with the default settings, even when no nested resolver of that type is declared.
- `stages.default.resolvers` applies to every stage. A resolver with the same name under the current stage replaces the `default` one; the two blocks are not merged, so the stage block repeats `type` and every other setting it needs.
- `${aws:...}` and the source-only forms (`${ssm:...}`, `${s3:...}`, `${cf:...}`) use the deployment credentials: the resolver named in `provider.resolver`, otherwise the only resolver with `type: aws`, otherwise the default AWS credential chain. [AWS credentials](../../providers/aws/guide/credentials.md#using-resolvers-to-specify-deployment-credentials) explains how a deployment picks its credentials.

Each source page lists its resolver settings.

## Read string variable values as boolean values

Some properties need a boolean, while sources such as SSM parameters and environment variables return strings. To convert a string to a boolean, wrap it in `${strToBool(...)}`:

```yaml
provider:
  name: aws
  tracing:
    apiGateway: ${strToBool(${ssm:/my-service/api-gateway-tracing})}
```

`strToBool` trims and lowercases its input, then converts `true` and `1` to `true`, and `false` and `0` to `false`. Any other input stops the command with `Invalid "strToBool" input: Expected either "true", "false", "0", or "1".`

## Multiple configuration files

To keep a long `serverless.yml` readable, move parts of it into other files and insert them with [file variables](./file.md). The following `serverless.yml` combines resources defined inline with resources from two files:

```yaml
resources:
  - Resources:
      ApiGatewayRestApi:
        Type: AWS::ApiGateway::RestApi
  - ${file(./resources/first-cf-resources.yml)}
  - ${file(./resources/second-cf-resources.yml)}
  - Outputs:
      CognitoUserPoolId:
        Value:
          Ref: CognitoUserPool
```

The Framework merges the list items into one `resources` object, so each file holds the same top-level keys as `resources`, for example:

```yaml
# resources/first-cf-resources.yml
Resources:
  MyBucket:
    Type: AWS::S3::Bucket
```

`functions` accepts a list of objects in the same way.

## Variable sources

Built into the Framework:

- [Self-reference variables](./self.md): `${self:...}` reads another property of the same `serverless.yml`.
- [Serverless Core variables](./core.md): `${sls:stage}` and `${sls:instanceId}` give the stage and an ID of the current run.
- [Environment variables](./env-vars.md): `${env:...}` reads the shell environment and `.env` files.
- [CLI options](./cli-options.md): `${opt:...}` reads an option passed to the command.
- [Parameters](../parameters.md): `${param:...}` reads a stage parameter from `serverless.yml`, the CLI or the Dashboard.
- [File variables](./file.md): `${file(...)}` reads a YAML, JSON or text file.
- [JavaScript and TypeScript variables](./javascript.md): `${file(...)}` on a code file uses the values it exports or computes.
- [Git variables](./git.md): `${git:...}` reads the commit, branch or tags of the repository.

External sources:

- [AWS variables](./aws/README.md): `${aws:...}` gives the account ID, Region and partition, and sets up `aws` resolvers.
- [SSM Parameter Store and Secrets Manager](./aws/ssm.md): `${ssm:...}` reads a parameter or a secret.
- [S3 objects](./aws/s3.md): `${s3:...}` reads the content of an object.
- [CloudFormation stack outputs](./aws/cf-stack.md): `${cf:...}` reads an output of another stack.
- [Terraform state outputs](./hashicorp/terraform.md): reads outputs from an S3, HCP Terraform or HTTP backend.
- [Vault secrets](./hashicorp/vault.md): `${vault:...}` reads a HashiCorp Vault secret.
- [Doppler secrets](./doppler.md): `${doppler:...}` reads a Doppler secret.
- [Dashboard outputs](../dashboard/output-variables.md): `${output:...}` reads an output another service published to the Serverless Framework Dashboard.
- [Compose service outputs](../compose.md#service-dependencies-and-variables): `${service:<service>.<Output>}` reads another service's outputs, in `serverless-compose.yml` only.
- [Custom variables](../plugins/custom-variables.md): plugins can add their own sources.
