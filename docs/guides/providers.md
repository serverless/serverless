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

To add a provider to your organization go the **org** section of the [dashboard](https://app.serverless.com). Under the **providers** tab, click **add**`\*\* and follow the instructions.

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

Providers support a variety of servier providers, like Azure, GCP, AWS, and they support different credential types too, like AWS Access Roles and AWS Access Key/Secret. Prior to the release of Providers the Serverless Framework Dashboard supported the use of AWS Access Roles in Deployment Profiles. However, deployment profiles only supported a single cloud service provider, AWS, and only one credential type, AWS Access Role. As such, the AWS Access Role will be deprecated from deployment profiles in favor of using providers.

## Create a provider for each deployment profile

Deployment profiles and providers are both managed at the organization level. As such, you need to create one provider for each deployment profile which uses the AWS Access Roles. For consistency we recommend using the same name for the providers as you used for the deployment profile.

For example, if you had the deployment profiles, `dev`, `int`, and `prod`, all with unique AWS Access Roles, then you will create the providers, `dev`, `int`, and `prod`, and connect a new AWS Access Role to each.

If you would like to continue to use the AWS Access Roles, then you will need to generate a new AWS Access Role. The AWS Access Role grants permission to Serverless Framework to generate new credentials; however, Serverless Framework uses a different AWS account for providers than it does for deployment profiles. Therefore the Access Roles from deployment profiles will not work for providers.

## Migrating the default deployment profile

Each application in the dashboard had a default deployment profile associated with it. If there was an AWS Access Role on that deployment profile, then it was used for all deployments in that application unless specific stages were configured.

While deployment profiles could be associated with the application level, providers are associated at the service level.

For each service in an application configure the corresponding provider with the default deployment profile in the application.

For example, suppose you have an app, `store`, with three services, `database`, `api`, and `site`. The app `store`, has the `dev` deployment profile set as the default deployment profile. In the previous step we created a `dev` provider to replace the `dev` deployment profile. So for each of the services, `database`, `api`, and `site` you will add the `dev` provider to each of those services.

## Migrating deployment profiles from stages

Each application in the dashboard has the ability to configure stages, like `dev`, `staging`, and `prod`. Each of these stages can also be associated with a deployment profile, and therefore an AWS Access Role.

WIth providers you no longer configure the providers per stage, but instead, you can add them to the instances.

For each stage in your application add the corresponding provider to each of the instances in that stage.

For example, suppose you have an app, `store`, and it has the default deployment profile `dev`, and it has the stage `int` and `prod` with corresponding deployment profiles `int` and `prod`. Each of those stages may have one or more instances deployed. Suppose we deployed to two different regions, `us-east-1` and `us-east-2` for each stage, therefore we will have four instances, `int` / `us-east-1`, `int` / `us-east-2`, `prod` / `us-east-1`, and `prod` / `us-east-2`. In the previous step we created corresponding `dev`, `int` and `prod` providers for each of the deployment profiles. In this case we will associate the `int` provider with the `int` / `us-east-1` instance, and the `int` / `us-east-2` instance, and we’ll also associate the `prod` provider with the `prod` / `us-east-1` and the `prod` / `us-east-2` instances.
