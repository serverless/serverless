<!--
title: Serverless Framework - AppSync - CLI Commands
description: CLI commands for AWS AppSync with the Serverless Framework.
short_title: AppSync - CLI Commands
keywords:
  [
    'Serverless Framework',
    'AppSync',
    'CLI',
    'Commands',
    'GraphQL',
    'AWS',
  ]
-->

# Commands

The AppSync integration provides some useful commands to explore and manage your API.

## `validate-schema`

This commands allows you to validate your GraphQL schema.

```bash
sls appsync validate-schema
```

## `get-introspection`

Allows you to extract the introspection of the schema as a JSON or SDL.

**Options**

- `--format` or `-f`: the format in which to extract the schema. `JSON` or `SDL`. Defaults to `JSON`
- `--output` or `-o`: a file where to output the schema. If not specified, prints to stdout

```bash
sls appsync get-introspection
```

## `flush-cache`

If your API uses the server-side [Caching](caching.md), this command flushes the cache.

```bash
sls appsync flush-cache
```

## `console`

Opens a new browser tab to the AWS console page of this API.

```bash
sls appsync console
```

## `cloudwatch`

Opens a new browser tab to the CloudWatch logs page of this API.

```bash
sls appsync cloudwatch
```

## `logs`

Outputs the logs of the AppSync API to stdout.

**Options**

- `--startTime`: Starting time. You can use human-friendly relative times. e.g. `30m`, `1h`, etc. Default: `10m` (10 minutes ago)
- `--tail` or `-t`: Keep streaming new logs.
- `--interval` or `-i`: Tail polling interval in milliseconds. Default: `1000`.
- `--filter` or `-f`: A filter pattern to apply to the logs stream.

```bash
sls appsync logs --filter '86771d0c-c0f3-4f54-b048-793a233e3ed9'
```

## `domain`

Manage the domain for this AppSync API.

## Create the domain

Before associating a domain to an API, you must first create it. You can do so using the following command.

**Options**

- `--quiet` or `-q`: Don't return an error if the operation fails
- `--stage`: The stage to use

```bash
sls appsync domain create
```

## Delete the domain

Deletes a domain from AppSync.

**Options**

- `--quiet` or `-q`: Don't return an error if the operation fails
- `--yes` or `-y`: Automatic yes to prompts
- `--stage`: The stage to use

```bash
sls appsync domain delete
```

If an API is associated to it, you will need to [disassociate](#disassociate-the-api-from-the-domain) it first.

## Create a route53 record

If you use Route53 for your hosted zone, you can also create the required CNAME record for your custom domain.

- `--quiet` or `-q`: Don't return an error if the operation fails
- `--stage`: The stage to use

```bash
sls appsync domain create-record
```

## Delete the route53 record

- `--quiet` or `-q`: Don't return an error if the operation fails
- `--yes` or `-y`: Automatic yes to prompts
- `--stage`: The stage to use

```bash
sls appsync domain delete-record
```

## Associate the API to the domain

Associate the API in this stack to the domain.

- `--quiet` or `-q`: Don't return an error if the operation fails
- `--stage`: The stage to use

```bash
sls appsync domain assoc --stage dev
```

You can associate an API to a domain that already has another API attached to it. The old API will be replaced by the new one.

## Disassociate the API from the domain

- `--quiet` or `-q`: Don't return an error if the operation fails
- `--yes` or `-y`: Automatic yes to prompts
- `--stage`: The stage to use

```bash
sls appsync domain disassoc --stage dev
```
