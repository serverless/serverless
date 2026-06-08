<!--
title: Serverless Framework - Variables - AWS-specific variables
description: >-
  How to reference AWS-specific variables in the Serverless Framework for
  efficient configuration and deployment.
short_title: Serverless Variables - AWS Variables
keywords:
  - Serverless Framework
  - AWS-specific variables
  - configuration
  - deployment
  - accountId
  - region
  - partition
-->

# Resolvers

- [AWS S3](s3)
- [AWS SSM Parameter Store & Secrets Manager](ssm)
- [AWS CloudFormation Outputs](cf-stack)

# Configuration options

| Option            | Required |  Type   |  Default  | Description                                                          |
| ----------------- | :------: | :-----: | :-------: | :------------------------------------------------------------------- |
| `accessKeyId`     |    No    | String  |           | AWS Access Key ID                                                    |
| `secretAccessKey` |    No    | String  |           | AWS Secret Access Key                                                |
| `sessionToken`    |    No    | String  |           | AWS Session Token                                                    |
| `region`          |    No    | String  | us-east-1 | AWS region                                                           |
| `profile`         |    No    | String  |           | AWS profile name                                                     |
| `dashboard`       |    No    | Boolean |   true    | Whether Serverless Dashboard AWS Provider credentials should be used |

## Example

```yaml
stages:
  default:
    resolvers:
      aws-account-1:
        type: aws
        profile: account1-profile-name
        region: us-west-2
        accessKeyId: ${env:ACCOUNT1_AWS_ACCESS_KEY_ID}
        secretAccessKey: ${env:ACCOUNT1_AWS_SECRET_ACCESS_KEY}
        dashboard: false
```

# Provider-specific variables

You can reference AWS-specific values as the source of your variables. Those values are exposed via the Serverless Variables system through:

1. `{providerName:}` variable prefix which should be the name of the resolver provider specified in the `resolvers` block (`aws-account-1` in the example above).
2. `{aws:}` variable prefix which uses the deployment credentials.

The following variables are available:

**accountId**

Account ID of you AWS Account, based on the AWS Credentials that you have configured.

```yml
service: new-service
provider:
  name: aws

functions:
  func1:
    name: function-1
    handler: handler.func1
    environment:
      ACCOUNT_ID: ${aws:accountId}
```

**region**

The region used by the Serverless CLI. The `${aws:region}` variable is a shortcut for `${opt:region, self:provider.region, "us-east-1"}`.

**partition**

The AWS partition for the resolved region, derived locally with no AWS API call. This is useful for building ARNs that work across partitions such as AWS GovCloud (US) and China, where the ARN prefix is `aws-us-gov` or `aws-cn` instead of `aws`.

| Region (example) | `${aws:partition}` |
| ---------------- | ------------------ |
| `us-east-1`      | `aws`              |
| `cn-north-1`     | `aws-cn`           |
| `us-gov-west-1`  | `aws-us-gov`       |

All AWS partitions are supported, including the isolated and sovereign ones: `aws-iso`, `aws-iso-b`, `aws-iso-e`, and `aws-iso-f` (US ISO regions) and `aws-eusc` (European Sovereign Cloud).

Unknown regions fall back to `aws`, matching the behavior of the CloudFormation `AWS::Partition` pseudo-parameter.

```yml
service: new-service
provider:
  name: aws

functions:
  func1:
    name: function-1
    handler: handler.func1
    environment:
      QUEUE_ARN: arn:${aws:partition}:sqs:${aws:region}:${aws:accountId}:my-queue
```
