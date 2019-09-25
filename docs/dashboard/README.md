<!--
title: Serverless - Dashboard Reference
menuText: Dashboard Reference
layout: Doc
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/dashboard/)

<!-- DOCS-SITE-LINK:END -->

# Serverless Dashboard

The [Serverless Framework Dashboard](https://dashboard.serverless.com/) is a SaaS solution that augments the Serverless Framework open source CLI to provide a powerful, unified experience to develop, deploy, test, secure and monitor your serverless applications.

The Serverless Framework free tier gives developers full access to all features included in the Serverless Framework Dashboard, but is limited to 1,000,000 function invocations per month. If you are interested in expanding your usage of the Serverless Framework beyond the free tier [contact us](https://serverless.com/enterprise/contact/) for details re available plans and pricing.

## Minimum Version Requirements

To take full advantage of the Serverless Framework Dashboard you must be using Serverless Framework open-source CLI version 1.48.0 or later.

## Supported Runtimes and Regions

Currently, the Serverless Framework Dashboard supports the following providers, runtimes and regions.

- Provider: AWS
- Runtimes: Node.js
- Regions: us-east-1, us-east-2, us-west-2, eu-central-1, eu-west-1, eu-west-2, ap-northeast-1, ap-south-1, ap-southeast-1, ap-southeast-2

Need unsupported providers, runtimes or regions? [Let us know](https://serverless.com/enterprise/) what you need. We are working hard to quickly expand our supported runtimes and regions.

# Installing

To get started with the Serverless Framework Dashboard, follow the [Getting Started with the Serverless Framework and AWS](/framework/docs/getting-started/) guide. When you run the `serverless` command, you will be asked if you would like to enable dashboard features.

# Enabling the Dashboard on existing Serverless Framework services

If you have an existing Serverless Framework service, it is incredibly easy to enable the Serverless Framework Dashboard features. Just follow the [Getting Started with the Serverless Framework and AWS](/framework/docs/getting-started/) guide to install update the Serverless Framework to the latest release.

1. Create a new account at [https://dashboard.serverless.com](https://dashboard.serverless.com) if you don't already have one.
2. Run `sls login` to login to your account.
3. Go to your existing working directory containing the `serverless.yml`
4. Run `serverless` to walk you through the integration process. Once it is complete, your `serverless.yml` will be updated with `org` and `app` from the dashboard.
5. Run `serverless deploy` to deploy your service
6. Run `serverless dashboard` to view the dashboard for your service
