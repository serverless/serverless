<!--
title: Serverless Dashboard - Profiles
menuText: Profiles
menuOrder: 7
layout: Doc
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/guides/profiles/)

<!-- DOCS-SITE-LINK:END -->

> This is a deprecated feature of the dashboard. Please look at our documentation for [Providers](https://www.serverless.com/framework/docs/guides/providers/) and
> [Parameters](https://www.serverless.com/framework/docs/guides/parameters/) which replaces the use of deployment profiles for setting up AWS connections and parameters.

# Deployment Profiles

Deployment Profiles enable each stage of your Serverless application to use a unique set of [Safeguards](./safeguards.md), [Parameters](./parameters.md) and [Access Roles](./access-roles.md).

## Deprecation and Migration from Deployment Profile

Prior to the January 11th, 2021 release, deployment profiles supported setting AWS Access Role ARNs and managing parameters. Support for using AWS Access Roles for deployments has moved from deployment profiles to Providers. Support for managing Parameters has moved from deployment profiles to services and instances.

**Deployment profiles will be deprecated on February 28th, 2021**. Migration from deployment profiles to providers and parameters will be automatic; however, there are two required action items to use the new features.

### Action Items

- You **MUST** upgrade to use the Enterprise Plugin version 4.4.1 or higher.
- You **MUST** relink your AWS Account via the providers UI by no later than February 28th, 2021.

### Automatic Migration

Parameters and Providers were migrated automatically from deployment profiles on January 31st, 2021.

The automatic migration replaced deployment profiles with providers by performing the following:

- **A new provider will be created for each deployment profile using the same AWS Access Role ARN**. If the deployment profile doesn’t contain an AWS Access Role ARN, it will be skipped.
- **A provider will be added to each service for the corresponding default stage in the app**. The provider will be the provider corresponding to the deployment profile which was associated with the default stage of the parent app. For example, if `app1` has `service1` and the _`default`_ stage of `app1` links to the `dev` deployment profile, then the `dev` provider will be added to `service1`. This is repeated for all services in all apps.
- **A provider will be added to each instance for the corresponding stage in the app**. The provider will be the provider corresponding to the deployment profile which was associated with the stage of the instance. For example, if `app1` has `service1` and `app1` has a stage `prod` linked to the `prod` deployment profile, then the `prod` provider will be added to the `service1` instances deployed to the `prod` stage.
- **Parameters from the deployment profile associated with the default stage in the app will be copied to the service**.
- **Parameters from the deployment profile associated with a stage in an app will be copied to the instance**.

## Use Deployment Profiles

Deployment profiles are managed in the [Serverless Framework Dashboard](https://app.serverless.com). When you run `serverless deploy`, the CLI obtains the Safeguard policies, Parameters, and the generated AWS Credentials.

### Creating a new Deployment Profile

Create a new deployment profile by navigating to **profiles** in the [Serverless Framework Dashboard](https://app.serverless.com) and click **add**.

#### name

This is a user-readable name for the deployment profile. Most often it has a name that maps to a stage (e.g. “dev”, “prod”), or in larger organizations the line of business or environment (e.g. “apac-banking-prod”). This name will uniquely identify the deployment profile when associating it with a stage in an application.

#### description

The description helps provide additional context when listing the deployment profiles.

#### access roles, parameters and safeguards

Access Roles, Parameters and Safeguards have individual configuration guides:

- [access roles](./access-roles.md#link-your-aws-account)
- [safeguard policies](./safeguards.md#configuring-policies)
- [parameters](./parameters.md)

### Add a deployment profile to your application and stage

Create a new stage by navigating to **applications** in the [Serverless Framework Dashboard](https://app.serverless.com).

1. Expand the application and click into the **stages** tab.
2. Click **add stage** in the tab
3. Provide the **name** and select the **deployment profile**.

You can also set the **default deployment profile** field in the application. You can use this to set the deployment profile on all services in that application. When deploying to a stage which hasn't be defined in the dashboard, then the default deployment profile will be used.

### Using a Deployment Profile to deploy

When you run `serverless deploy` Serverless Framework will obtain the AWS Access Key, Parameter and Safeguards associated with the deployment profile configured for that application and stage based on the values for `app` and `stage` in your `serverless.yml` file.

The Serverless Framework will first try to match the current stage from `serverless.yml` with a stage configured on that application in the dashboard. If they match, it will use the deployment profile associated with that stage. If the stages do not match, then the default deployment profile from that application will be used.
