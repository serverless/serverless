<!--
title: 'Serverless Framework Deployment Bucket'
description: 'Learn how to manage the Deployment Bucket in Serverless Framework.'
short_title: Serverless Framework Deployment Bucket
keywords:
  [
    'Serverless Framework',
    'Deployment Bucket',
    'S3 bucket',
    'deployment artifacts',
    'deployment storage',
  ]
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/guides/deployment-bucket/)

<!-- DOCS-SITE-LINK:END -->

# Serverless Framework Deployment Bucket

The Serverless Framework simplifies deploying services by managing deployment artifacts and resources efficiently.
A key component of this process is the **Deployment Bucket**, which serves as a storage mechanism for Lambda function code, CloudFormation templates,
and other resources required for service deployment, service rollback, and efficient parameter retrieval.
This guide outlines the purpose, behavior, and management of the Deployment Bucket in Serverless Framework.

### Key Features of the Deployment Bucket:

- **Per-Region Bucket**: Deployment buckets are created and managed per AWS region, ensuring that resources are stored in compliance with AWS's regional requirements for services like Lambda.
- **Shared Across Services**: For each region, the Deployment Bucket is shared across services within the same AWS account, optimizing resource management and reducing duplication.

## Managing Deployment Buckets

### Automatic Bucket Creation

When deploying a service for the first time, the Serverless Framework will automatically create a Deployment Bucket if one does not already exist in the region.
This bucket will be used for storing all future deployment artifacts for services within that region and account.

The name of the automatically created bucket follows a specific naming convention:

- It starts with a predefined prefix (`serverless-framework-deployments`).
- It includes the AWS region where the service is being deployed.
- A unique identifier (UUID) is appended to ensure bucket name uniqueness across accounts (as required by AWS).

For example, a Deployment Bucket created for the `us-east-1` region might be named:
`serverless-framework-deployments-us-east-1-abc1234567890`

Additionally, the Deployment Bucket that is automatically created will have versioning enabled by default.

#### SSM Parameter Storage

The name and region of the Deployment Bucket are stored in the AWS SSM Parameter Store under the key `/serverless-framework/deployment/s3-bucket`.
The value of this parameter is a JSON object with the following structure:

```json
{
  "bucketName": "<bucket-name>",
  "bucketRegion": "<bucket-region>"
}
```

This allows the Framework to track the bucket used for deployments, ensuring consistency across services and regions.
If the specified bucket doesn't exist, it will be automatically created by the Serverless Framework during deployment.

### Custom Bucket Configuration

In some cases, you may want to use a custom bucket instead of the default Deployment Bucket.
Custom buckets are particularly useful when you need more control over access policies, bucket properties,
or if you want to centralize deployment artifacts across multiple AWS accounts.
The Serverless Framework allows for this level of customization through configuration options in the `serverless.yml` file.

```yaml
provider:
  deploymentBucket:
    name: custom-deployment-bucket
```

This configuration ensures that the Serverless Framework will use the specified custom bucket instead of creating a new one.
To learn more about custom bucket configuration, refer to the [documentation](https://www.serverless.com/framework/docs/providers/aws/guide/serverless.yml#deployment-bucket).

## Deployment Bucket Behavior

### 1. **Deploying a New Service**:

When deploying a new service, the Serverless Framework will automatically check
for the existence of the Deployment Bucket in the specified AWS region. If no
bucket exists, it will create one. This bucket will then be used to store
deployment packages for the service, ensuring that all deployment artifacts are
stored in the correct region.

### 2. **Deploying an Existing Service Without Compose**:

For existing services deployed before Serverless Framework v4, a separate
Deployment Bucket was created per service by default. The Serverless Framework
does not change this behavior, and it continues to use the Deployment Bucket
that was created during the initial deployment (as specified in the
CloudFormation stack or YAML configuration). This ensures consistency in
deployment processes and prevents disruption to existing setups.

### 3. **Deploying with Compose**:

When deploying with [Compose](./compose), the Serverless Framework uses a shared
Deployment Bucket by default for all services, including existing ones. This
simplifies management by consolidating deployment artifacts into a single bucket
per region. However, if a custom Deployment Bucket is specified in the `provider.deploymentBucket`
field in the `serverless.yml` file, the Framework will use that bucket instead
of the shared one (see [Custom Bucket Configuration](#custom-bucket-configuration)).

## Regional Constraints and Compliance

Since AWS services like Lambda require deployment artifacts to be stored in the same region where the service is running, the Deployment Bucket is region-specific. When deploying services across multiple regions, the Serverless Framework will create and use a separate Deployment Bucket for each region. This ensures compliance with AWS's best practices for regional data storage and guarantees that your deployment artifacts are always available in the correct region.

## Migration to Centralized Deployment Buckets

The Serverless Framework supports the transition of services to a centralized Deployment Bucket model.
When deploying services with Compose, the Framework automatically uses a shared Deployment Bucket for all services within the same region.
This simplifies management and reduces the number of buckets needed for deployment artifacts
and reduces the complexity of managing multiple deployment artifacts across different services and environments.
To learn more about Compose, refer to the [Compose documentation](./compose).

## Cleanup and Maintenance

When a service is removed using the `serverless remove` command, the deployment artifacts stored in the Deployment Bucket are also cleaned up.
However, the bucket itself is not automatically deleted because it may contain resources shared across multiple services.
If you want to remove the bucket entirely, this must be done manually through the AWS console or AWS CLI.
