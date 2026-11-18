<!--
title: Upgrading to v4
description: 'Upgrade Serverless Framework services from v3 or earlier to v4: sign-in, licensing and pricing, breaking changes, built-in plugins and steps.'
short_title: Upgrading to v4
keywords:
  [
    'Serverless Framework',
    'upgrade to v4',
    'Serverless Framework v3 to v4',
    'licensing',
    'authentication',
    'frameworkVersion',
  ]
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/guides/upgrading-v4/)

<!-- DOCS-SITE-LINK:END -->

# Upgrading to v4

This guide upgrades a Serverless Framework service from v3 or earlier to v4, the version released in May 2024. Most AWS services deploy with v4 without configuration changes. What changes is how the CLI runs: it requires a sign-in or a License Key, it needs Node.js 18 or later, it refuses `frameworkVersion` pins below 4, and a few defaults and plugins differ. Organizations with more than $2 million in annual revenue need a subscription ([License changes](#license-changes)). Version 3 has not been maintained since early 2025.

To have an AI coding agent do the upgrade, point it at the `serverless-upgrade` Agent Skill that ships with the CLI. It checks every change in this guide and verifies that the packaged CloudFormation template stays the same:

```bash
serverless agent skills read serverless-upgrade
```

A video answers common questions about v4 licensing and the upgrade (website only):

::youtube{id="p7dnwVslChs"}

## Upgrade steps

Prerequisites: Node.js 18 or later with `npm`, and a Serverless Framework Dashboard account or a License Key.

1. Confirm that the service deploys to AWS: v4 runs only services with `provider.name: aws` ([AWS only](#aws-only)).
2. Install v4 globally:

   ```bash
   npm install -g serverless
   ```

3. In the service directory, remove a `serverless` v3 or earlier from `devDependencies` (`npm uninstall serverless`), and set `frameworkVersion: '4'` in `serverless.yml` ([Version pins and local v3 installs](#version-pins-and-local-v3-installs)).
4. Sign in with `serverless login`, or set a License Key ([Authentication requirement](#authentication-requirement)).
5. Review the plugins in `serverless.yml`: remove those built into v4, and set `build.esbuild: false` if you keep a build plugin ([Plugins](#plugins), [Build plugins and the built-in esbuild](#build-plugins-and-the-built-in-esbuild)).
6. If the service relied on `useDotenv: true`, add `'!.env*'` to `package.patterns` ([Environment files loaded by default](#environment-files-loaded-by-default)).
7. Deploy the service to a new test stage and check it:

   ```bash
   serverless deploy --stage testv4
   ```

8. Add an Access Key (`SERVERLESS_ACCESS_KEY`) or a License Key to your CI/CD pipelines.

If a step fails, contact support at support@serverless.com.

To keep a service on v3 instead, see [Keep a project on v3](#keep-a-project-on-v3).

## Breaking changes

Each of these changes can stop a v3 service or change how it deploys under v4.

### Authentication requirement

The v4 CLI runs service commands only when it is signed in or has a key. Without either, it prompts for a sign-in in a terminal, and stops with an error in CI and other runs without a terminal. Choose one of these:

- **Dashboard sign-in.** Run `serverless login` to sign in with your Serverless Framework Dashboard account; the CLI creates an Access Key on your machine. For CI/CD, create an Access Key under [Settings > Access Keys](https://app.serverless.com/settings/accessKeys) and set it as `SERVERLESS_ACCESS_KEY`. Signing in doesn't turn on Dashboard features; a service uses them only when it sets `app`.
- **License Key.** For teams that use only the CLI, without the Dashboard. Set the key in `SERVERLESS_LICENSE_KEY`, in `licenseKey` in `serverless.yml`, or in the AWS SSM parameter `/serverless-framework/license-key` of the AWS account you deploy to, so no one has to distribute it. A service that sets `app` can't use a License Key. See [License Keys](./license-keys.md).

### AWS only

v4 deploys only to AWS. A `provider.name` other than `aws` stops every command with `Serverless Framework V.4 only supports "aws" as a Provider.`, and a variable in `provider.name` stops it with `Serverless Framework Variables are not supported for "provider.name".` Services for other cloud providers stay on v3 ([Keep a project on v3](#keep-a-project-on-v3)).

### Node.js 18 or later

The v4 CLI runs the Framework with the `node` on your `PATH`. When `node` or `npm` is missing, every command that runs a v4 release stops with `Nodejs is not installed, please install Nodejs and run the command again`; with a Node.js older than 18, it stops with `Your Nodejs version is too old, please upgrade to Node 18 or newer and rerun Serverless`. A project's local v3 copy (see [Version pins and local v3 installs](#version-pins-and-local-v3-installs)) runs without these checks.

### Version pins and local v3 installs

The v4 CLI reads `frameworkVersion` from the configuration file in the current directory before it runs. A pin below 4 stops the command with an error that starts with `frameworkVersion "3" in serverless.yml is older than any release this CLI can install`. Change the pin:

```diff
 # serverless.yml
-frameworkVersion: '3'
+frameworkVersion: '4'
```

When the project's `package.json` lists `serverless` in `devDependencies` and `node_modules/serverless` holds v3 or earlier, the v4 CLI runs that local copy for every command in that directory, and the local v3 refuses a `'4'` pin. npm scripts such as `npm run deploy` also run the local copy. To use v4, remove it:

```bash
npm uninstall serverless
```

A plugin whose `peerDependencies` allow only `serverless` v3 can install v3 into `node_modules` again; move such plugins to a version that supports v4, and check with `npm ls serverless`.

### Build plugins and the built-in esbuild

v4 builds Node.js functions with its built-in [esbuild](https://github.com/evanw/esbuild) integration on `package` and `deploy`. With no `build` setting, a function is built when its handler is a TypeScript file and a Node.js `runtime` is set on the function or under `provider`; JavaScript handlers are built when `build.esbuild` is set. See [Building](../providers/aws/guide/building.md).

These plugins conflict with the built-in build: `serverless-esbuild`, `serverless-webpack`, `serverless-plugin-typescript` and `serverless-bundle`. With one of them in `plugins`, every command (`package`, `deploy`, `remove`, `info` and the others) stops with an error that starts with `Serverless now includes ESBuild and supports Typescript out-of-the-box. But this conflicts with the plugin`. Either remove the plugin and move its options under `build.esbuild`, or keep the plugin and turn off the built-in build for every function:

```yaml
# serverless.yml
build:
  esbuild: false
```

### Environment files loaded by default

v3 loaded `.env` files only with `useDotenv: true`. v4 loads `.env.<stage>` and `.env` from the service directory on every command, so `${env:...}` can read them. Variables already set in the environment win over the files, and `.env.<stage>` wins over `.env`. To turn this off, set `useDotenv: false`. `useDotenv` can also be a path or a list of paths to load more files, for example in a monorepo; see the [`useDotenv` reference](../providers/aws/guide/serverless.yml.md#dotenv-files).

The deployment package leaves out `.env*` files only while `useDotenv` is `true`, a path or a list of paths; without `useDotenv`, or with `useDotenv: false`, they are packaged. If you remove `useDotenv: true`, keep the files out of the package:

```yaml
# serverless.yml
package:
  patterns:
    - '!.env*'
```

### Deployment method

v4 deploys with `provider.deploymentMethod: direct` by default: it creates or updates the CloudFormation stack without a change set. To keep change-set deploys, set it to `changesets`:

```yaml
# serverless.yml
provider:
  name: aws
  deploymentMethod: changesets
```

See [Deployment method](../providers/aws/guide/deploying.md#deployment-method).

## Plugins

v4 builds in several community plugins. Remove them from `plugins` and `package.json`, and keep their configuration where noted:

| Plugin                                | What v4 does while the plugin is listed                         | Built-in replacement                                                                                                   |
| ------------------------------------- | --------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `serverless-plugin-aws-alerts`        | Ignores the plugin, with a warning                              | [Alerts](../providers/aws/guide/alerts.md); keep `custom.alerts`                                                       |
| `serverless-apigateway-service-proxy` | Ignores the plugin, with a warning                              | [API Gateway service proxies](../providers/aws/guide/api-gateway-aws-proxy.md); keep `custom.apiGatewayServiceProxies` |
| `serverless-python-requirements`      | Uses the plugin instead of the built-in version, with a warning | [Python](../providers/aws/guide/python.md); runs only when `custom.pythonRequirements` is set                          |
| `serverless-appsync-plugin`           | Uses the plugin instead of the built-in version, with a warning | [AppSync](../providers/aws/guide/appsync/README.md); runs when `appSync` is set                                        |
| `serverless-prune-plugin`             | Uses the plugin instead of the built-in version, with a warning | [Prune](../providers/aws/guide/prune.md); keep `custom.prune`                                                          |
| `serverless-domain-manager`           | Runs the plugin                                                 | [Domains](../providers/aws/guide/domains.md): `provider.domain` or `provider.domains` instead of `custom.customDomain` |
| `serverless-iam-roles-per-function`   | Uses the plugin instead of the built-in version, with a warning | [Per-function IAM roles](../providers/aws/guide/iam.md#per-function-iam-roles)                                         |
| `serverless-plugin-git-variables`     | The built-in `${git:...}` source resolves those variables first | [Git variables](./variables/git.md)                                                                                    |

The build plugins `serverless-esbuild`, `serverless-webpack`, `serverless-plugin-typescript` and `serverless-bundle` stop every command unless `build.esbuild: false` is set ([Build plugins and the built-in esbuild](#build-plugins-and-the-built-in-esbuild)).

Serverless, Inc. has tested these community plugins with v4:

- serverless-offline
- serverless-plugin-warmup
- serverless-step-functions
- serverless-plugin-datadog
- serverless-finch
- serverless-plugin-split-stacks
- serverless-plugin-canary-deployments
- serverless-plugin-tracing
- serverless-dynamodb-local
- serverless-kms-grants
- serverless-plugin-lambda-dead-letter
- serverless-plugin-optimize
- serverless-cloudformation-sub-variables
- serverless-plugin-stage-variables
- serverless-api-gateway-caching

To report a plugin that doesn't work with v4, [open an issue](https://github.com/serverless/serverless/issues) or, as a customer, email support@serverless.com.

## Other changes in v4

These changes need no action, but change how a service behaves or how you work with it.

### Dev Mode

In v3, `serverless dev` worked with Serverless Console or the Dashboard. In v4, `serverless dev` needs only the CLI: it routes real invocations of your deployed functions to the code on your machine. See the [Dev Mode guide](../providers/aws/guide/dev-mode.md).

### Auto-updating

The v4 CLI checks for a new release once every 24 hours and updates itself; `serverless update` updates it on demand. Without `frameworkVersion`, it runs the latest release. To control updates, set `frameworkVersion` to a semver range; see [Pinning to a specific version](../getting-started.md#pinning-to-a-specific-version).

### Git variables

The `${git:...}` variable source is built in; see [Git variables](./variables/git.md). It resolves before plugins load, so the [serverless-plugin-git-variables](https://github.com/jacob-meacham/serverless-plugin-git-variables) plugin has no effect: remove it.

### Updated stages syntax

v4 sets parameters per stage under `stages.<stage>.params`. The v3 `params` property still works but is deprecated:

```diff
 # serverless.yml
-params:
-  default:
-    key1: devValue
-  prod:
-    key1: prodValue
+stages:
+  default:
+    params:
+      key1: devValue
+  prod:
+    params:
+      key1: prodValue
```

Move every block in one change: `params` and `stages` can't both be set at the top level of `serverless.yml`. With both, every command stops with an error that starts with `"params" and "stages" cannot be used together in the top-level of serverless.yml.` A v3 service that keeps `params` therefore can't add `stages` for other settings, such as `resolvers`.

### Compose state

Serverless Compose stores service outputs in a shared [State](./state.md) store in Amazon S3 instead of on your machine, so the v3 Compose commands `serverless outputs` and `serverless refresh-outputs` aren't available in v4. `deploy`, `info` and `remove` update the stored outputs. See [Serverless Compose](./compose.md).

## License changes

The Serverless Framework CLI is free for individual developers and for organizations with up to $2 million in annual revenue (as measured by the latest fiscal year). Organizations above that threshold need a paid subscription for v4. Below it, no action is needed and no proof of eligibility is required.

The license change applies to the CLI from version 4 on. Versions 3 and earlier remain open-source software. The optional Serverless Framework Dashboard, with features such as observability, CI/CD and parameters, is priced separately ([Pricing](#pricing)).

The license terms are in the On-Premise Software License section of the Serverless, Inc. [Customer Agreement](https://serverless-aws-marketplace-assets.s3.amazonaws.com/serverless-customer-agreement.pdf).

## Pricing

A subscription is priced in Credits. One Credit covers one Service Instance: the deployment of one `serverless.yml` service to one AWS account, stage and region, which is one AWS CloudFormation stack.

- A Service Instance counts toward usage once Serverless Framework CLI v4 interacts with it, including instances first deployed with v3 or earlier. To stop it from counting, remove it with `serverless remove` using v4.
- Usage is measured at the end of each month. A Service Instance counts towards usage for a month if it is still deployed at the end of that month, or if it was removed during that month after being deployed for 10 days or more. A Service Instance that you remove less than 10 days after deployment, and before the end of the month, is not counted. To avoid charges for a temporary Service Instance used for testing or previews, remove it less than 10 days after deployment and before the end of the month. An instance removed after 10 days or more counts for that month, even if you remove it before the month ends.
- Subscriptions are not priced by Lambda functions, resources, Lambda invocations or CLI commands.

Sample estimated costs for one- to three-year commitments:

- 50 Credits: $117-$142/month
- 300 Credits: $432-$600/month
- 1,500 Credits: $2,160-$3,000/month

To estimate your cost, multiply the Credit price by your number of Service Instances, or use the calculator on the Dashboard's [Billing page](https://app.serverless.com/settings/billing). Current prices are on the [pricing page](https://www.serverless.com/pricing).

The Dashboard's features, such as CI/CD and observability, are priced separately and apply only to services that set `app` in `serverless.yml`.

You can pay by credit card, bank transfer, invoice or through AWS Marketplace, which can count toward an enterprise agreement with AWS. For pricing and sales questions, [book a meeting](https://slss.io/meet).

## Support

Every subscription includes support by email at support@serverless.com, available daily, including for migration questions. Larger subscriptions add a Customer Success team. The Premium Support package adds:

- 24/7/365 availability
- A guaranteed 2-hour initial response time
- A guaranteed 4-hour resolution or workaround

To discuss your upgrade, [schedule a meeting](https://slss.io/meet) or email support@serverless.com.

## Keep a project on v3

To keep one project on v3 while v4 is installed globally, install v3 in the project:

```bash
npm install --save-dev serverless@3
```

With `serverless` v3 in `devDependencies` and installed in `node_modules`, the v4 CLI runs the project's copy for every command in that directory. Version 3 receives no security updates or bug fixes.

## Related

- [Getting started](../getting-started.md): install the CLI and deploy a service.
- [License Keys](./license-keys.md): sign in without the Dashboard.
- [Parameters](./parameters.md): stage parameters and their precedence.
- [MCP server](./mcp/README.md): Framework docs and tools for AI IDEs.
