<!--
title: File Variables
description: Read values from YAML, JSON and text files in serverless.yml with file variables, including whole files, nested properties and defaults.
short_title: File Variables
keywords: ['Serverless Framework', 'file variable', 'YAML', 'JSON', 'external file', 'Configuration']
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/guides/variables/file)

<!-- DOCS-SITE-LINK:END -->

# File Variables

A `${file(...)}` variable inserts the content of another file, or one property from it, into `serverless.yml`. Use it to share settings between services, to keep per-stage settings in separate files, or to move long blocks such as CloudFormation resources out of `serverless.yml`.

The following `config.yml` holds a schedule and a list of events:

```yaml
# config.yml
globalSchedule: rate(10 minutes)
myevents:
  - schedule:
      rate: rate(1 minute)
```

The following `serverless.yml`, in the same directory, reads one property, a list and the whole file from `config.yml`:

```yaml
# serverless.yml
service: my-service

provider:
  name: aws
  runtime: nodejs24.x

custom: ${file(./config.yml)}

functions:
  hello:
    handler: handler.hello
    events:
      - schedule: ${file(./config.yml):globalSchedule}
  world:
    handler: handler.world
    events: ${file(./config.yml):myevents}
```

`custom` receives the whole file, so `${self:custom.globalSchedule}` returns the same value as `${file(./config.yml):globalSchedule}`.

## Syntax of the file variable

```text
${file(FILE_PATH)}
${file(FILE_PATH):PROPERTY_PATH}
${file(FILE_PATH):PROPERTY_PATH, DEFAULT_VALUE}
```

- `FILE_PATH` (required): the path of the file, relative to the directory that contains `serverless.yml`, or an absolute path. The path can contain other variables, for example `${file(./config.${sls:stage}.json)}` reads `config.prod.json` when the stage is `prod`. A symbolic link is followed, and the target file is read.
- `PROPERTY_PATH` (optional): the property to read, with keys separated by dots, to any depth (`database.connection.host`). An array item is a numeric segment: `myevents.0` is the first item of `myevents`. Without a property path, the variable returns the whole file.
- `DEFAULT_VALUE` (optional): the value to use when the file or the property doesn't exist; see [Default value for a missing file or property](#default-value-for-a-missing-file-or-property).

## Supported file types

The file's extension decides how the Framework reads it:

| Extension             | Read as           | Value returned                                                                                                          |
| --------------------- | ----------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `.yml`, `.yaml`       | YAML              | The parsed file, or the property at `PROPERTY_PATH`                                                                     |
| `.json`, `.tfstate`   | JSON              | The parsed file, or the property at `PROPERTY_PATH`                                                                     |
| `.js`, `.cjs`, `.mjs` | JavaScript module | The module's export, or the result of the exported function; see [JavaScript and TypeScript variables](./javascript.md) |
| `.ts`, `.mts`, `.cts` | TypeScript module | Same as JavaScript, compiled on the fly; see [JavaScript and TypeScript variables](./javascript.md)                     |
| Any other extension   | Plain text        | The whole file content as a string (UTF-8)                                                                              |

Give each file the extension of its format: a JSON document saved as `config.txt` is returned as a string, not parsed.

YAML files can use the CloudFormation short-form tags, such as `!Ref`, `!GetAtt` and `!Sub`, so a file of CloudFormation resources reads the same way as the `resources` section of `serverless.yml`.

To read Terraform outputs from remote state rather than a local `.tfstate` file, use [Terraform variables](./hashicorp/terraform.md).

## Read a whole file or one property

The following `config.json` holds settings for two stages:

```json
{
  "dev": { "memorySize": 512, "logLevel": "debug" },
  "prod": { "memorySize": 1024, "logLevel": "info" }
}
```

The following `serverless.yml` reads the `memorySize` of the current stage and the whole settings object of the current stage:

```yaml
# serverless.yml
service: my-service

provider:
  name: aws
  runtime: nodejs24.x
  memorySize: ${file(./config.json):${sls:stage}.memorySize}

custom:
  settings: ${file(./config.json):${sls:stage}}

functions:
  hello:
    handler: handler.hello
```

When the variable is the whole value of a property, the file's value keeps its type: a number stays a number, and an object or a list is inserted as an object or a list. When the variable is part of a longer string (`name: api-${file(./config.json):dev.memorySize}`), the value is converted to a string, and an object can't be embedded.

A YAML or JSON file whose whole content is `0`, `false` or an empty string resolves to no value when it's read without a property path: the variable takes its default value, or stops the command when it has none. A property with one of these values, such as `{ "count": 0 }` read with `:count`, keeps its value.

## Variables inside a referenced file

A referenced YAML or JSON file can contain variables. The Framework inserts the file's content into `serverless.yml` and then resolves the variables in it, so inside the file:

- `${self:...}` refers to properties of `serverless.yml`, not of the referenced file.
- A nested `${file(...)}` path is relative to the directory that contains `serverless.yml`, not to the referenced file.

The following `functions/common.yml` reads the VPC settings from `serverless.yml`:

```yaml
# functions/common.yml
api:
  handler: api.handler
  vpc:
    securityGroupIds: ${self:custom.vpc.securityGroupIds}
    subnetIds: ${self:custom.vpc.subnetIds}
```

## Split CloudFormation resources into files

To keep `serverless.yml` short, reference files of CloudFormation resources from the `resources` section. Each file holds a `Resources` (or `Outputs`) block, and `resources` takes a list of them:

```yaml
# serverless.yml
resources:
  - ${file(./resources/dynamodb.yml)}
  - ${file(./resources/s3.yml)}
```

```yaml
# resources/s3.yml
Resources:
  UploadsBucket:
    Type: AWS::S3::Bucket
```

For more on this pattern, see [Multiple configuration files](./README.md#multiple-configuration-files).

## Default value for a missing file or property

For a YAML, JSON or plain-text file, when the file doesn't exist, or the property at `PROPERTY_PATH` doesn't exist or is `null`, the variable uses the default value after the comma. A missing JavaScript or TypeScript file stops the command even with a default; see [Missing values and errors](./javascript.md#missing-values-and-errors).

For example:

```yaml
custom:
  settings: ${file(./config.${sls:stage}.yml), file(./config.default.yml)}
  logLevel: ${file(./config.yml):logLevel, 'info'}
```

The default can be a quoted string, a number, `true`, `false`, or another variable written without the `${}`. The Framework tries each source from left to right and uses the first one that has a value.

Without a default, a missing file or property stops the command with an error that names the variable and where it's used:

```text
Cannot resolve '${file(./config.yml):logLevel}' variable at 'custom.logLevel'. No value is available for this variable, and no default value was provided. Please check your variable definitions or provide a default value.
```

A file that exists but can't be parsed stops the command even when the variable has a default, with an error such as `Cannot parse YAML from "/path/to/config.yml": ...` or `Cannot parse JSON from "/path/to/config.json": ...`.

## Related variable sources

- [Variables](./README.md): how variables work, and the list of all variable sources.
- [JavaScript and TypeScript variables](./javascript.md): compute values with code in a `.mjs` or `.ts` file.
- [Self-reference variables](./self.md): reuse values from the same `serverless.yml`.
- [Parameters](../parameters.md): stage-specific values set with `params`.
