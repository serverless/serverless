<!--
title: Serverless Dashboard - Profiles
menuText: Profiles
menuOrder: 7
layout: Doc
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/dashboard/profiles/)

<!-- DOCS-SITE-LINK:END -->

# Deployment Profiles

Deployment Profiles enable each stage of your Serverless application to use a unique set of [Safeguards](./safeguards.md), [Parameters](./parameters.md) and [Access Roles](./access-roles.md).

## Use Deployment Profiles

Deployment profiles are managed in the [Serverless Framework Dashboard](https://dashboard.serverless.com). When you run `serverless deploy`, the CLI obtains the Safeguard policies, Parameters, and the generated AWS Credentials.

### Creating a new Deployment Profile

Create a new deployment profile by navigating to **profiles** in the [Serverless Framework Dashboard](https://dashboard.serverless.com) and click **add**.

#### name

This is a user-readable name for the deployment profile. Most often it has a name that maps to a stage (e.g. “dev”, “prod”), or in larger organizations the line of business or environment (e.g. “apac-banking-prod”). This name will uniquely identify the deployment profile when associating it with a stage in an application.

#### description

The description helps provide additional context when listing the deployment profiles.

#### access roles, parameters and safeguards

Access Roles, Parameters and Safeguards have individual configuration guides:

- [access roles](./access_role.md#link-your-aws-account)
- [safeguard policies](./safeguards.md#configuring-policies)
- [parameters](./parameters.md)

### Add a deployment profile to your application and stage

Create a new stage by navigating to **applications** in the [Serverless Framework Dashboard](https://dashboard.serverless.com).

1. Expand the application and click into the **stages** tab.
2. Click **add stage** in the tab
3. Provide the **name** and select the **deployment profile**.

You can also set the **default deployment profile** field in the application. You can use this to set the deployment profile on all services in that application. When deploying to a stage which hasn't be defined in the dashboard, then the default deployment profile will be used.

### Using a Deployment Profile to deploy

When you run `serverless deploy` Serverless Framework will obtain the AWS Access Key, Parameter and Safeguards associated with the deployment profile configured for that application and stage based on the values for `app` and `stage` in your `serverless.yml` file.

The Serverless Framework will first try to match the current stage from `serverless.yml` with a stage configured on that application in the dashboard. If they match, it will use the deployment profile associated with that stage. If the stages do not match, then the default deployment profile from that application will be used.
