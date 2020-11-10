<!--
title: Serverless Dashboard - Providers
menuText: Providers
menuOrder: 8
layout: Doc
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/guides/providers/)

<!-- DOCS-SITE-LINK:END -->

# Providers

The Serverless Framework is used to create, manage, monitor and troubleshoot serverless infrastructure such as AWS Lambda, DynamoDB Tables, or API Gateway endpoints. Any infrastructure you provision using Serverless Framework requires credentials to that cloud service provider.

Providers enable you to securely manage the accounts to the cloud service providers like Azure, AWS, and GCP in the Serverless Framework Dashboard.

Your organization admin can add a provider to the organization in the Dashboard, either using static credentials like an AWS Access Key/Secret, or using AWS Access Roles to generate short-lived credentials per deployment. Developers in your organization can use the providers by linking them to their services and they will automatically use the credentials from the providers for deployments.

There are many benefits to using providers over managing accounts manually:

- Decouple credential management from development/deployment
- Automatically use the correct accounts when deploying to different stages
- No need to store credentials locally
- No need to share credentials out of band (e.g. sending slack messages)
- Some providers, like AWS Access Roles, provide an additional layer of security as credentials are generated per deployment and have a short TTL.

# Adding providers in the dashboard

To use providers you must add the providers to your organization and then link the provider to a service. Optionally you can link the provider to an instance instead if you need to use different providers for different stages or regions.

## Adding providers to your organization

To add a provider to your organization go the **org** section of the [dashboard](https://app.serverless.com). Under the **providers** tab, click **add** and follow the instructions.

You’ll be able to select the provider, like AWS, Stripe, and Twilio, name the provider, and set the credentials.

It is recommended that you deploy your Serverless Framework apps to different accounts for each stage. To accomplish this we recommend adding a `dev` and `prod` provider to decouple the prod environment from all other environments.

## Adding a provider to a service

Adding the providers to the organization alone will not be sufficient, you must also link that account with the service.

Go to the **apps** section of the dashboard, and select **settings** under the **...** menu of the service for which you would like to use providers. On the service settings page navigate to the **providers** tab. From there you can click **add provider** which will allow you to add the providers from the organization into your service.

## Adding a provider to an instance

If your service is deployed to the same account for each stage and region, then you do not need to configure providers per instance. However, if you have multiple providers, like one for each stages or regions, then you can add a provider to each instance.

To add a provider to an instance navigate to the instance details page for that service instance. Navigate to the **providers** tab. From the **add providers** dropdown you can add any provider from the organization into the instance.

## Inheritance and overriding

If you are deploying a traditional Serverless Framework app, an instance of the service is created for that stage and region. If you are using a Component-based service, then an instance is created for each stage of the service.

When you are performing a deployment the provider associated with the instance will be used. If no provider is associated with the instance, but one is associated with the service, then that provider will be used. In other words, the providers from the service are inherited at the instance level and they can be overridden on the instance.

### Different accounts per stage

This inheritance model is useful for deploying to different accounts for each stage. For example, if you have a `dev` and `prod` account, then you can setup providers to deploy to `dev` by default, and use the `prod` account for only the `prod` instances.

To accomplish this, you can add the `dev` provider to the service, and then add the `prod` provider to the instances which deploy to the `prod` stage.

If you deploy to a new stage, like `int`, it will then use the `dev` provider from the service.

### Preview account for CI/CD preview deployments

If you are using the Serverless CI/CD service or any 3rd party CI/CD service, you may be deploying to unique stages to isolate the preview deployments from PRs from all other deployments.

To accomplish this, you can create two providers, `preview`, and `prod`, for two different accounts. Add the `preview` provider to the service, and add the `prod` provider to the instances for the `prod` stage.

Now if you deploy to a preview stage, like `feature-x` it will automatically use the provider from the service, `preview`. If you merge your changes and deploy them to the `prod` stage, it will automatically use the `prod` provider as it is associated with that stage.

# Using providers in serverless.yml

To use providers with serverless.yml you do not need to do anything. Upon deployment the Serverless Framework will retrieve the necessary credentials from the provider associate with the instance or service, and it will use those credentials to deploy.

If the providers are not found, then the Serverless Framework will look for credentials locally.

# Migrating from Deployment Profile

Prior to the release of providers, deployment profiles supported setting AWS Access Role ARNs which could be associated with stages in apps. Providers also support AWS Access Role ARNs, as well as AWS secret/access keys, and in the future will also support other cloud service providers like Azure, GCP, Stripe, etc. As such, deployment profiles are no longer needed and will be replaced with providers.

AWS Access Roles in deployment profiles will be automatically migrated to providers and no immediate action is required. _This automatic migration will be performed when you deploy using version 4.1.0 or higher of the Serverless Plugin on the CLI._ You can check your plugin version by running `serverless version`.

This migration will be fully automated and backwards compatible; however, there are a few things that will change as a result of the migration:

- Deployments using deployment profiles will continue to work as-is.
- If the AWS Access Role must be updated, then it must be updated using Providers instead of Deployment Profiles.
- If you want to add/edit new Providers, then you must use version 4.1.0 or higher of the Serverless Plugin on the CLI. You can check the version with `sls version`.

The automatic migration will replace deployment profiles with providers by performing the following:

- **A new provider will be created for each deployment profile using the same AWS Access Role ARN**. If the deployment profile doesn’t contain an AWS Access Role ARN, it will be skipped.
- **A provider will be added to each service for the corresponding default stage in the app**. The provider will be the provider corresponding to the deployment profile which was associated with the default stage of the parent app. For example, if `app1` has `service1` and the _`default`_ stage of `app1` links to the `dev` deployment profile, then the `dev` provider will be added to `service1`. This is repeated for all services in all apps.
- **A provider will be added to each instance for the corresponding stage in the app**. The provider will be the provider corresponding to the deployment profile which was associated with the stage of the instance. For example, if `app1` has `service1` and `app1` has a stage `prod` linked to the `prod` deployment profile, then the `prod` provider will be added to the `service1` instances deployed to the `prod` stage.
