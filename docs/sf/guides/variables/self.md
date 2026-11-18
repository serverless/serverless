<!--
title: Self-Reference Variables
description: Reuse values from the same serverless.yml with self variables, including nested paths, array items, defaults and errors.
short_title: Self-References
keywords:
  ['Serverless Framework', 'serverless.yml', 'self variable', 'self-reference', 'Variables']
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/guides/variables/self)

<!-- DOCS-SITE-LINK:END -->

# Self-Reference Variables

A `${self:...}` variable reads another property of the same `serverless.yml`, so you define a value once and reuse it anywhere in the file. Use it for values shared by several functions or resources, such as a schedule, a table name or an export name.

The following `serverless.yml` defines a schedule once under `custom` and uses it for two functions, and builds a CloudFormation export name from the service name:

```yaml
# serverless.yml
service: my-service

provider:
  name: aws
  runtime: nodejs24.x

custom:
  globalSchedule: rate(10 minutes)
  exportName: ${self:service}-export

functions:
  hello:
    handler: handler.hello
    events:
      - schedule: ${self:custom.globalSchedule}
  world:
    handler: handler.world
    events:
      - schedule: ${self:custom.globalSchedule}

resources:
  Outputs:
    NewServiceExport:
      Value: 'A Value To Export'
      Export:
        Name: ${self:custom.exportName}
```

To change the schedule of both functions, edit `custom.globalSchedule`.

## Syntax of the self variable

The `self` variable takes a property path from the top of `serverless.yml`:

```text
${self:PROPERTY_PATH}
${self:PROPERTY_PATH, DEFAULT_VALUE}
```

- `PROPERTY_PATH` (required): the property's keys separated by dots, to any depth, for example `service`, `provider.region` or `custom.tables.users.name`. An array item is a numeric segment: `${self:custom.regions.0}` reads the first item of `custom.regions`. The path can't be empty: `${self:}` doesn't reference the whole file.
- `DEFAULT_VALUE` (optional): the value to use when the property is missing or `null`; see [Default value for a missing property](#default-value-for-a-missing-property).

The path can contain other variables, which resolve first: `${self:custom.domains.${sls:stage}}` reads the `custom.domains` entry for the current stage.

## Values a self variable returns

A `self` variable returns the property's value with its type: a string, number, boolean, list or object.

- When the variable is the whole value (`events: ${self:custom.events}`), the property's value replaces it, so a list or an object is inserted as a list or an object.
- When the variable is part of a longer string (`name: api-${self:custom.port}`), the value is converted to a string: numbers and booleans become their text, and a list becomes its items joined with commas. An object can't be embedded in a string, and the Framework stops with `String value consist of variable which resolve with non-string value`.
- When the referenced property itself contains variables, the Framework resolves those first and returns the result. In the opening example, `${self:custom.exportName}` returns `my-service-export`.

The `self` variable reads `serverless.yml` as written, before the Framework applies its defaults or CLI options. `${self:provider.stage}` returns the `provider.stage` you set in the file, not the `--stage` option and not the `dev` default; to get the stage of the current run, use [`${sls:stage}`](./core.md#stage-name).

## Default value for a missing property

When the property doesn't exist or its value is `null`, the `self` variable uses the default value after the comma:

```yaml
custom:
  logLevel: ${self:custom.overrides.logLevel, 'info'}
```

The default can be a quoted string (`'info'` or `"info"`), a number, `true`, `false`, or another variable such as `${env:LOG_LEVEL}` written without the `${}` (`${self:custom.logLevel, env:LOG_LEVEL, 'info'}`). The Framework tries each source from left to right and uses the first value that isn't `null`.

Without a default, a missing property stops the command with an error that names the variable and where it's used:

```text
Cannot resolve '${self:custom.missing}' variable at 'custom.value'. No value is available for this variable, and no default value was provided. Please check your variable definitions or provide a default value.
```

## Circular self-references

Two properties that reference each other can't be resolved, and the Framework stops with an error that lists the chain:

```text
Cyclic reference found: ${self:custom.a} -> ${self:custom.b}
```

To fix it, give one of the properties a value that doesn't depend on the other.

## Related variable sources

- [Variables](./README.md): how variables work, and the list of all variable sources.
- [Serverless Core variables](./core.md): `${sls:stage}` and `${sls:instanceId}`.
- [File variables](./file.md): read values from other YAML or JSON files.
- [Parameters](../parameters.md): stage-specific values set with `params`.
