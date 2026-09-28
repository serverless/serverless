---
name: serverless-framework
description: >-
  Builds, deploys, and operates applications on AWS with the Serverless Framework —
  serverless.yml configuration and the serverless/sls CLI. Use whenever
  serverless.yml or serverless-compose.yml is present, the user runs or debugs
  any serverless/sls command (deploy, dev, invoke, logs), mentions the Serverless
  Framework, or describes serverless work on AWS: Lambda functions, HTTP APIs,
  scheduled jobs, or event-driven workflows with any AWS service (API Gateway,
  S3, SQS, DynamoDB, and the rest).
metadata:
  managed-by: serverless-framework
  version: '1'
  scope: user
  author: Serverless Inc.
---

# Serverless Framework

The Serverless Framework deploys applications to AWS from one
`serverless.yml`: functions, the events that trigger them, and any other AWS
resources they need, as one stack per stage.

## Start here

- In every project with a `serverless.yml`, run `serverless agent setup` in
  that directory, even when this skill is already installed. It adds the
  Framework's project skills (one per feature) to the project and reports
  sign-in, AWS credentials, and the service, with a fix for anything missing.
  Commit the project skills and keep them even when the service doesn't use a
  feature yet: each one loads only when a task involves its feature,
  including adding it.
- Sort out sign-in with the user before the work that needs it: every command
  that builds or deploys needs it and AWS credentials
  ([references/cli.md](references/cli.md)), `serverless package` included.
- Give a database or other data store (DynamoDB, RDS, S3 buckets) its own
  service, deployed once to a shared stage; the app service reads its names
  and ARNs through `${param:...}`
  ([references/multi-service.md](references/multi-service.md)).
- Develop a feature test-first on a personal stage, with `serverless dev`,
  unit tests, and integration tests against the deployed stage
  ([references/development-workflow.md](references/development-workflow.md)).
- Don't answer from memory. `serverless agent docs` lists the documentation
  that ships with the installed CLI, matching its version and with no network
  needed; `serverless agent docs <path>` prints a page.

## First deploy of a service

1. `serverless agent setup` in the service directory.
2. Sign-in and AWS credentials, resolved with the user.
3. `serverless package`, which catches config and build errors before
   anything deploys. In a Compose project, deploy the services this one
   reads outputs from first (a data service, for example), then package it.
4. `serverless deploy --stage ${STAGE:-$USER}`: the developer's own stage,
   not the shared `dev`
   ([references/package-json-scripts.md](references/package-json-scripts.md)).
   Use `$USER` only when it is their name. If their name differs, deploy with
   it and have them set `STAGE`; if you don't know it, or `$USER` is generic
   (`root`, `ubuntu`), ask.
5. Verify with a real request to the endpoint, or `serverless invoke` and
   `serverless logs`.

## Where to look

- A new service; `serverless.yml` keys, events, IAM:
  [references/serverless-yml.md](references/serverless-yml.md).
- A starting point to adapt, or a working service for a runtime, event, or
  integration: the [Serverless Framework examples](https://github.com/serverless/examples).
- Extending the Framework past its built-in features (check
  `serverless agent docs` first): a plugin from the
  [Serverless plugins](https://github.com/serverless/plugins), added with
  `serverless plugin install --name <plugin>`. The Framework builds
  JavaScript and TypeScript itself, so it needs no bundler plugin
  (serverless-esbuild, serverless-webpack, serverless-plugin-typescript), nor
  the plugins it now includes, such as serverless-python-requirements.
- A database or other stateful resource, several services, values passed
  between services or stages, Compose, personal stages:
  [references/multi-service.md](references/multi-service.md), with
  [references/package-json-scripts.md](references/package-json-scripts.md).
- Adding or changing a feature (`serverless dev`, unit and integration
  tests): [references/development-workflow.md](references/development-workflow.md).
- Python functions (packaging dependencies, building for Lambda from macOS or
  Windows, the local loop without `serverless dev`):
  [references/python.md](references/python.md).
- Operating the CLI, credentials, CI/CD, troubleshooting:
  [references/cli.md](references/cli.md).
- The agent commands (`setup`, `docs`, `skills`, `inspect`, the CLI's own MCP
  server `serverless mcp`, `dev`): [references/agent-commands.md](references/agent-commands.md).
- Upgrading from v1–v3, or cleaning up older v4 config: the
  `serverless-upgrade` skill.
- Hosting an MCP server on AWS: the `serverless-mcp` skill.
- Untrusted, AI-generated, or per-session code in isolated compute: the
  `serverless-sandboxes` skill.

`agent setup` installs these three project skills into the project; where they
are not installed, `serverless agent skills read <name>` prints them.

## Gotchas

- `serverless` with no arguments waits at an interactive template picker.
  Write `serverless.yml` yourself; a person at a terminal can run it to
  scaffold a project.
- A project whose `frameworkVersion` pins v1–v3, or whose `devDependencies`
  list `serverless` v1–v3, cannot run `agent setup` or other v4 commands: set
  `frameworkVersion: '4'`, remove the local copy (`npm uninstall serverless`),
  then run `serverless agent setup` and follow the serverless-upgrade skill.
- `serverless package` checks the config and the build; checks against the AWS
  account, such as a resource name already taken, happen at deploy.
- To stop a background `serverless dev`, find the session with
  `pgrep -f 'sf-core\.js( [^ -][^ ]*)? dev( |$)'` (the pid from `$!` can be the
  launcher's) and kill that pid, then deploy the stage to restore it
  ([references/development-workflow.md](references/development-workflow.md)).
- When `serverless login` lists several orgs, ask which one the service
  belongs to and write `org:` into `serverless.yml`
  ([references/cli.md](references/cli.md)).
- A configuration change pushed with `serverless deploy function` stays after
  a later `serverless deploy`, which changes only what differs from the last
  template. Run `serverless deploy function -f NAME` again from the
  configuration you want.
- An `npm warn install-scripts` line naming `serverless` during
  `npm i -g serverless` is harmless: the CLI downloads its binary on first
  run.
