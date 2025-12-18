<!--
title: Serverless Framework - AWS Lambda Managed Instances
description: How to configure AWS Lambda Managed Instances (Capacity Providers) in the Serverless Framework
short_title: Lambda Managed Instances
keywords:
  [
    'Serverless Framework',
    'AWS Lambda',
    'Managed Instances',
    'Capacity Providers',
    'EC2',
  ]
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/aws/guide/managed-instances)

<!-- DOCS-SITE-LINK:END -->

# AWS Lambda Managed Instances

AWS Lambda Managed Instances run your functions on AWS-managed EC2 infrastructure, offering significant cost savings for high-traffic workloads through EC2 pricing models.

Unlike standard Lambda, **Managed Instances support multi-concurrency**, allowing a single execution environment to process multiple requests simultaneously for better resource utilization.

> **Warning:** Ensure your function code is thread-safe and stateless. Global variables and shared resources in the execution environment will be accessed concurrently by multiple invocations.

## Configuration

### Minimal Configuration

The simplest configuration requires only VPC settings (these can be inherited from `provider.vpc`):

```yml
provider:
  name: aws
  vpc:
    subnetIds:
      - subnet-xxx
    securityGroupIds:
      - sg-xxx

functions:
  api:
    handler: handler.api
    capacityProvider: default
```

When using this minimal configuration:
- A **default capacity provider** is automatically created.
- It **inherits the VPC configuration** from `provider.vpc`.
- It uses a default, **automatically created Operator Role**.
- **Scaling Mode** defaults to `auto`.
- **Instance Requirements** default to any compatible instance type.
- **Max vCPU Count** defaults to no limit.

Additionally, the function using this provider will use default settings:
- **memorySize**: `2048` MB
- **maxConcurrency**: Defaults to the service default (varies by runtime).
  - Node.js: 64
  - Java: 32
  - .NET: 32
  - Python: 16
- **memoryPerVCpu**: 2 GB per vCPU.
- **scaling**: By default, AWS Lambda maintains a minimum of 3 execution environments with no upper scaling limit (`min` defaults to 3, `max` is unbounded). This is an AWS service default, not set by the Serverless Framework.

### Defining Capacity Providers

Capacity Providers are defined at the provider level under `capacityProviders`:

```yml
# serverless.yml
service: my-service

provider:
  name: aws
  runtime: nodejs20.x
  vpc:
    subnetIds:
      - subnet-12345678
    securityGroupIds:
      - sg-12345678
  capacityProviders:
    highMem:
      scaling:
        maxVCpuCount: 100
        mode: auto
```

### Full Configuration

```yml
provider:
  name: aws
  runtime: nodejs24.x
  vpc:
    subnetIds:
      - subnet-xxx
    securityGroupIds:
      - sg-xxx

  capacityProviders:
    highMem:
      # Optional: Operator role for the capacity provider.
      # If omitted, a role trusting lambda.amazonaws.com with
      # AWSLambdaManagedEC2ResourceOperator is created automatically.
      permissions:
        operatorRole: arn:aws:iam::123456789012:role/MyOperatorRole

      # Optional: VPC configuration for the capacity provider.
      # If omitted, provider.vpc is used.
      vpc:
        subnetIds:
          - subnet-aaa
          - subnet-bbb
        securityGroupIds:
          - sg-aaa

      # Optional: EC2 instance requirements. If omitted, any instance
      # types in x86_64 architecture may be used.
      instanceRequirements:
        allowedInstanceTypes:
          - r7g.large
          - r7g.xlarge
        # OR excludedInstanceTypes (but not both)
        # excludedInstanceTypes:
        #   - t4g.nano
        architectures:
          - arm64 # defaults to provider.architecture if omitted

      # Optional: Auto-scaling configuration for the capacity provider.
      scaling:
        # 'auto' -> service-managed scaling
        # 'manual' -> user-managed via scaling.policies
        mode: manual

        # Maximum vCPU count for this capacity provider (12–15000).
        maxVCpuCount: 200

        # Target tracking policies for manual mode.
        policies:
          - predefinedMetricType: LambdaCapacityProviderAverageCPUUtilization
            targetValue: 70

      # Optional customer-managed KMS key.
      kmsKeyArn: arn:aws:kms:us-east-1:123456789012:key/12345678-1234-1234-1234-123456789012
```

## Using Capacity Providers with Functions

### Basic Usage

Reference a capacity provider by name:

```yml
functions:
  my-function:
    handler: index.handler
    capacityProvider: highMem
```

### Function-Level Capacity Provider Configuration

For advanced control, configure capacity providers at the function level:

```yml
functions:
  etl:
    handler: handler.etl
    memorySize: 4096

    capacityProvider:
      # Name of the capacity provider defined under provider.capacityProviders,
      # or a direct ARN of an external capacity provider.
      # Can also be an intrinsic function (e.g. !GetAtt MyCapacityProvider.Arn).
      name: highMem

      # Per-execution environment concurrency (1–1600).
      maxConcurrency: 100

      # Memory (GiB) per vCPU for each execution environment (2, 4, or 8).
      memoryPerVCpu: 4

      # Function-level scaling for execution environments (0–15000).
      # Note: If min is set to 0, max must also be set to 0.
      scaling:
        min: 5
        max: 10
```

## External Capacity Providers

You can reference capacity providers created outside your Serverless service by providing the ARN directly:

```yml
functions:
  my-function:
    handler: index.handler
    capacityProvider: arn:aws:lambda:us-east-1:123456789012:capacity-provider:external-provider

  # You can also use CloudFormation intrinsics directly:
  my-other-function:
    handler: index.handler
    capacityProvider: !GetAtt MyExternalCapacityProvider.Arn
```

## Multiple Capacity Providers

Define multiple capacity providers for different use cases:

```yml
provider:
  capacityProviders:
    high-memory:
      instanceRequirements:
        allowedInstanceTypes:
          - r7g.large
          - r7g.xlarge

    cost-optimized:
      instanceRequirements:
        allowedInstanceTypes:
          - t3.small
          - t3.medium

functions:
  memory-intensive:
    handler: handler.process
    capacityProvider:
      name: high-memory

  batch-job:
    handler: handler.batch
    capacityProvider:
      name: cost-optimized
```

## VPC Configuration

Capacity Providers require VPC configuration. You can:

1.  **Inherit from provider-level VPC:**
    ```yml
    provider:
      vpc:
        subnetIds:
          - subnet-xxx
        securityGroupIds:
          - sg-xxx
    ```

2.  **Override per capacity provider:**
    ```yml
     provider:
      vpc:
        subnetIds:
          - subnet-aaa
        securityGroupIds:
          - sg-aaa
      capacityProviders:
        default:
          vpc:
            subnetIds:
              - subnet-bbb  # Different subnet
            securityGroupIds:
              - sg-bbb      # Different security group
    functions:
      # Uses the capacity provider VPC (subnet-bbb / sg-bbb)
      withCapacityProvider:
        handler: handler.with
        capacityProvider: default

      # Does not use a capacity provider and keeps using provider.vpc
      withoutCapacityProvider:
        handler: handler.without
    ```

## IAM Operator Role

Each capacity provider requires an operator role with the `AWSLambdaManagedEC2ResourceOperator` managed policy.

### Automatic Role Creation

If you don't specify `permissions.operatorRole`, the framework creates one automatically:

```yml
capacityProviders:
  default:
    scaling:
      maxVCpuCount: 100
    # An operator role is automatically created with AWSLambdaManagedEC2ResourceOperator policy
```

### Custom Operator Role

Provide your own operator role ARN:

```yml
capacityProviders:
  default:
    scaling:
      maxVCpuCount: 100
    permissions:
      operatorRole: arn:aws:iam::123456789012:role/MyCustomOperatorRole
```

> The custom operator role must have the `AWSLambdaManagedEC2ResourceOperator` managed policy attached or equivalent permissions.

## Generated CloudFormation Resources

When you define a capacity provider, the following CloudFormation resources are created:

1.  **AWS::Lambda::CapacityProvider** - The capacity provider resource
2.  **AWS::IAM::Role** - The operator role (if not explicitly provided)

Example for a capacity provider named `default` in service `my-service`:
- Capacity Provider: `DefaultLambdaCapacityProvider`
- Operator Role: `LambdaCapacityProviderOperatorRole`

## Important Considerations

> **Regional Availability**: Lambda Managed Instances are available in specific regions only. Check AWS documentation for current regional support.

> **Execution Environment Concurrency**: Each execution environment can handle multiple requests concurrently, reducing compute consumption but affecting function design.

### Deleting Capacity Providers and Function Versions

When `provider.versionFunctions` is enabled (the default), or a function explicitly sets `functions.<name>.versionFunction: true`, each published version of that function is associated with the capacity provider in use at the time.

If you later change the `capacityProvider` for a function and remove the old capacity provider from `provider.capacityProviders`, CloudFormation may fail to delete the old capacity provider with an error similar to:

> The capacity provider is currently in use by 1 functions. To delete this capacity provider, first remove its association with arn:aws:lambda:REGION:ACCOUNT:capacity-provider:my-service-dev-HighMemLambdaCapacityProvider-XXXXXXXX.

This happens because older function versions are still associated with the previous capacity provider, even if no function in `serverless.yml` references it anymore.

To resolve this:
- Ensure that traffic is no longer using the old function versions and then delete the old versions before removing the capacity provider.
- If you rely only on `$LATEST` and do not want function versions at all, you can disable automatic versioning:

  ```yml
  provider:
    versionFunctions: false
  ```

  With `versionFunctions: false`, previous function versions are not created for managed-instance functions, so old capacity providers can be removed without version associations blocking deletion.

## Best Practices

1. **Start with Auto scaling mode** for most use cases
2. **Use Default VPC inheritance** when all functions and capacity providers share the same network
3. **Configure appropriate maxVCpuCount** to control costs and resource limits
4. **Set min/max scaling values** at the function level for fine-grained control
5. **Use Savings Plans or Reserved Instances** to optimize costs
6. **Monitor execution environment usage** to optimize resource allocation

## Learn More

- [AWS Lambda Managed Instances Documentation](https://docs.aws.amazon.com/lambda/latest/dg/lambda-managed-instances.html)
- [AWS Lambda Capacity Providers](https://docs.aws.amazon.com/lambda/latest/dg/capacity-providers.html)
