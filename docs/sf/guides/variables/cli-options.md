<!--
title: CLI Option Variables
description: Read options passed to a serverless command in serverless.yml with opt variables, including value types, flags, aliases and defaults.
short_title: CLI Options
keywords: ['Serverless Framework', 'CLI Options', 'opt variable', 'Variables', 'Configuration']
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/guides/variables/cli-options)

<!-- DOCS-SITE-LINK:END -->

# CLI Option Variables

A `${opt:<option>}` variable reads an option passed to the `serverless` command, such as `--region eu-west-1` in `serverless deploy --region eu-west-1`. Use it for values that change from one run to the next without editing `serverless.yml`.

The following `serverless.yml` adds the Region passed with `--region` to the function names, and uses `us-east-1` when the option isn't passed:

```yaml
# serverless.yml
service: my-service

provider:
  name: aws
  runtime: nodejs24.x

functions:
  hello:
    handler: handler.hello
    name: my-service-${opt:region, 'us-east-1'}-hello
  world:
    handler: handler.world
    name: my-service-${opt:region, 'us-east-1'}-world
```

```bash
serverless deploy --region eu-west-1
```

With this command, the functions are named `my-service-eu-west-1-hello` and `my-service-eu-west-1-world`.

## Option names

`${opt:...}` reads only options the command accepts: the options every command takes, such as `--stage`, `--region`, `--aws-profile` and `--param`, the command's own options, and options a plugin declares for the command. Any other option stops the command before it runs, for example `Unrecognized option "prefix". Run "serverless deploy --help" for a list of all available options.` To pass your own values on the command line, use `--param "key=value"` and read them with [`${param:key}`](../parameters.md).

`<option>` is the option name exactly as typed, without the leading dashes: `--log-level debug` is `${opt:log-level}`, and `--logLevel` is a different option. The name can't be empty: `${opt:}` stops the command with a `SyntaxError`.

Short aliases are separate names. `-s prod` sets `${opt:s}`, not `${opt:stage}`, and `-r eu-west-1` sets `${opt:r}`, not `${opt:region}`. To read the stage however it was passed, use [`${sls:stage}`](./core.md); pass the Region as `--region`: with `-r`, [`${aws:region}`](./aws/README.md#region) has no value and the AWS variables don't fall back to `provider.region`.

## Option values

The `${opt:...}` variable resolves to the value as the command line gives it:

| Command line                       | `${opt:...}` value                                        |
| ---------------------------------- | --------------------------------------------------------- |
| `--memory 2048` or `--memory=2048` | `'2048'`, a string                                        |
| `--dry-run`                        | `true`                                                    |
| `--no-cache`                       | `${opt:cache}` is `false`                                 |
| `--tag a --tag b`                  | `['a', 'b']`, a list                                      |
| Option not passed                  | No value: the default after the comma, otherwise an error |

Without a value and without a default, the command stops with `Cannot resolve '${opt:...}' variable at '<path>'`. For defaults and quoting rules, see [Default values](./README.md#default-values).

## Related

- [Variables in serverless.yml](./README.md): syntax, defaults and the other variable sources.
- [Parameters](../parameters.md): `--param "key=value"` values read with `${param:key}`, with per-stage defaults in `serverless.yml`.
- [Serverless Core variables](./core.md): `${sls:stage}` for the stage of the current run.
