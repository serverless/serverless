<!--
title: Dashboard Overview and Setup
description: Connect a Serverless Framework service to the Dashboard with org and app to record deployments, share parameters and outputs, and monitor functions.
short_title: Dashboard
keywords: ['Serverless Framework', 'Serverless Dashboard', 'org', 'app', 'Setup', 'Observability']
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/guides/dashboard)

<!-- DOCS-SITE-LINK:END -->

# Dashboard overview and setup

The [Serverless Framework Dashboard](https://app.serverless.com/) is the web app that works with the `serverless` CLI: it records your deployments, stores parameters and outputs that services share, hands out AWS credentials, and monitors your AWS Lambda functions. A service uses the Dashboard when its `serverless.yml` sets `org` and `app`.

To connect a service, add `org` and `app` next to `service` and deploy:

```yaml
# serverless.yml
org: myorg
app: my-app
service: my-service

provider:
  name: aws
  runtime: nodejs24.x
  region: us-east-1

functions:
  hello:
    handler: handler.hello
```

```bash
serverless deploy
```

After the deploy, the service, its stage and Region appear under the app in the Dashboard. The CLI must be signed in with a Serverless Framework account, or have an Access Key in `SERVERLESS_ACCESS_KEY`: a License Key can't use Dashboard features.

## Dashboard features

- **Deployments**: `serverless deploy` and `serverless remove` record each deployment, with its stage, Region, AWS account, CloudFormation stack status and outputs, for services that set `org`, `app` and `service`.
- **Parameters**: store parameters and secrets per service or per stage and read them with `${param:...}`. See [Serverless Dashboard parameters](../parameters.md#serverless-dashboard-parameters).
- **Outputs**: publish values from one service and read them in another with `${output:...}`. See [Dashboard outputs](./output-variables.md).
- **Providers**: let deployments use AWS credentials that the Dashboard issues from an IAM role, instead of local credentials. See [Dashboard providers](./providers.md).
- **Observability**: metrics, traces, logs and alerts for Lambda functions, including functions not deployed with the Framework. See [Dashboard monitoring and observability](./monitoring/README.md).
- **CI/CD**: build and deploy services from a Git repository. See [Dashboard CI/CD](./cicd/README.md).

## Account and key requirements

Dashboard features apply to a service when `org`, `app` and `service` are all set in `serverless.yml`. Commands for such a service need one of these:

- A Serverless Framework account signed in with `serverless login`. The session is saved in `~/.serverlessrc`.
- An Access Key in the `SERVERLESS_ACCESS_KEY` environment variable, for CI and other runs without a browser. Create one under [Access Keys](https://app.serverless.com/settings/accessKeys) in the Dashboard.

With a License Key, a service that sets `app` stops with this error:

```text
This Service is enabled for Serverless Framework Dashboard because the "app" property is set. However, you are using a License Key and Dashboard features are not available when using License Keys. Please remove "app" and any other Dashboard features to continue using this Service.
```

To keep using a License Key, remove `app` from `serverless.yml`. For how the CLI signs in and picks an org, see [serverless login](../../providers/aws/cli-reference/login.md).

## Connect an existing service with the serverless command

To add `org` and `app` interactively, run `serverless` with no arguments in the directory that holds `serverless.yml`:

```bash
serverless
```

The `serverless` command:

1. Signs you in, if the CLI isn't signed in yet.
2. Adds `org: <your default org>` at the top of `serverless.yml`, if no `org` is set.
3. When you are signed in with an account, lists the apps in the org and adds the app you create or select as `app`. You can also skip this step.
4. Removes `frameworkVersion` from `serverless.yml`.
5. Checks that AWS credentials are available for deploying.

The command edits only `serverless.yml` and `serverless.yaml` files; for `serverless.ts`, `serverless.js` or `serverless.json`, add `org` and `app` yourself. To choose the values without the prompts, pass them as options:

```bash
serverless --org myorg --app my-app
```

The command prompts in the terminal. In CI or for AI agents, set `org` and `app` in `serverless.yml` and `SERVERLESS_ACCESS_KEY` in the environment instead.

## Org and app values

The `org` property is the name of your Dashboard org: lowercase letters and digits, 2 to 39 characters. The `app` property groups services in the org: lowercase letters, digits and single hyphens, 2 to 39 characters, not starting or ending with a hyphen. Both are top-level properties of `serverless.yml`, so they apply to the whole service. For what orgs, apps and instances are, see [Dashboard orgs, apps and members](./concepts.md).

## Turn on observability for a service

To send metrics and traces of a service's functions to the Dashboard, set `observability` for the stages you want under `stages` in `serverless.yml`:

```yaml
# serverless.yml
org: myorg
app: my-app
service: my-service

stages:
  prod:
    observability: true
  default:
    observability: false
```

On the first `serverless deploy` with observability on, the CLI connects the AWS account to the Dashboard by creating the `Serverless-Inc-Role-Stack` CloudFormation stack in `us-east-1`. Supported runtimes, the IAM roles in that stack and the other setup options are in [Dashboard monitoring and observability](./monitoring/README.md).

## Related pages

- [Dashboard orgs, apps and members](./concepts.md)
- [Dashboard outputs](./output-variables.md)
- [Dashboard monitoring and observability](./monitoring/README.md)
- [Serverless Dashboard parameters](../parameters.md#serverless-dashboard-parameters)
