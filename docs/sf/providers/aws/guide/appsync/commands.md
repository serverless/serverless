<!--
title: AppSync CLI Commands
description: Use serverless appsync commands to validate the schema, export introspection, flush the cache, read logs and manage the custom domain.
short_title: AppSync CLI Commands
keywords:
  [
    'Serverless Framework',
    'serverless appsync',
    'AppSync CLI',
    'AppSync introspection',
    'AppSync flush cache',
    'AppSync logs',
  ]
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/aws/guide/appsync/commands)

<!-- DOCS-SITE-LINK:END -->

# AppSync CLI commands

The `serverless appsync` commands work with the AppSync API of the service in the current directory: they validate its schema, export its introspection schema, flush its cache, open its consoles, print its logs and manage its custom domain. They are available when `serverless.yml` has an `appSync` block.

To check the schema before deploying:

```bash
serverless appsync validate-schema
```

`get-introspection`, `flush-cache`, `console`, `cloudwatch`, `logs`, `domain assoc` and `domain disassoc` read the API ID from the service's deployed CloudFormation stack, so deploy the service first; they stop with `AppSync Api not found in stack. Did you forget to deploy?` when the stack has no API. All commands take the usual `--stage`, `--region` and `--aws-profile` options to select the stack and the AWS credentials.

## Validate the schema

`serverless appsync validate-schema` checks the `appSync` configuration and the GraphQL schema files locally, with the AppSync directives and scalars predefined, and makes no AWS calls:

```bash
serverless appsync validate-schema
```

A valid schema prints `AppSync schema valid`. An invalid one stops the command with `Invalid GraphQL schema:` followed by each error.

Problems in the `appSync` configuration follow `configValidationMode`: with the default `warn`, the command prints `Invalid AppSync Configuration` as a warning and still prints `AppSync schema valid` when the schema is valid. To make `validate-schema` stop on configuration problems, for example in CI, set `configValidationMode: error` at the top level of `serverless.yml`.

## Export the introspection schema

`serverless appsync get-introspection` downloads the deployed API's schema from AppSync and prints it, or writes it to a file:

```bash
serverless appsync get-introspection --format SDL --output schema.deployed.graphql
```

| Option     | Shortcut | Value                      | Default | Description                                                                                    |
| ---------- | -------- | -------------------------- | ------- | ---------------------------------------------------------------------------------------------- |
| `--format` | `-f`     | `JSON` or `SDL` (any case) | `JSON`  | The output format: an introspection result in JSON, or GraphQL schema language.                |
| `--output` | `-o`     | file path                  | stdout  | The file to write, relative to the current working directory. An existing file is overwritten. |

## Flush the cache

`serverless appsync flush-cache` deletes every entry in the API's [server-side cache](./caching.md), so the next requests read from the data sources:

```bash
serverless appsync flush-cache --stage prod
```

It prints `Cache flushed successfully`. The API must have a cache (`appSync.caching`).

## Open the AppSync console

`serverless appsync console` opens the API's page in the AWS AppSync console, in the default browser:

```bash
serverless appsync console
```

## Open the CloudWatch logs console

`serverless appsync cloudwatch` opens the API's log group (`/aws/appsync/apis/<api id>`) in the CloudWatch console, in the default browser:

```bash
serverless appsync cloudwatch
```

The `console` and `cloudwatch` commands print nothing; on a machine without a browser, such as CI, they have no effect.

## Print the API logs

`serverless appsync logs` prints events from the API's log group, `/aws/appsync/apis/<api id>`, one per line as `<ISO timestamp><tab><message>`. The API needs [logging](./general-config.md#appsync-logging) turned on:

```bash
serverless appsync logs --startTime 1h --filter ERROR
```

| Option        | Shortcut | Value                                                       | Default | Description                                                                                     |
| ------------- | -------- | ----------------------------------------------------------- | ------- | ----------------------------------------------------------------------------------------------- |
| `--startTime` | None     | ISO 8601 date-time, or a duration such as `30m`, `2h`, `1d` | `10m`   | The earliest event to print. A duration counts back from now; a number without a unit is hours. |
| `--filter`    | `-f`     | CloudWatch Logs filter pattern                              | None    | Prints only matching events, such as a request ID.                                              |
| `--tail`      | `-t`     | None                                                        | Off     | Keeps polling for new events until you stop the command.                                        |
| `--interval`  | `-i`     | milliseconds                                                | `1000`  | With `--tail`, the time between polls.                                                          |

Without `--tail`, the command prints one page of results (up to 10,000 events or 1 MB) and exits.

## Manage the custom domain

The `serverless appsync domain` commands create, associate and remove the [custom domain](./custom-domain.md) of the API outside CloudFormation. Use them with `domain.useCloudFormation: false` in `serverless.yml`; they read the domain settings (`name`, `certificateArn`, `hostedZoneId`, `hostedZoneName`) from the `appSync.domain` block.

To set up a domain and point it at this stage's API, run:

```bash
serverless appsync domain create --stage prod
serverless appsync domain assoc --stage prod
serverless appsync domain create-record --stage prod
```

When `domain.useCloudFormation` isn't `false`, each `domain` command first warns that it can cause drift from the CloudFormation stack and asks `Do you want to continue? y/N`. Some commands ask again before a destructive step. The questions read from the terminal, so in CI and other runs without a terminal pass `--yes` (`-y`), which answers yes to every question. Answering no at the drift question exits with code 0 and changes nothing.

| Command                | What it does in AWS                                                                                                                          | Options            |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ |
| `domain create`        | Creates the AppSync domain name with `certificateArn`, or with an issued `us-east-1` ACM certificate for `name` or its wildcard.             | `--quiet`, `--yes` |
| `domain assoc`         | Associates the domain with this stage's API and waits until the association succeeds. Asks before replacing an association with another API. | `--yes`            |
| `domain create-record` | Creates a Route 53 `A` alias record for `name` pointing at the domain, and waits until it is in sync.                                        | `--quiet`, `--yes` |
| `domain delete-record` | Deletes that Route 53 record, after a confirmation.                                                                                          | `--quiet`, `--yes` |
| `domain disassoc`      | Removes the domain's association with this stage's API, after a confirmation, and waits until it is gone.                                    | `--force`, `--yes` |
| `domain delete`        | Deletes the AppSync domain name, after a confirmation. Disassociate the API first.                                                           | `--quiet`, `--yes` |

The domain options:

| Option    | Shortcut | Description                                                                                                                                    |
| --------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `--yes`   | `-y`     | Answers yes to every confirmation question.                                                                                                    |
| `--quiet` | `-q`     | Logs an error instead of failing the command, for example when the domain already exists or `No certificate found for domain api.example.com.` |
| `--force` | `-f`     | With `disassoc`: removes the association even when the domain points at an API from another stage or stack.                                    |

`create-record` and `delete-record` find the hosted zone by `hostedZoneId`, else by `hostedZoneName`, else by the parent domain of `name`. `create-record` needs the domain to exist, and otherwise stops with `Domain api.example.com not found`.

**Warning:** `domain delete` and `domain disassoc` take the custom domain offline for every client that uses it.

## Related pages

- [AppSync custom domain](./custom-domain.md)
- [AppSync caching](./caching.md)
- [AppSync API configuration](./general-config.md)
- [AppSync overview](./README.md)
