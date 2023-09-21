<!--
title: Serverless Framework Dashboard - Setup & Overview
menuText: Setup & Overview
menuOrder: 1
description: An overview and set-up guide for Serverless Framework Dashboard
layout: Doc
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/guides/dashboard/)

<!-- DOCS-SITE-LINK:END -->

# Serverless Framework Dashboard

The [Serverless Framework Dashboard](https://app.serverless.com/) is a SaaS solution that augments the Serverless Framework CLI to provide a powerful, unified experience to develop, deploy, test, secure and monitor your serverless applications, across all AWS accounts.

The aim of the Serverless Framework and its Dashboard is to offer a seamless, integrated development experience for you and your team throughout the entire lifecycle of your serverless applications. We hope it's a breath of fresh air compared to the complexity of interacting with the AWS Console across several accounts, directly.

## Features

- **Deployments:** Easily see all Serverless Framework deployments made by you and your team, via CI/CD or local installations of the CLI, across all of your AWS accounts, in one place. Quickly check who made the deployment, what the status is, how it may have failed, see git metadata, serverless.yml, outputs, and much more.

- **Secrets:** Set and share secrets in one place, for use within your Serverless Framework `serverless.yml` files. This works across all AWS accounts, so it's ideal for making secrets easy to use without wrestling with AWS permissions to access them. Secrets are encrypted and secure by default.

- **Observability:** The richest and slickest observability solution for AWS Lambda on the market. We've spent years crafting an observability solution that developers love, specializing in AWS Lambda. Set-up requires zero effort and you will instantly get rich Metrics, Traces, Logs and Alerts, just deploy with the Serverless Framework. The Observability features also support non-Serverless Framework deployed AWS Lambda functions. Simply connect your AWS accounts and you'll be able to instrument all of the AWS Lambda functions in them.

- **Providers:** Providers make it easy to manage deployment access to your AWS accounts. Each Provider connects to 1 AWS account, and you can assign it to specific Services, Stages, or set a Provider as a default across an entire AWS account. This enables your team to never have to deal with local AWS credentials. Providers use an AWS IAM Role to connect to your account and provide short-term credentials for every deployment, which is more secure by default.

- **CI/CD:** CI/CD optimized for Serverless Framework that works out-of-the-box. Simply connect it to Github or BitBucket to enable automated deployments. Set up preview deployments for branches, and much more.

## Minimum Version Requirements

To use Serverless Framework Dashboard, you must be using Serverless Framework CLI version 1.48.0 or later.

For Serverless Framework's new Observability offering, you must use version 3.35.0 or later.

## Set-Up

If you don't already have a Serverless Framework account, create a new account at [https://app.serverless.com](https://app.serverless.com).

If you don't have existing Serverless Framework Services, follow the [Getting Started with the Serverless Framework and AWS](/framework/docs/getting-started/) guide. This will help you get a Serverless Framework Service deployed to AWS, and enabled with the Dashboard.

If you have existing Serverless Framework Services, in the directory with your Service's `serverless.yml` file, run the `serverless` command. This will walk you through the setup process, including setting up your AWS account credentials and creating an organization and application from the Dashboard. Once completed, you'll notice that the `org` and `app` fields will be added to your `serverless.yml` to indicate the org/app to which this service belongs.

You can also add the configuration manually to your `serverless.yml` files within your Serverless Framework Services to connect to the Dashboard.

```YAML

org: # Your Serverless Framework Org name (e.g. acme-inc)
app: # A parent namespce for this Service and related Services App name (e.g. mobile-app), to improve Serverless Framework Dashboard organization

```

You must deploy your Service to have it show in the Dashboard with the following configuration in your YAML file. Run `serverless deploy` to do this.

By default, Deployment history and Observability will be set up automatically. To enable Observability, Serverless Framework will automatically create an AWS IAM Role within the AWS account you deployed to, giving Serverless Inc permission to AWS Cloudwatch and more. [You can transparently see the permissions this role requires in Github](https://github.com/serverless/console/blob/main/instrumentation/aws/iam-role-cfn-template.yaml).
