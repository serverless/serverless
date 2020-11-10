<!--
title: Serverless - Dashboard
menuText: Dashboard
menuOrder: 1
layout: Doc
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/guides/dashboard/)

<!-- DOCS-SITE-LINK:END -->

# Serverless Dashboard

The [Serverless Framework Dashboard](https://app.serverless.com/) is a SaaS solution that augments the Serverless Framework open source CLI to provide a powerful, unified experience to develop, deploy, test, secure and monitor your serverless applications.

The Serverless Framework free tier gives developers full access to all features included in the Serverless Framework Dashboard, but is limited to 1,000,000 function invocations per month. If you are interested in expanding your usage of the Serverless Framework beyond the free tier [contact us](https://serverless.com/enterprise/contact/) for details re available plans and pricing.

## Minimum Version Requirements

To take full advantage of the Serverless Framework Dashboard you must be using Serverless Framework open-source CLI version 1.48.0 or later.

## Supported Runtimes and Regions

Currently, the Serverless Framework Dashboard supports the following providers, runtimes and regions.

- Provider: AWS
- Runtimes: Node.js, Python
- Regions: us-east-1, us-east-2, us-west-1, us-west-2, eu-central-1, eu-west-1, eu-west-2, eu-west-3, ap-northeast-1, ap-south-1, ap-southeast-1, ap-southeast-2, sa-east-1, ca-central-1

Need unsupported providers, runtimes or regions? [Let us know](https://serverless.com/enterprise/) what you need. We are working hard to quickly expand our supported runtimes and regions.

# Installing

To get started with the Serverless Framework Dashboard, follow the [Getting Started with the Serverless Framework and AWS](/framework/docs/getting-started/) guide. When you run the `serverless` command, you will be asked if you would like to enable dashboard features.

# Enabling the Dashboard on existing Serverless Framework services

If you have an existing Serverless Framework service, it is incredibly easy to enable the Serverless Framework Dashboard features. Just follow the [Getting Started with the Serverless Framework and AWS](/framework/docs/getting-started/) guide to install update the Serverless Framework to the latest release.

If you don't already have a Serverless account, create a new account at [https://app.serverless.com](https://app.serverless.com).

After you create your account, run `serverless login` on the CLI to authenticate your CLI with the dashboard.

In your working directory with your `serverless.yml` file, run `serverless`. This will walk you through the setup process, including setting up your AWS account credentials and selecting your organization and application from the dashboard. Once completed, you'll notice that the `org` and `app` fields will be added to your `serverless.yml` to indicate the org/app to which this service belongs.

You can also integrate the dashboard manually simply by adding `org` and `app` to your `serverless.yml` in your favorite IDE using the org and app name from the dashboard.

```yaml
org: <org>
app: <app>
```

Once the `org` and `app` fields are set, just run `serverless deploy` to redeploy your service with the instrumentation needed for the Dashboard.

## Moving Between Dashboard Apps

You can associate each service with its own app or group them into specific apps. If you already added your service to an app and want to add it to a different app, you need to create that app in the Dashboard before changing the `app` in `serverless.yml` if it doesn't already exist. Then, simply change the app name in `serverless.yml`.
