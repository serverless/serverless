<!--
title: Serverless Framework - Upgrading to v4
description: Serverless Framework V.4 offers a seamless update from V.3 and older versions. This guide covers all aspects of updating, including potential breaking changes, significant improvements, tips for large organizations and more.
short_title: Upgrading to v4
keywords:
  [
    'Serverless Framework',
    'Version 4',
    'upgrade',
    'AWS',
    'licensing',
    'authentication',
    'TypeScript support',
    'auto-updating',
  ]
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/guides/upgrading-v4/)

<!-- DOCS-SITE-LINK:END -->

# Upgrading to Serverless Framework V4

This guide covers upgrading to Serverless Framework version 4 from version 3 or earlier, and includes info on breaking changes, key license and pricing updates, and practical advice tailored for both small and large organizations.

We are uniquely accessible to chat, even for same-day meetings. Feel free to [schedule a meeting with us](https://slss.io/meet) to discuss upgrading, pricing, and more.

Here is a quick overview video answering common questions around V.4

::youtube{id="p7dnwVslChs"}

Also, the [Serverless MCP](https://www.serverless.com/framework/docs/guides/mcp) is a great tool for upgrading Serverless Framework and using the latest features. It comes packaged with the latest Serverless Framework documentation, so it will always give you the most up to date advice directly in AI-enhanced IDEs like Cursor, Windsurf and VS Code.

## Overview

Serverless Framework CLI version 4 was released in May 2024. It's stable and now widely used, and introduces no breaking changes—except for a new license and authentication requirement. 

V.4 works out of the box for older projects built using Amazon Web Services with no migration steps required. Organizations making over $2 million/year may need to purchase a subscription based on the new terms (detailed below), but most developers will not.

V.4 features significant improvements, integrating plug-ins into the core for better reliability, improving developer workflows, enhancing integrations with tools like Terraform and observability solutions, and larger innovations like the [Serverless Container Framework](https://www.serverless.com/containers/docs) and [Serverless MCP](https://www.serverless.com/framework/docs/guides/mcp). Serverless Framework CLI version 4's development velocity has surged, with weekly updates replacing the quarterly releases of the prior open-source model.

Overall, V.4 delivers a stable, customer-centric experience, with powerful updates, built-in support, and a focus on your features and fixes for lasting dependability.

## Upgrade Steps

Here are quick steps to upgrade to Serverless Framework V.4:

1. **Check Compatibility**: Confirm your project uses AWS, as non-AWS providers are deprecated.
2. **Update CLI**: Run `npm install -g serverless` to install v4 globally.
3. **Authenticate**: Sign in via the Serverless Framework Dashboard or use a License Key (see "Authentication Requirement" below for more details).
4. **Review Plugins**: Check for compatibility with v4 (see "Plugins").
5. **Deploy Test Stage**: Deploy your existing Service into a new, test Stage `sls deploy --stage testv4
6. **Update CI/CD**: Add Access Keys or License Keys to pipelines.
7. **Contact Support**: Reach out if you hit any issues support[at]serverless.com

## License Changes

As announced in late 2023, the Serverless Framework CLI remains free for individual developers and small businesses. However, developers and organizations with annual revenue exceeding $2M USD (as measured by their latest fiscal year) are now required to obtain a paid subscription.

If you're a developer or organization that does not exceed the revenue threshold, no additional action is required. You may continue to freely use the Serverless Framework CLI as much as you'd like without providing proof of eligibility.

This license change applies only to Serverless Framework CLI version 4 and later. Versions 3 and earlier remain open-source and will continue to be available as open-source software.

**Please note: As of early 2025, version 3 is no longer maintained and will no longer receive security updates, bug fixes, or feature improvements.**

These license changes apply exclusively to the CLI. The optional Serverless Framework Dashboard—offering features such as observability, CI/CD, and secrets management—has separate pricing and is unaffected by this licensing change.

The updated license terms can be reviewed in the On-Premise Software License section of Serverless Inc.'s [Customer Agreement](https://serverless-aws-marketplace-assets.s3.amazonaws.com/serverless-customer-agreement.pdf).

## Pricing

For organizations that meet or exceed the revenue threshold, a subscription is required, priced based on Credits. One Credit is equivalent to one Serverless Framework Service Instance. A Service corresponds to a `serverless.yml` file, while a Service Instance refers to the deployment of that file to a specific AWS account, Stage, and Region. Another way to think about a Service Instance is that it equates to an AWS CloudFormation Stack deployed via Serverless Framework.

To estimate pricing, multiply the Credit price by the number of estimated Service Instances you might have. Our Serverless Framework Dashboard also features a pricing calculator within the [Billing page]([https://app.serverless.com/](https://app.serverless.com/settings/billing)).

If a Service Instance is interacted with using Serverless Framework CLI version 4 at any point (including instances initially deployed using versions 3 or earlier), it will be counted towards usage. To stop a Service Instance from counting towards your usage, run the `serverless remove` CLI command using version 4.

Additionally, a Service Instance will only be counted if it exists for more than 10 days in a given month. This rule prevents charges for temporary Service Instances used for testing or previews.

For greater clarity, subscriptions are **not** priced based on:
- Individual AWS Lambda functions within a Service.
- Individual resources within a Service.
- The number of AWS Lambda invocations.
- The number of commands executed using the Serverless Framework CLI.

The Credit price is a fixed fee per deployed Service Instance. Here are some sample estimated costs, depending on your plan:

- 50 Credits: $117-$142/month
- 300 Credits: $432-$600/month
- 1,500 Credits: $2,160-3,000/month

The optional Serverless Framework Dashboard offers separate pricing for additional features like CI/CD and observability. These charges apply only if the Dashboard is explicitly enabled in your `serverless.yml` using the `app` property. Otherwise, these features and associated costs do not apply. Many users rely exclusively on the CLI.

We offer check out via credit card, bank transfer, traditional invoice, as well as AWS Marketplace. Many orgs favor using AWS Marketplace as it can ease the procurement process and count towards enteprise agreements orgs have with AWS.

If you have pricing, sales or general questions, please [book a meeting with us](https://slss.io/meet) or check out [our pricing page](https://serverless.com/pricing).

## Support

All subscriptions include comprehensive support via email at **support[at]serverless.com**. Our team is available daily to help with migration questions and ensure a smooth transition. Unlike the open-source model where users are typically left to manage issues independently, our subscribers receive prioritized, personalized assistance.

Customers with larger subscriptions benefit further from a dedicated Customer Success team that provides proactive guidance and tailored support.

We also offer a **Premium Support** package, which includes:

- **24/7/365 availability**
- Guaranteed **2-hour initial response time**
- Guaranteed **4-hour resolution or workaround**

For further details or inquiries, please [schedule a meeting with our team](https://slss.io/meet) or contact us directly at **support[at]serverless.com**.

## Breaking Changes

Serverless Framework CLI version 4 is designed to minimize breaking changes and supports older AWS-based projects out of the box, requiring no migration steps. Here is a full list of potential breaking changes and notable differences that may affect your workflow.

### License Updates

While not a technical breaking change affecting services or architecture, Serverless Framework version 4 introduces a new license. Refer to the "License Changes" section of this guide for full details.

### Authentication Requirement

Version 4 of the Serverless Framework CLI now requires authentication. This is a breaking change as the authentication prompt in the CLI will disrupt usage of CLI commands on local machines and in CI/CD pipelines. 

We offer two ways to sign in using either the Serverless Framework Dashboard or License Keys.

#### Serverless Framework Dashboard

Authenticate via the CLI using your Serverless Framework Dashboard credentials (email/password, Google, or GitHub). This generates an Access Key on your machine, eliminating the need for repeated logins. 

In the Serverless Framework Dashboard, you can generate further Access Keys to use in your CI/CD pipelines [in the Settings > Access Keys tab](https://app.serverless.com/settings/accessKeys), to avoid the authentication prompt in the CLI.

- **Best for**: Developers and teams leveraging the Serverless Framework Dashboard.
- **Not recommended for**: CLI-only users (see License Keys below).
- **Note**: Signing in this way does not require you to use Dashboard features.

#### License Keys

License Keys provide an alternative sign-in method, ideal for teams and organizations that:

- Use only the Serverless Framework CLI.
- Hold an active subscription.
- Prefer an "on-premise" CLI experience without the Dashboard.
- Want to minimize telemetry, sending only essential usage data tied to their subscription.

You can generate one or multiple License Keys for your subscription. These can be set as environment variables in your terminal or CI/CD pipelines. Alternatively, a new feature allows you to store License Keys as AWS SSM Parameters on your AWS accounts. This eliminates the need to distribute keys to team members or update CI/CD configurations, simplifying onboarding, offboarding, and management. For most large organizations, this AWS SSM approach is the preferred method.

- **Organization Tips**: Use a single License Key for simplicity, or assign keys per team or AWS account, depending on your structure.
- **Usage Insights**: License Key-based usage reports are available, helping you track adoption across your organization if needed.

For more details, see the [License Keys guide](https://www.serverless.com/framework/docs/guides/license-keys).

### Deprecation of Non-AWS Providers

Version 4 discontinues support for cloud providers beyond AWS, marking a breaking change for users of non-AWS providers.

Historically, we’ve supported multiple providers, but creating a consistent abstraction across their diverse serverless offerings proved difficult. As a result, AWS has become the primary choice for most of our users. Looking ahead, we’re investigating improved multi-cloud support through initiatives like the [Serverless Container Framework](https://www.serverless.com/containers/docs).

## Additional Notes

### Plugins

The Serverless Framework CLI features a thriving ecosystem with over a thousand community-maintained plugins. To ensure compatibility and optimal performance with Serverless Framework V4, we've proactively reviewed these plugins and contributed dozens of improvements.

If you encounter any compatibility issues with plugins in V4, please let us know—we’re committed to reaching out to plugin authors, providing fixes, and assisting with improvements.

To report plugin issues, you can [open an issue](https://github.com/serverless/serverless/issues) in our main repository, or, if you're a customer, contact us directly at **support[at]serverless.com**.

Here are _some_ of the many plugins which we've tested for V.4:

- serverless-offline
- serverless-domain-manager
- serverless-plugin-warmup
- serverless-python-requirements
- serverless-step-functions
- serverless-iam-roles-per-function
- serverless-plugin-datadog
- serverless-finch
- serverless-plugin-split-stacks
- serverless-plugin-canary-deployments
- serverless-prune-plugin
- serverless-plugin-aws-alerts
- serverless-plugin-tracing
- serverless-dynamodb-local
- serverless-kms-grants
- serverless-plugin-lambda-dead-letter
- serverless-plugin-optimize
- serverless-cloudformation-sub-variables
- serverless-plugin-stage-variables
- serverless-api-gateway-caching

### Environment Variables Loaded By Default

In previous versions of Serverless Framework (<= V.3), the `useDotEnv` configuration in `serverless.yml` would have to be set in order to load `.env` and `.env.[stage]` files, and make their environment variables accessible within `serverless.yml`.

In V.4, these files are read automatically, without the `useDotEnv` property.

### Revised Dev Mode

In previous versions of Serverless Framework (<= V.3), the `dev` command would work exclusively with Serverless Console or Serverless Framework Dashboard. However, `dev` has been completely re-imagined to only work with the CLI, not requiring Dashboard, and proxy events from your live AWS Lambda functions to your local code, enabling you to develop faster than ever.

Learn more about the new [dev mode](https://www.serverless.com/framework/docs/providers/aws/cli-reference/dev).

### Native Typescript Support

In V.4, [esbuild](https://github.com/evanw/esbuild) is included within Serverless Framework, allowing you to use Typescript files directly in your AWS Lambda function handlers and have your code build automatically upon deploy, without a plugin and without configuration.

Please note, plugins that build your code will not work unless you opt out of the default build experience. Some of the plugins affected are:

- `serverless-esbuild`
- `serverless-webpack`
- `serverless-plugin-typescript`

To learn more about this, check out the [building guide](https://www.serverless.com/framework/docs/providers/aws/guide/building).

### Auto-Updating

Auto-updating has been introduced in Serverless Framework V.4. This is checked once every day, and can be manually updated via `serverless update`.

Please note that if you do not have `frameworkVersion` specified in your `serverless.yml`, auto-updating will be enabled. We recommend using `frameworkVersion` with traditional semantic versioning syntax to control how version updating should work in a way that's ideal for you.

### Git Resolvers Plugin

Git-related Serverless Framework Variables have been introduced into the Variable system.

As a result, the [Serverless Git Variables Plugin](https://github.com/jacob-meacham/serverless-plugin-git-variables) no longer works.

### Updated stages syntax

In V.4 there is a new global stages syntax that allows you to define parameters for each stage. This is not a breaking change for the previous `stages` syntax; however, the new syntax is recommended.

The old V.3 syntax:

```yaml
params:
  default:
    key1: devValue
  prod:
    key1: prodValue
```

The new V.4 syntax:

```yaml
stages:
  default:
    params:
      key1: devValue
  prod:
    params:
      key1: prodValue
```

The functionality is similar, but parameters should be defined under `stages.<stage>.params` instead of just `params.<stage>`.

## Need help upgrading?

You're no longer on your own—Serverless Framework V4 prioritizes your experience and support. Whether you have specific migration questions, licensing inquiries, or general feedback, our team is ready and eager to assist.

Feel free to [book a meeting](https://slss.io/meet) with us today, or reach out directly at support[at]serverless.com. We're here to ensure your upgrade to Version 4 is smooth, efficient, and successful.

