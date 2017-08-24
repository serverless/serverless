<!--
title: Serverless Framework Commands - Run
menuText: run
menuOrder: 11
description: Run the serverless service locally
layout: Doc
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->
### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/platform/commands/run)
<!-- DOCS-SITE-LINK:END -->

# Run

The `run` command starts the serverless service locally.

```bash
serverless run

# Shorthand
sls run
```

## Supported Languages
NOTE: *currently supports node js 6.3+ only*

## Supported Providers
- AWS Lambda
- Google Cloud Functions (Pub/Sub only, HTTP coming soon)

## Options
- `--debug` or `-d` Start the emulator in debug mode  
- `--eport` or `-e` The Event Gateway API port. Defaults to 4000
- `--cport` or `-c` The Event Gateway configuration port. Defaults to 4001
- `--lport` or `-l` The Emulator port. Defaults to 4002


## Provided lifecycle events
- `run:run`
