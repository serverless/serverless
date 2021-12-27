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

## Adding providers in the dashboard

To use providers you must add the providers to your organization and then link the provider to a service. Optionally you can link the provider to an instance instead if you need to use different providers for different stages or regions.

### Adding providers to your organization

To add a provider to your organization go the **org** section of the [dashboard](https://app.serverless.com). Under the **providers** tab, click **add** and follow the instructions.

You’ll be able to select the provider, like AWS, Stripe, and Twilio, name the provider, and set the credentials.

It is recommended that you deploy your Serverless Framework apps to different accounts for each stage. To accomplish this we recommend adding a `dev` and `prod` provider to decouple the prod environment from all other environments.

### Setting a default organization provider

A Provider at the organization level can also be designated as the default provider for the organization. This provider will be used in any deployments where the service or instance do not have a provider set.

To set the organizatwion default, go to the **orgs** section of the dashboard, and select the **providers** tab, under the **...** menu of the provider select **set as default**.

### Adding a provider to a service

Adding the providers to the organization alone will not be sufficient, you must also link that provider with the service.

To add a provider to a service, go to the **apps** section of the dashboard, and select **settings** under the **...** menu of the service for which you would like to use providers. On the service settings page navigate to the **providers** tab. From there you can click **add provider** which will allow you to add the providers from the organization into your service.

### Adding a provider to an instance

If your service is deployed to the same account for each stage and region, then you do not need to configure providers per instance. However, if you have multiple providers, like one for each stages or regions, then you can add a provider to each instance.

To add a provider to an instance, navigate to the instance details page for that service instance, go to the **providers** tab, from the **add providers** dropdown you can add any provider from the organization into the instance.

### Inheritance and overriding

If you are deploying a traditional Serverless Framework app, an instance of the service is created for that stage and region. If you are using a Component-based service, then an instance is created for each stage of the service.

Serverless Framework, on deployment, will use the provider associate with the Instance, Service, or Organization Default Provider, in priority order. In other words, the providers are inherited and can be overridden at each level.

The organization default provider enables you to deploy using that organization default provider without needing to set a provider at the service or instance level. Similarly, setting a provider at the service level enables you to create new instances and deploy right away without needing to set a provider on the instance.

#### Different accounts per stage

This inheritance model is useful for deploying to different accounts for each stage. For example, if you have a `dev` and `prod` account, then you can setup providers to deploy to `dev` by default, and use the `prod` account for only the `prod` instances.

To accomplish this, you can add the `dev` provider to the service, and then add the `prod` provider to the instances which deploy to the `prod` stage.

If you deploy to a new stage, like `int`, it will then use the `dev` provider from the service.

#### Preview account for CI/CD preview deployments

If you are using the Serverless CI/CD service or any 3rd party CI/CD service, you may be deploying to unique stages to isolate the preview deployments from PRs from all other deployments.

To accomplish this, you can create two providers, `preview`, and `prod`, for two different accounts. Add the `preview` provider to the service, and add the `prod` provider to the instances for the `prod` stage.

Now if you deploy to a preview stage, like `feature-x` it will automatically use the provider from the service, `preview`. If you merge your changes and deploy them to the `prod` stage, it will automatically use the `prod` provider as it is associated with that stage.

## Using providers in serverless.yml

To use providers with serverless.yml you do not need to do anything. Upon deployment the Serverless Framework will retrieve the necessary credentials from the provider associate with the instance or service, and it will use those credentials to deploy.

If the providers are not found, then the Serverless Framework will look for credentials locally.

## Using a Custom IAM Role and Policy

Creating a provider with an IAM Role and default policy using the provided Cloud Formation template is the easiest and most secure way to enable Serverless Framework to deploy from CI/CD, monitor your services, and deploy a range of resources to your AWS account using short-lived credentials. However, advanced IAM users may want to create a custom IAM Role and Policy with more restrictive permissions.

Please be aware that this policy is used to _provision_ your Serverless applications to your AWS account(s). The lambda function will also require a role, which is created by the Serverless Framework during deployments, hence why `iam:CreateRole` is required.

Using a custom policy provides additional control and granularity, but it will require your organization to manage and maintain the policy and role to ensure it provides both minimal and sufficient access for Serverless Framework deployments to work correctly.

Below is a sample IAM Policy you can use to get started. This policy works with the Serverless Framework dashboard to enable all the functionality, and deploy a basic Node.js Lambda function.

If you are create a custom IAM Role with this policy, you will need to add a Trust relationship to the AWS Account with ID 377024778620 (arn:aws:iam::377024778620:root) in order for the Serverless Framework to Assume the Role with the provided policy.

**Sample IAM Policy**

```
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Effect": "Allow",
            "Action": [
                "lambda:CreateFunction",
                "logs:DeleteSubscriptionFilter",
                "s3:CreateBucket",
                "iam:CreateRole",
                "lambda:GetFunctionConfiguration",
                "cloudformation:DescribeStackResource",
                "iam:PutRolePolicy",
                "s3:GetObject*",
                "cloudformation:DescribeStackEvents",
                "s3:DeleteBucketWebsite",
                "logs:GetLogEvents",
                "cloudformation:UpdateStack",
                "lambda:ListLayerVersions",
                "lambda:ListLayers",
                "lambda:DeleteFunction",
                "events:RemoveTargets",
                "logs:FilterLogEvents",
                "lambda:GetAlias",
                "s3:DeleteObject",
                "s3:ListBucket",
                "apigateway:GET",
                "cloudformation:ListStackResources",
                "iam:GetRole",
                "events:DescribeRule",
                "lambda:ListFunctions",
                "lambda:InvokeFunction",
                "lambda:GetEventSourceMapping",
                "lambda:ListAliases",
                "iam:DeleteRole",
                "iam:UpdateAssumeRolePolicy",
                "s3:DeleteBucketPolicy",
                "logs:CreateLogGroup",
                "cloudformation:DescribeStacks",
                "lambda:UpdateFunctionCode",
                "s3:PutObject",
                "cloudformation:DeleteStack",
                "lambda:ListEventSourceMappings",
                "lambda:PublishVersion",
                "logs:PutSubscriptionFilter",
                "apigateway:POST",
                "cloudformation:ValidateTemplate",
                "lambda:ListVersionsByFunction",
                "lambda:GetLayerVersion",
                "s3:DeleteObjectVersion",
                "events:PutRule",
                "lambda:GetAccountSettings",
                "lambda:GetLayerVersionPolicy",
                "s3:PutEncryptionConfiguration",
                "apigateway:DELETE",
                "iam:PassRole",
                "lambda:ListTags",
                "iam:DeleteRolePolicy",
                "apigateway:PATCH",
                "s3:DeleteBucket",
                "logs:DescribeLogGroups",
                "logs:DeleteLogGroup",
                "apigateway:PUT",
                "lambda:GetFunction",
                "lambda:UpdateFunctionConfiguration",
                "events:PutTargets",
                "lambda:AddPermission",
                "cloudformation:CreateStack",
                "s3:PutBucketPolicy",
                "sts:GetCallerIdentity",
                "lambda:RemovePermission",
                "s3:GetBucketLocation",
                "lambda:GetPolicy"
            ],
            "Resource": "*"
        }
    ]
}
```

## Migration from Deployment Profile

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
