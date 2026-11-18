<!--
title: CloudFormation Stack Output Variables
description: Read outputs of deployed AWS CloudFormation stacks in serverless.yml with cf variables, across Regions and accounts, with defaults and rate limits.
short_title: CloudFormation Outputs
keywords:
  [
    'Serverless Framework',
    'CloudFormation stack outputs',
    'cf variable',
    'AWS',
    'cross-stack references',
  ]
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/guides/variables/aws/cf-stack)

<!-- DOCS-SITE-LINK:END -->

# CloudFormation Stack Output Variables

A `${cf:<stack>.<output>}` variable reads an output of a deployed AWS CloudFormation stack, such as another service or a stack created outside the Serverless Framework. To pass values between services of one [Compose](../../compose.md) project, use `${service:<service>.<Output>}` instead: it orders the deployments and reads the service at the stage of the current run. To read a service deployed to a fixed stage, such as a shared `dev` database read from a personal stage, use a named `service` resolver ([Referencing a service deployed to a different stage](../../compose.md#referencing-a-service-deployed-to-a-different-stage)).

The following `serverless.yml` reads the `QueueUrl` output of the `orders-dev` stack:

```yaml
# serverless.yml
service: my-service

provider:
  name: aws
  runtime: nodejs24.x

functions:
  hello:
    handler: handler.hello
    environment:
      ORDERS_QUEUE_URL: ${cf:orders-dev.QueueUrl}
```

The `orders-dev` stack declares the output in its own configuration, for example under `resources.Outputs` of the `orders` service:

```yaml
# orders/serverless.yml
resources:
  Resources:
    OrdersQueue:
      Type: AWS::SQS::Queue
  Outputs:
    QueueUrl:
      Value: !Ref OrdersQueue
```

## Syntax of the cf variable

```text
${cf:STACK_NAME.OUTPUT_KEY}
${cf(REGION):STACK_NAME.OUTPUT_KEY}
${RESOLVER_NAME:cf:STACK_NAME.OUTPUT_KEY}
${RESOLVER_NAME:NESTED_RESOLVER_NAME:STACK_NAME.OUTPUT_KEY}
```

- `STACK_NAME`: the name of the deployed stack. A Serverless Framework service's stack is named `<service>-<stage>` unless `provider.stackName` sets another name.
- `OUTPUT_KEY`: the logical ID of the output in the stack's `Outputs` section. A reference without it stops with `Invalid CloudFormation variable '${cf:...}': expected '<stackName>.<outputKey>'.`
- `REGION`: the Region of the stack; see [Read outputs from another Region](#read-outputs-from-another-region).
- `RESOLVER_NAME`, `NESTED_RESOLVER_NAME`: an [AWS resolver](./README.md#configure-an-aws-resolver) and its nested `cf` resolver; see [Read outputs with another account or profile](#read-outputs-with-another-account-or-profile).

The variable resolves to the output's value, a string. When the stack or the output doesn't exist, the variable uses its default (`${cf:orders-dev.QueueUrl, 'none'}`), otherwise the command stops with a `Cannot resolve '${cf:...}' variable` error. Other errors, such as denied access, stop the command even when a default is set.

`${cf:...}` reads with the deployment credentials, which need the `cloudformation:DescribeStacks` permission on the stack.

## Read outputs from another Region

To read a stack in another Region, put the Region in parentheses:

```yaml
functions:
  hello:
    handler: handler.hello
    environment:
      ORDERS_QUEUE_URL: ${cf(eu-west-1):orders-dev.QueueUrl}
```

Without a Region, `${cf:...}` reads the stack in the Region the [AWS variables use](./README.md#region). The Region in parentheses applies when the deployment credentials come from `provider.profile` or the default AWS credential chain, or from an `aws` resolver that doesn't set `region`.

## Read outputs with another account or profile

To read a stack with other credentials, declare an [AWS resolver](./README.md#configure-an-aws-resolver) and reference `cf` through it. The following `serverless.yml` reads an output from the account behind the `shared-account` profile, in `us-east-1` and in `eu-west-1`:

```yaml
stages:
  default:
    resolvers:
      sharedAccount:
        type: aws
        profile: shared-account
        euCf:
          type: cf
          region: eu-west-1

provider:
  name: aws

functions:
  hello:
    handler: handler.hello
    environment:
      NETWORK_VPC_ID: ${sharedAccount:cf:network-prod.VpcId}
      EU_NETWORK_VPC_ID: ${sharedAccount:euCf:network-prod.VpcId}
```

This service also deploys with the `shared-account` profile: a single `type: aws` resolver supplies the deployment credentials when neither `provider.profile` nor `provider.resolver` is set. To deploy with other credentials, set `provider.profile`, or declare another `type: aws` resolver and name it in `provider.resolver`.

`sharedAccount` sets no `region`, so `${sharedAccount:cf:...}` reads in the [Region](./README.md#region) the AWS variables use, and `${sharedAccount:euCf:...}` reads in `eu-west-1`.

## CloudFormation resolver settings

A nested resolver with `type: cf` under an AWS resolver accepts these keys:

| Key      | Type   | Default                          | Description                                                                                                                          |
| -------- | ------ | -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `type`   | String | Required                         | `cf`.                                                                                                                                |
| `region` | String | The parent AWS resolver's Region | Region of the stacks. Applies only when the parent AWS resolver doesn't set `region`; when both set it, the parent's Region is used. |

## Requests and rate limits

The Framework resolves all variables concurrently before a command runs. It reads each stack with the CloudFormation `DescribeStacks` API once per run: a service that references twenty outputs of the same stack makes one call. Services deployed together with Serverless Framework Compose share that call when they resolve with the same credentials; a service that assumes a role or signs in through SSO on its own makes its own call per stack. In a Compose run, a stack that one service deployed or removed is read again by the services that run after it, so they see its new outputs.

CloudFormation applies a rate limit per AWS account and Region to `DescribeStacks`. When a call is throttled, the Framework retries it with the AWS SDK's standard exponential backoff, up to 10 attempts by default; run with `--verbose` to see each retry. When the retries run out, the command stops with the `RESOLVER_AWS_RATE_EXCEEDED` error, which names the API, the number of attempts and how many stacks the run referenced.

The retry settings follow the same precedence as in every AWS SDK and the AWS CLI: the `AWS_MAX_ATTEMPTS` and `AWS_RETRY_MODE` environment variables, then the `max_attempts` and `retry_mode` keys in `~/.aws/config`. The Framework default of 10 attempts applies only when none of them is set. See [Retry behavior in the AWS SDKs and Tools Reference Guide](https://docs.aws.amazon.com/sdkref/latest/guide/feature-retry-behavior.html).

Deployments that run at the same time in the same account and Region, for example in CI, share the rate limit. To reduce `DescribeStacks` calls:

- Deploy services that reference each other with [Serverless Framework Compose](../../compose.md#service-dependencies-and-variables) and pass values with `${service:<service>.<Output>}`: outputs flow from one service to the next in dependency order, without `${cf:...}` lookups.
- For stacks that deploy separately, reference exported values with [`Fn::ImportValue`](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/intrinsic-function-reference-importvalue.html), which CloudFormation resolves during the deployment. A value can't be changed or removed while another stack imports it.
- Run fewer deployments concurrently.

## Exported values with Fn::ImportValue

`Fn::ImportValue` reads an [exported output](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/outputs-section-structure.html) during the deployment instead of when the Framework loads `serverless.yml`. The exporting stack names the export:

```yaml
# orders/serverless.yml
resources:
  Outputs:
    QueueUrl:
      Value: !Ref OrdersQueue
      Export:
        Name: orders-${sls:stage}-QueueUrl
```

The importing service references the export name:

```yaml
provider:
  name: aws
  environment:
    ORDERS_QUEUE_URL:
      Fn::ImportValue: orders-${sls:stage}-QueueUrl
```

## CloudFormation pseudo parameters and intrinsic functions

The Framework passes [CloudFormation pseudo parameters](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/pseudo-parameter-reference.html) such as `${AWS::Region}` and `${AWS::AccountId}` in an `Fn::Sub` string to CloudFormation unchanged, and leaves [intrinsic functions](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/intrinsic-function-reference.html) such as `Ref` and `Fn::GetAtt` for CloudFormation to resolve during the deployment.

## Related

- [AWS variables and resolvers](./README.md): the account ID, Region and partition, and AWS resolver settings.
- [Variables in serverless.yml](../README.md): syntax, defaults and the other variable sources.
- [Composing Serverless Framework services](../../compose.md): deploy services together and pass outputs between them.
