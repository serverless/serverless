<!--
title: 'Configuration Validation (configValidationMode)'
description: 'How the Framework validates serverless.yml against its schema, and how configValidationMode (warn, error, off) handles invalid configuration.'
short_title: 'Configuration Validation'
keywords:
  [
    'Serverless Framework',
    'configValidationMode',
    'serverless.yml validation',
    'Invalid configuration encountered',
    'unrecognized property',
  ]
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/configuration-validation)

<!-- DOCS-SITE-LINK:END -->

# Configuration validation

The Serverless Framework checks your `serverless.yml` against a JSON schema before it runs a command, and reports unknown properties, wrong types and values outside the allowed set. The top-level `configValidationMode` setting decides what happens when the configuration doesn't match the schema: print a warning and continue (the default), stop the command, or report nothing.

To stop every command on an invalid configuration, which is useful in CI, set `configValidationMode: error` at the top level of `serverless.yml`:

```yaml
# serverless.yml
service: my-service
configValidationMode: error

provider:
  name: aws
  runtime: nodejs24.x

functions:
  hello:
    handler: handler.hello
```

## `configValidationMode` values

`configValidationMode` is a top-level string that applies to the whole service. It has no per-function or per-stage form, and it accepts variables such as `${env:CONFIG_VALIDATION_MODE, 'warn'}`.

| Value   | What happens when the configuration doesn't match the schema                                                                   |
| ------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `warn`  | Default. The Framework prints an `Invalid configuration encountered` warning that lists each error, and the command continues. |
| `error` | The command stops with exit code 1 and prints each error (`Configuration error ...`). Nothing is packaged or deployed.         |
| `off`   | The Framework prints no schema errors, and the command continues.                                                              |

Any other value is itself reported as a schema error (`at 'configValidationMode': must be equal to one of the allowed values [error, warn, off]`), and the schema validation then behaves as with `warn`.

## When validation runs

- On every command that loads the service's configuration: `deploy`, `package`, `print`, `info`, `invoke` and the others. The `serverless plugin` commands skip it, and so do commands that don't load the service, such as `serverless login`, `serverless usage`, `serverless agent setup` and `serverless mcp`.
- After variables are resolved, so the schema sees the final values, not the `${...}` references.
- Against the schema of the Framework plus the schema each loaded plugin adds. Properties a plugin reads at the top level, in `provider` or in a function without describing them in a schema are reported as unrecognized. `custom` accepts any property, and the `Properties` of a CloudFormation resource under `resources` aren't checked.

To check a configuration without deploying, run `serverless print`. It runs the same validation and prints the resolved configuration.

```bash
serverless print
```

## Validation messages

With `configValidationMode: warn` (or no setting), errors appear as a warning at the start of the command output, one line per error, with the path of the property:

```text
[!] Invalid configuration encountered
  at 'provider': unrecognized property 'timeoutt'

Learn more about configuration validation here: http://slss.io/configuration-validation
```

With `configValidationMode: error`, a single error is printed on one line and several errors are listed below the heading:

```text
✖ ServerlessError: Configuration error:
     at 'functions.hello.memorySize': must be integer
     at 'provider': unrecognized property 'timeoutt'

Learn more about configuration validation here: http://slss.io/configuration-validation
```

The message forms that occur most often:

- `unrecognized property '<name>'`: the property isn't in the schema. Check the spelling against the [serverless.yml reference](./providers/aws/guide/serverless.yml.md). If a plugin owns the property, the plugin doesn't declare it in a schema.
- `must be integer`, `must be string`, `must be object`: the value has the wrong type.
- `must be equal to one of the allowed values [...]`: the value isn't one of the listed values.

## Fix a validation error

1. Find the property in the message path (`functions.hello.memorySize` is `memorySize` under the `hello` function).
2. Compare it with the [serverless.yml reference](./providers/aws/guide/serverless.yml.md) or the page for the feature, and correct the name, type or value.
3. Run `serverless print` to confirm the warning or error is gone.

If the property belongs to a plugin, ask the plugin's maintainers to declare it; [Extending the configuration schema](./guides/plugins/custom-configuration.md) shows plugin authors how. If you're sure the configuration is valid and the Framework's own schema is missing a property, report it in the [Serverless Framework issue tracker](https://github.com/serverless/serverless/issues).

## Checks that `configValidationMode` doesn't control

Some checks run outside the schema validation, so `configValidationMode` changes only part of what they do:

- Web apps (`webApps`) and sandboxes (`sandboxes`) validate their own settings before packaging and stop the command on an invalid value, in every mode.
- AppSync (`appSync`) configuration errors follow the mode: they stop the command with `error`, print a warning with `warn`, and are not reported with `off` or with a `configValidationMode` value outside the allowed set.
- An invalid `frameworkVersion` range stops the command with `error`, and prints a warning with `warn` and `off`.

With `warn` or `off`, a deploy of an invalid configuration continues, and AWS CloudFormation or the feature that reads the value can still reject it later in the deploy.

## Related

- [serverless.yml reference](./providers/aws/guide/serverless.yml.md): every property the Framework accepts.
- [Extending the configuration schema](./guides/plugins/custom-configuration.md): how plugins declare their properties.
- [`serverless print`](./providers/aws/cli-reference/print.md): print the resolved configuration.
