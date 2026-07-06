---
name: serverless-framework-cli
description: How to run Serverless Framework CLI commands (deploy, dev, invoke, logs, remove) in this service. Use when working with serverless.yml or deploying this project.
metadata:
  managed-by: serverless-framework
  version: '1'
  author: Serverless Inc.
---

# Serverless Framework CLI

This service uses the Serverless Framework (`serverless.yml`). Common commands:

- `serverless deploy` — deploy the whole service
- `serverless deploy function --function <name>` — fast single-function deploy
- `serverless dev` — local emulation routing invocations to your machine
- `serverless invoke --function <name>` / `invoke local` — run a function
- `serverless logs --function <name>` — fetch function logs
- `serverless info` — stack outputs and endpoint URLs
- `serverless remove` — tear the service down

Read `serverless.yml` before changing configuration. Prefer `serverless print`
to inspect the fully-resolved config.
