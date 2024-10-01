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

Starting with Version 4, authentication is required for all users of the Serverless Framework, and License Keys are one method of providing this authentication.
While many users, such as individual developers and small organizations, can use the Framework without needing to pay,
certain larger organizations are required to purchase a subscription. For detailed information on pricing and which organizations are required to subscribe, please refer to the [Serverless Framework Pricing page](https://www.serverless.com/pricing).

## What Are License Keys And Why You Need Them

License keys are unique identifiers used to authenticate your access to Serverless Framework V4 and ensure compliance with its licensing model.
They provide an alternative to Dashboard-based authentication, particularly useful for organizations that prefer not to manage access through the Serverless Dashboard.
This makes them ideal for environments like CI/CD pipelines or automated systems where Dashboard access isn’t practical.

By using License Keys, you can streamline authentication and access management, ensuring compliance with the Framework’s licensing model across your organization.

## Key Characteristics

* **No Expiration**: License keys do not have an expiration date. This provides consistent access to the Framework without the need to regularly update keys. However, you should still periodically rotate keys for security purposes.
* **Simple Validation**: License keys do not provide fine-grained access control or permissions on the Serverless Dashboard. Their main function is to validate your usage and track compliance with your subscription.

## How to Provide License Keys

You can provide License Keys in two ways:

1. **Environment Variable**: Set the `SERVERLESS_LICENSE_KEY` environment variable in your environment or CI/CD pipeline.

```bash
export SERVERLESS_LICENSE_KEY=<your-license-key>
```

2. **Configuration File**: Use the `licenseKey` field in your serverless.yml configuration file. This supports [Variable Resolvers](./variables) like [SSM](./variables/aws/ssm) or [Vault](./variables/hashicorp/vault) for secure storage.

```yaml
service: my-service

licenseKey: ${vault:secret/serverless-framework/license-key}

provider:
  name: aws
  runtime: nodejs20.x
  
functions:
  hello:
    handler: handler.hello
```

This allows you to manage the License Keys securely, without embedding them directly in your configuration files, and it enables easy key rotation if needed.

## Best Practices for License Key Management

Even though License Keys offer flexibility, there are some best practices to ensure you use them efficiently and securely:

### Flexible Scoping

License keys offer flexible scoping to fit your organization’s needs:

* **Per Service**: While License Keys apply to the entire organization, you can assign them to specific services for ease of management and organization.
This helps streamline authentication across different services.
* **Per Team**: License Keys can be assigned to teams for organizational purposes, allowing efficient management of authentication across teams.
* **Global Key**: Use a single License Key for your entire organization, simplifying management by covering all services and teams under one license.

### Secure Storage with Resolvers

For enhanced security and ease of management,
you should store your License Keys in secure systems like AWS Systems Manager (SSM) or HashiCorp Vault.
Using these resolvers allows you to:

* **Easily Rotate Keys**: Storing your License Keys in a Resolver like SSM or Vault simplifies key rotation without the need to modify code or configurations.
* **Improve Distribution**: Resolvers make it easier to distribute License Keys across multiple services, environments, or CI/CD pipelines securely.
* **Control Access**: Systems like Vault and AWS SSM allow fine-grained access controls, ensuring that only authorized users and services can access the License Keys.

Here’s an example of how to reference a License Key stored in AWS SSM:

```yaml
service: my-service

licenseKey: ${ssm:/serverless-framework/license-key}

provider:
  name: aws
  runtime: nodejs20.x
  
functions:
  hello:
    handler: handler.hello
```

This ensures that the key is managed securely, reducing the risk of exposure and ensuring compliance.

For more details, refer to
* [Serverless Variables documentation](./variables)
* [AWS SSM Resolver documentation](./variables/aws/ssm)
* [HashiCorp Vault Resolver documentation](./variables/hashicorp/vault)
