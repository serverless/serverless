<!--
title: 'Serverless Framework State'
description: 'Learn how to manage state in Serverless Framework Compose.'
short_title: Serverless Framework State
keywords:
  [
    'Serverless Framework',
    'serverless-compose',
    'state management',
    'S3 state',
    'service state',
  ]
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/guides/state)

<!-- DOCS-SITE-LINK:END -->

# Serverless Framework State

Serverless Framework Compose allows for the orchestration and deployment of multiple services.
A crucial aspect of this is managing the state of each service, which includes storing outputs and other runtime information necessary for the correct operation of services.
This guide covers how to set up and manage state using AWS S3 and AWS SSM.

## State Management Overview

State management in Serverless Framework Compose is crucial for:

- **Storing Service Outputs**: Save outputs from deployments to share them across services.
- **Ensuring Consistency**: Maintain the state of services across deployments, ensuring that each service can access the necessary data for its operation.
- **Handling Dependencies**: Automatically resolve dependencies between services by referencing shared state.

Serverless Framework Compose uses AWS S3 to store the state of services and AWS SSM (Systems Manager) to track the location of the state storage.

## Zero-Configuration Setup

The easiest way to manage state in Serverless Framework Compose is through its default, zero-configuration setup. When you don’t specify any state configuration, Serverless Framework Compose automatically handles everything for you.

### How It Works

1. **Automatic S3 Bucket Creation**: If no state configuration is provided in your `serverless-compose.yml`, Serverless Framework Compose automatically creates an S3 bucket to store the state.
2. **SSM Parameter Store**: The name and region of the automatically created S3 bucket are stored in AWS SSM Parameter Store in `us-east-1` AWS region, under the parameter `/serverless-framework/state/s3-bucket`. This parameter contains a JSON object with the following keys:

- `bucketName`: The name of the S3 bucket.
- `bucketRegion`: The AWS region where the bucket is located.

3. **Versioning Enabled**: The created S3 bucket will have versioning enabled by default, ensuring that different states over time are maintained and can be rolled back if necessary.

**Note**: To create the default state bucket, you must have the necessary permissions to put SSM parameters and create versioned S3 buckets.
If you don’t have these permissions, you can set up a [custom state configuration](#custom-state-configuration) to use an existing S3 bucket.

### Example

Assume you have the following serverless-compose.yml with two services:

```yaml
services:
  service-a:
    path: service-a

  service-b:
    path: service-b
    params:
      queueUrl: ${service-a.queueUrl}
```

In this case, without any additional state configuration, Serverless Framework Compose will:

- Create a versioned S3 bucket to store the state of service-a and service-b.
- Store the name and region of this bucket in SSM Parameter Store.
- Automatically manage the retrieval and updating of this state during deployments.

#### Deploying Services

To deploy all services and manage their state automatically:

```bash
serverless deploy
```

This command will:

- Deploy service-a and save its state (like output URLs and ARNs) to the S3 bucket.
- Deploy service-b, retrieve the state from service-a, and inject necessary outputs (e.g., `queueUrl`) as parameters.

State allows you to execute commands on individual services even if they have dependencies on other services.
When you use commands like

```bash
serverless <service> <command>
```

the Framework automatically fetches the necessary input data from the stored state,
making it easy to manage and deploy services with complex interdependencies.

## Custom State Configuration

While the zero-configuration setup is convenient, there may be situations where you want to customize how and where the state is stored.
If you require this level of customization, you can specify custom state management settings in your `serverless-compose.yml`.
Here’s how you can do it:

### Using a Custom S3 Bucket

You can specify an existing S3 bucket for storing the state using Resolvers:

```yaml
state: my-s3-state-resolver

stages:
  default:
    resolvers:
      my-aws-account:
        type: aws
        my-s3-state-resolver:
          type: s3
          bucketName: my-custom-state-bucket

services:
  service-a:
    path: service-a

  service-b:
    path: service-b
    params:
      queueUrl: ${service-a.queueUrl}
```

In this setup:

- The `state` field defines the state resolver, which is linked to an existing S3 bucket.
- The Framework will use this bucket instead of creating a new one. **The bucket must be versioned to ensure proper state management.**

**Note**: For more information on Resolvers, refer to the [Resolvers documentation](variables).

## Cleaning Up State

When you run `serverless remove`, the state stored in the S3 bucket is also deleted, ensuring that no unnecessary data is left in your AWS account.
