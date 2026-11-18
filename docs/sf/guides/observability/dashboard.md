<!--
title: Dashboard Observability Provider
description: Instrument a stage's Lambda functions for Serverless Framework Dashboard monitoring with observability set to dashboard in serverless.yml.
short_title: Dashboard
keywords: ['Serverless Framework', 'Observability', 'Monitoring', 'Serverless Dashboard', 'stages observability']
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/guides/observability/dashboard)

<!-- DOCS-SITE-LINK:END -->

# Dashboard observability provider

The `dashboard` observability provider instruments a service's Lambda functions for the Serverless Framework Dashboard, which shows their metrics, traces, logs and errors. Use it to monitor a stage of a service in the Dashboard; to send logs to Axiom instead, use the [Axiom provider](./axiom.md).

To instrument every function of the `prod` stage, set `org`, `app` and `observability: dashboard` for that stage, then run `serverless deploy --stage prod`:

```yaml
# serverless.yml
org: myorg
app: my-app
service: my-service

provider:
  name: aws
  runtime: nodejs22.x # a runtime the Dashboard instruments

stages:
  prod:
    observability: dashboard

functions:
  hello:
    handler: handler.hello
```

The Dashboard instruments functions on the `nodejs12.x` to `nodejs22.x` and `python3.8` to `python3.11` runtimes. Functions on other runtimes, such as `nodejs24.x` or `python3.14`, aren't instrumented.

## Requirements for Dashboard observability

- A Serverless Framework account at [app.serverless.com](https://app.serverless.com). The CLI must be signed in with `serverless login`, or have an Access Key of the org named in `org` in `SERVERLESS_ACCESS_KEY`.
- `org` and `app` set in `serverless.yml`. Without `app`, `observability: dashboard` instruments nothing, and `true` or `false` stops the command with `To instrument your service, you must set the "app" property in your config file.`
- For the first deploy to an AWS account that isn't connected to the org: AWS credentials that can create a CloudFormation stack with named IAM roles in `us-east-1`.

## Values that select the Dashboard

`stages.<stage>.observability` selects the Dashboard with any of these values:

- `dashboard`
- `true`
- `provider: dashboard` (the object form)

`false` removes the Dashboard instrumentation from the stage's functions. A stage without its own value uses the value under `stages.default`. [Observability providers](./README.md#the-stagesstageobservability-setting) lists every value.

## What serverless deploy does for the Dashboard

`serverless deploy` applies the setting; `serverless deploy function` and `serverless package` don't. With `dashboard`, `true` or `provider: dashboard`, the deploy:

1. Looks up the AWS account of the deployment's credentials in the Dashboard org. If the account isn't connected yet, creates the `Serverless-Inc-Role-Stack` CloudFormation stack in `us-east-1` and waits for it. If that stack already exists because the account is connected to another org, the deploy prints a warning and instruments nothing.
2. After the CloudFormation deploy, asks the Dashboard to instrument every function of the service in the deployment's Region, skipping functions that are already instrumented.

With `false`, when the AWS account is connected to the org, the deploy asks the Dashboard to remove the instrumentation from the service's functions in the deployment's Region; the AWS account stays connected. When the account isn't connected, `false` changes nothing. The steps don't prompt, so they run the same way in CI and for AI agents.

`serverless package` and `serverless deploy` with Axiom as the provider stop while any function of the service is instrumented by the Dashboard: set `observability: false` and deploy before switching the stage to Axiom.

## Related pages

- [Dashboard monitoring and observability](../dashboard/monitoring/README.md): the AWS account integration, supported Regions, what instrumentation adds to a function, trace sampling
- [Observability providers](./README.md)
- [Axiom](./axiom.md)
