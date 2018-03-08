<!--
title: Serverless Framework Commands - Emit
menuText: emit
menuOrder: 11
description: Emit an event to a serverless service
layout: Doc
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->
### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/platform/commands/emit)
<!-- DOCS-SITE-LINK:END -->

# Emit

The `emit` command emits an event to a serverless service

```bash
serverless emit -n my.event -d '{"foo":"bar"}'

# Shorthand
sls emit -n my.event -d '{"foo":"bar"}'
```


## Options
- `--name` or `-n` The event name. **Required**.
- `--data` or `-d` The event data
- `--path` or `-p` Path to JSON or YAML file holding event data',
- `--url` or `-u` Event Gateway address
- `--datatype` or `-t` Data type for the event data. By default set to application/json



## Provided lifecycle Events
- `emit:emit`

## Examples

### Emitting an Event to locally running Event Gateway

```bash
serverless emit -n my.event -d '{"foo":"bar"}'
```

### Emitting an Event to a remote Event Gateway

```bash
serverless emit -n foo.bar -d '{"foo":"bar"}' -u https://mygateway.com
```
