<!--
title: AWS Variables and Resolvers
description: Use the AWS account ID, Region and partition in serverless.yml, and configure aws resolvers that read SSM, S3 and CloudFormation with other credentials.
short_title: AWS Variables
keywords:
  - Serverless Framework
  - AWS variables
  - aws resolver
  - accountId
  - region
  - partition
  - AWS credentials
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/guides/variables/aws)

<!-- DOCS-SITE-LINK:END -->

# AWS Variables and Resolvers

`${aws:...}` variables give the AWS account ID, Region and partition of the credentials the Serverless Framework uses, and an `aws` resolver lets variables read SSM parameters, S3 objects and CloudFormation outputs with credentials, a profile or a Region of your choice.

The following `serverless.yml` builds a queue ARN from the account and Region the service deploys to:

```yaml
# serverless.yml
service: my-service

provider:
  name: aws
  runtime: nodejs24.x
  region: us-east-1

functions:
  hello:
    handler: handler.hello
    environment:
      QUEUE_ARN: arn:${aws:partition}:sqs:${aws:region}:${aws:accountId}:my-queue
```

In account `123456789012`, `QUEUE_ARN` is `arn:aws:sqs:us-east-1:123456789012:my-queue`.

## AWS variable sources

- [SSM Parameter Store and Secrets Manager](./ssm.md): `${ssm:...}` reads a parameter, or a Secrets Manager secret through Parameter Store.
- [S3 objects](./s3.md): `${s3:...}` reads the content of an object.
- [CloudFormation stack outputs](./cf-stack.md): `${cf:...}` reads an output of a deployed stack.

## Account ID

`${aws:accountId}` is the ID of the AWS account the credentials belong to, read with the AWS STS `GetCallerIdentity` API. `${<resolver>:accountId}` gives the account of an [AWS resolver](#configure-an-aws-resolver)'s credentials.

## Region

`${aws:region}` is the Region the AWS variables use, taken from the first of these that is set:

1. The `region` of the AWS resolver (`${<resolver>:region}`, or the resolver that supplies the deployment credentials).
2. The `--region` option. Pass `--region`, not `-r`: with `-r`, `${aws:region}` has no value and the AWS variables skip `provider.region` and the rest of this list.
3. `provider.region` in `serverless.yml`.
4. The `AWS_REGION` environment variable.
5. `us-east-1`.

## Partition

`${aws:partition}` is the AWS partition of the Region, such as `aws`, `aws-cn` (China) or `aws-us-gov` (AWS GovCloud (US)). Use it to build ARNs that work in every partition. The Framework derives it from the Region without an AWS call, and an unknown Region gives `aws`, like the CloudFormation `AWS::Partition` pseudo parameter.

| Region           | `${aws:partition}` |
| ---------------- | ------------------ |
| `us-east-1`      | `aws`              |
| `cn-north-1`     | `aws-cn`           |
| `us-gov-west-1`  | `aws-us-gov`       |
| `us-iso-east-1`  | `aws-iso`          |
| `eusc-de-east-1` | `aws-eusc`         |

## Configure an AWS resolver

To read values from another AWS account, with another profile or in another Region, declare a resolver with `type: aws` under `stages.<stage>.resolvers` and use its name as the variable's source. The following `serverless.yml` reads an SSM parameter and the account ID with the `shared-account` profile:

```yaml
stages:
  default:
    resolvers:
      sharedAccount:
        type: aws
        profile: shared-account
        region: us-west-2

provider:
  name: aws
  resolver: sharedAccount

functions:
  hello:
    handler: handler.hello
    environment:
      SHARED_ACCOUNT_ID: ${sharedAccount:accountId}
      API_KEY: ${sharedAccount:ssm:/shared/api-key}
```

`provider.resolver: sharedAccount` makes this resolver supply the deployment credentials too, so the service deploys with the `shared-account` profile and in `us-west-2`. To read from the shared account but deploy with other credentials, remove `provider.resolver` and set `provider.profile`, or declare another `type: aws` resolver and name it in `provider.resolver`.

An AWS resolver accepts these keys:

| Key               | Type    | Default                          | Description                                                                                             |
| ----------------- | ------- | -------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `type`            | String  | Required                         | `aws`.                                                                                                  |
| `profile`         | String  | The default AWS credential chain | AWS profile to read credentials from. A profile with `mfa_serial` prompts for the MFA code.             |
| `accessKeyId`     | String  | None                             | AWS access key ID. Requires `secretAccessKey`.                                                          |
| `secretAccessKey` | String  | None                             | AWS secret access key. Requires `accessKeyId`.                                                          |
| `sessionToken`    | String  | None                             | Session token for temporary credentials, used with `accessKeyId` and `secretAccessKey`.                 |
| `region`          | String  | See [Region](#region)            | Region for the resolver's requests and for `${<resolver>:region}`.                                      |
| `dashboard`       | Boolean | `true`                           | Set `false` to ignore the service's Serverless Framework Dashboard provider credentials.                |
| `ignoreCache`     | Boolean | `false`                          | Set `true` to re-read the AWS shared config and credentials files instead of the AWS SDK's cached copy. |

The resolver takes its credentials from the first of these that applies:

1. The service's [Dashboard provider](../../../providers/aws/guide/credentials.md#using-serverless-dashboard-providers-with-resolvers) credentials, when the service has `org` and `app` and a provider is set up, unless `dashboard: false`.
2. `accessKeyId` and `secretAccessKey`.
3. `profile`, or without it the default AWS credential chain (environment variables, `AWS_PROFILE`, then the shared config and credentials files).

To keep keys out of `serverless.yml`, reference them with variables, for example `accessKeyId: ${env:SHARED_AWS_ACCESS_KEY_ID}`.

## Deployment credentials and `${aws:...}`

`${aws:...}`, `${ssm:...}`, `${s3:...}` and `${cf:...}` use the deployment credentials: the resolver named in `provider.resolver`, otherwise the only resolver with `type: aws`, otherwise the `--aws-profile` option, `provider.profile` or the default AWS credential chain. When `provider.profile` is set, the resolvers aren't used for deployment credentials. Several `type: aws` resolvers without `provider.resolver` or `provider.profile` stop the command with `Multiple resolvers with type "aws" found`, and `provider.resolver` can't be combined with `provider.profile`. [AWS credentials](../../../providers/aws/guide/credentials.md#using-resolvers-to-specify-deployment-credentials) explains how a deployment picks its credentials.

A resolver named `aws` replaces the deployment credentials for `${aws:...}` variables only.

## Nested SSM, S3 and CloudFormation resolvers

Under an AWS resolver, a key whose value has a `type` of `ssm`, `s3` or `cf` declares a nested resolver with its own settings, used as `${<resolver>:<nested>:<address>}`. The following resolver reads SSM parameters in `eu-west-1` with the `shared-account` profile:

```yaml
stages:
  default:
    resolvers:
      sharedAccount:
        type: aws
        profile: shared-account
        euSsm:
          type: ssm
          region: eu-west-1

provider:
  name: aws

custom:
  euApiKey: ${sharedAccount:euSsm:/shared/api-key}
```

This service also deploys with the `shared-account` profile: a single `type: aws` resolver supplies the deployment credentials when neither `provider.profile` nor `provider.resolver` is set. To deploy with other credentials, set `provider.profile`, or declare another `type: aws` resolver and name it in `provider.resolver`.

- A nested resolver's `region` applies only when the parent AWS resolver doesn't set `region`; when both set it, the parent's Region is used.
- Nested resolver names must be unique within a stage.
- `${<resolver>:ssm:...}`, `${<resolver>:s3:...}` and `${<resolver>:cf:...}` work without declaring a nested resolver, with the default settings.
- `${<resolver>:<path>}` without a resolver type reads an SSM parameter.

The [SSM](./ssm.md#ssm-resolver-settings), [S3](./s3.md#s3-resolver-settings) and [CloudFormation](./cf-stack.md#cloudformation-resolver-settings) pages list each nested resolver's settings.

## Requests and retries

The Framework resolves all variables concurrently before a command runs. When AWS throttles a request, the Framework retries it with the AWS SDK's standard exponential backoff, up to 10 attempts unless `AWS_MAX_ATTEMPTS`, `AWS_RETRY_MODE` or the matching `~/.aws/config` keys say otherwise. When the retries run out, the command stops with the `RESOLVER_AWS_RATE_EXCEEDED` error. The [SSM](./ssm.md#requests-and-rate-limits) and [CloudFormation](./cf-stack.md#requests-and-rate-limits) pages describe each service's limits.
