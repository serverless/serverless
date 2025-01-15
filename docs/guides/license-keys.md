<!--
title: Serverless Framework - License Keys
description: 'Learn how to manage License Keys in Serverless Framework, including usage, secure storage, and how to integrate them into your services for authentication and compliance'
short_title: License Keys
keywords:
  [
    'Serverless Framework',
    'License Keys',
    'license management',
  ]
-->

<!-- DOCS-SITE-LINK:START automatically generated -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/guides/license-keys/)

<!-- DOCS-SITE-LINK:END -->

# Serverless Framework License Keys

Starting with Version 4, authentication is required for all users of the Serverless Framework CLI, and License Keys are one method of providing this authentication.

## What Are License Keys And When You Need Them

License Keys are merely unique identifiers used to authenticate your access to Serverless Framework V4 and ensure compliance with its licensing model.

They're ideal for organizations that prefer not to use the Serverless Framework Dashboard or its authentication methods. If you want to use only the CLI and avoid remote requests to the Dashboard, License Keys are the solution.

Free Users and Serverless Framework Dashboard users can optionally use License Keys, or can authenticate through the Dashboard. The CLI provides guidance for Dashboard authentication.

## Key Characteristics

- **Simple Identifiers**: License Keys in the Serverless Framework merely serve to validate and track subscription usage. They do not offer access control or permissions within the CLI or Dashboard.
- **Disables Dashboard Access**: License Keys will disable access to the Serverless Framework Dashboard. This eliminates all remote requests to the Dashboard, except for validating the License Key and sending License Key telemetry.
- **No Expiration**: License Keys do not have an expiration date. This provides consistent access to the Framework without the need to regularly update keys. However, you should still periodically rotate keys as a best practice.
- **Create One or Several**: Create and distribute as many License Keys as needed across your organization - whether by company, team, app, or developer.

## How to Manage License Keys

There are two ways to manage License Keys:

You can create, list and delete them within the Serverless Framework Dashboard within the [Settings > License Keys view](https://app.serverless.com/settings/licenseKeys).

Or, you can have Serverless Inc. create, update and delete them for you by mailing into [support](mailto:support@serverless.com).

## How to Use License Keys

You can use License Keys in two ways:

1. **Environment Variable**: Set the `SERVERLESS_LICENSE_KEY` environment variable in your environment or CI/CD pipeline.

```bash
export SERVERLESS_LICENSE_KEY=<your-license-key>
```

This approach is straightforward but requires distributing and maintaining License Keys in multiple locations. It may lead to creating numerous keys to ensure proper separation of concerns, potentially requiring each developer to have their own. This approach is generally hard to scale beyond small teams.

2. **Configuration File (Recommended)**: As of Serverless Framework version 4.4.5, you can use the `licenseKey` field in your serverless.yml configuration file. This supports [Variable Resolvers](./variables), allowing you to reference keys from secrets management platforms like [AWS SSM Params & AWS Secrets Manager](./variables/aws/ssm) or [Hashicorp's Vault](./variables/hashicorp/vault).

```yaml
service: my-service

# AWS SSM Params & AWS Secrets Manager Example
licenseKey: ${ssm:/path/to/serverless-framework-license-key}
# Vault Example
licenseKey: ${vault:secret/serverless-framework/license-key}

provider:
  name: aws
  runtime: nodejs20.x

functions:
  hello:
    handler: handler.hello
```

This allows you to manage the License Keys securely, without distributing them to teammates or persisting them in lots of locations, and enables easy key rotation if needed.

The most common pattern is to add License Keys to each AWS account the Serverless Framework deploys to, within AWS SSM Params or AWS Secrets Manager. If Serverless Framework has access to deploy to an AWS account, it should have access to read params and secrets from AWS SSM Params and AWS Secrets Manager. No additional changes to the `serverless.yml` are necessary aside from adding `licenseKey`.

Serverless Framework Variable Resolvers can reference a separate AWS account from the deployment target, allowing you to store and read the License Key in one AWS account. This requires additional configuration in your serverless.yml files. For more details, refer to our documentation on [Variable Resolvers](https://www.serverless.com/framework/docs/guides/variables/aws). Using Serverless Framework Compose, you can create a parent Compose file that specifies the AWS account information you want to reference, eliminating the need to replicate this configuration across multiple serverless.yml files.

For more details, refer to

- [Serverless Variables documentation](./variables)
- [AWS SSM Resolver documentation](./variables/aws/ssm)
- [HashiCorp Vault Resolver documentation](./variables/hashicorp/vault)

3. **AWS Systems Manager Parameter Store**: As of Serverless Framework version 4.4.19 you can store your License Key in AWS SSM Parameter Store without referencing the License Key in your configuration file or setting it as an environment variable.

When no `licenseKey` is specified in the configuration file and the `SERVERLESS_LICENSE_KEY` environment variable is absent,
the Framework will automatically check for a License Key stored in the `/serverless-framework/license-key` parameter in
AWS SSM Parameter Store. The Framework reads this parameter using the deployment credentials, applying the same AWS region and profile as the deployment.

To set up the License Key in AWS SSM Parameter Store, you can use the AWS CLI:

```bash
aws ssm put-parameter \
  --name "/serverless-framework/license-key" \
  --description "Serverless Framework License Key" \
  --type "SecureString" \
  --value "your-license-key" \
  --region "your-aws-region" \
  --profile "your-aws-profile"
```

This method is particularly useful for simplifying License Key management in larger teams or projects.
It centralizes the License Key storage and eliminates the need for manual configuration in every deployment setup.
