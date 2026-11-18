<!--
title: serverless print
description: Print serverless.yml with every variable resolved, as YAML, JSON or text, to check what the Framework will deploy with serverless print.
short_title: print
keywords:
  [
    'serverless print',
    'Serverless Framework CLI',
    'resolved serverless.yml',
    'debug variables',
  ]
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/aws/cli-reference/print)

<!-- DOCS-SITE-LINK:END -->

# serverless print

`serverless print` resolves every [variable](../../../guides/variables/README.md) in `serverless.yml` for a stage and prints the resulting configuration, so you can check what a `${...}` reference resolves to before you deploy. It deploys nothing; variables that read AWS, such as `${ssm:...}`, are resolved with the stage's credentials. To see the CloudFormation template the configuration produces, use [`serverless package`](./package.md); to compare it with the deployed stack, use [`serverless diff`](./diff.md).

```bash
serverless print
```

## Options

`serverless print` accepts these options:

| Option          | Alias | Value                    | Default                             | Required | Description                                                                                                                   |
| --------------- | ----- | ------------------------ | ----------------------------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `--format`      |       | `yaml`, `json` or `text` | `yaml`                              | No       | Output format. `text` prints a string, number or list (one item per line); an object stops the command.                       |
| `--path`        |       | dot-separated path       | The whole configuration             | No       | Print only the value at this path, such as `provider.name`.                                                                   |
| `--transform`   |       | `keys`                   |                                     | No       | Print the keys of the selected object instead of the object.                                                                  |
| `--stage`       | `-s`  | string                   | `provider.stage`, else `dev`        | No       | Stage to resolve the configuration for.                                                                                       |
| `--region`      | `-r`  | string                   | `provider.region`, else `us-east-1` | No       | AWS Region to resolve the configuration for.                                                                                  |
| `--aws-profile` |       | string                   | `provider.profile`                  | No       | AWS profile whose credentials variables are resolved with.                                                                    |
| `--config`      | `-c`  | file path                | `serverless.yml`                    | No       | Service configuration file to print.                                                                                          |
| `--debug`       |       | namespace                |                                     | No       | Also print a table of every resolved variable. See [Show where each variable came from](#show-where-each-variable-came-from). |

The command also accepts the options every command takes: `--param="key=value"` (repeatable), `--org`, `--app`, `--verbose` and `--help` (`-h`).

## What serverless print shows

`serverless print` prints the configuration as written, with each variable replaced by its value and two changes: `provider.stage` holds the resolved stage, and `params` keeps only the `default` entry and the entry for that stage. It does not add the Framework's other defaults or the resources it generates.

For example, with this `serverless.yml`:

```yaml
# serverless.yml
service: my-service

custom:
  bucketName: ${self:service}-${sls:stage}-uploads

provider:
  name: aws
  runtime: nodejs24.x

functions:
  hello:
    handler: handler.hello

resources:
  Resources:
    MyBucket:
      Type: AWS::S3::Bucket
      Properties:
        BucketName: ${self:custom.bucketName}
```

`serverless print` prints:

```text
service: my-service
custom:
  bucketName: my-service-dev-uploads
provider:
  name: aws
  runtime: nodejs24.x
  stage: dev
functions:
  hello:
    handler: handler.hello
resources:
  Resources:
    MyBucket:
      Type: AWS::S3::Bucket
      Properties:
        BucketName: my-service-dev-uploads
```

The configuration goes to standard output and progress messages to standard error, so `serverless print --format json > resolved.json` writes a file you can read with other tools.

## Print one value

`serverless print --path` selects one value by its dot-separated path. A path that does not exist, or whose value is empty, `false` or `0`, stops the command with `Path "<path>" not found`. `--transform keys` turns the selected object into the list of its keys, and `--format text` prints a value or a list without YAML or JSON syntax. Any other `--transform` stops the command with `Transform can only be "keys"`, and any other `--format` with `Format must be "yaml", "json" or "text"`.

## Show where each variable came from

With `--debug`, `serverless print` also prints a table with one row per resolved variable: its path in the configuration, the original `${...}` text, the resolved value and the source that resolved it. The table goes to standard error, along with the debug log.

```bash
serverless print --debug
```

## Side effects and CI use

- `serverless print` deploys nothing, and the command itself changes nothing locally or in AWS. Variables that read other services, such as `${ssm:...}` or `${cf:...}`, make read calls with the stage's credentials. Code that runs while the configuration resolves, such as a [JavaScript or TypeScript resolver](../../../guides/variables/javascript.md) referenced with `${file(...)}` or a plugin, runs as written, including any files it writes or APIs it calls.
- The command does not prompt, so it can run in CI, for example to check a stage's resolved configuration before a deploy.
- The printed configuration contains every resolved value, including secrets read from SSM Parameter Store or Secrets Manager; don't publish it in build logs.

## Provided lifecycle events

- `print:print`

## Examples

### Print the configuration for a stage as JSON

```bash
serverless print --stage prod --format json
```

### Print the provider name

```bash
serverless print --path provider.name --format text
```

### Print all function names

```bash
serverless print --path functions --transform keys --format text
```

## Related commands

- [`serverless package`](./package.md) builds the CloudFormation template from the resolved configuration.
- [`serverless diff`](./diff.md) compares that template with the deployed stack.
