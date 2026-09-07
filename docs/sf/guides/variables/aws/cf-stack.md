<!--
title: Serverless Framework - Variables - CloudFormation Stack Outputs
description: How to reference AWS CloudFormation Stack Outputs in the Serverless Framework for enhanced service integration.
short_title: Serverless Variables - CloudFormation Outputs
keywords:
  [
    'Serverless Framework',
    'CloudFormation Stack Outputs',
    'AWS',
    'configuration',
    'deployment',
  ]
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/guides/variables/aws/cf-stack)

<!-- DOCS-SITE-LINK:END -->

# Configuration options

The `cf` resolver reads outputs from any CloudFormation stack in your account. To share outputs between services that live in the same [Compose](../../compose.md) project, use the [`service` resolver](../../compose.md#service-dependencies-and-variables) instead — it references services by name and can read a service deployed to a different stage. Reach for `cf` when the stack you need is outside your Compose project.

| Option   | Required |  Type  |              Default               | Description |
| -------- | :------: | :----: | :--------------------------------: | :---------- |
| `region` |    No    | String | Inherited from parent AWS resolver | AWS region  |

## Examples

### Default Configuration

In this example, the `awsAccount1` provider is set up to fetch CloudFormation stack outputs using the default region associated with your deployment.
This setup is useful when your Serverless service needs to dynamically reference values from another service or stack, such as resource names.
The `cf:stackName.outputKey` syntax ensures that you can easily pull outputs from another stack without hard-coding values.

```yaml
stages:
  default:
    resolvers:
      awsAccount1:
        type: aws

functions:
  hello:
    handler: handler.hello
    description: ${awsAccount1:cf:another-service.functionPrefix}
```

### Custom region

Here, the `awsAccount1` provider is configured with a default region (`us-west-2`), while the `euCf` resolver is set to pull CloudFormation outputs from the `eu-west-1` region.
This is particularly useful when your service needs to integrate with resources or outputs from stacks deployed in different regions.
For instance, if your primary service is deployed in one region but needs to interact with a resource defined in a stack in another region, this setup handles that cross-region reference smoothly.

```yaml
stages:
  default:
    resolvers:
      awsAccount1:
        type: aws
        region: us-west-2
        euCf:
          type: cf
          region: eu-west-1

functions:
  hello:
    handler: handler.hello
    description: ${awsAccount1:euCf:another-service.functionPrefix}
```

# Requests and rate limits

The Framework resolves all variables concurrently before a command runs. Every `${cf:}` reference reads a CloudFormation stack with the `DescribeStacks` API, and the Framework makes that call once per stack: a service that references twenty outputs of the same stack makes one call, and services deployed together with Serverless Framework Compose share that call when they resolve with the same credentials, while a service that assumes a role or signs in through SSO on its own receives its own temporary credentials and makes its own call per stack.

CloudFormation applies a rate limit per AWS account and region to `DescribeStacks`. When a call is throttled, the Framework retries it with the AWS SDK's standard exponential backoff, up to 10 attempts by default. Run with `--verbose` to see each retry as it happens. If the retries are exhausted, the command fails with the `RESOLVER_AWS_RATE_EXCEEDED` error, which names the API, the number of attempts, and how many stacks the run referenced.

The retry settings are the standard AWS SDK settings and follow the same precedence as in every AWS SDK and the AWS CLI: the `AWS_MAX_ATTEMPTS` and `AWS_RETRY_MODE` environment variables, then the `max_attempts` and `retry_mode` keys in `~/.aws/config`. The Framework default of 10 attempts applies only when none of them is set. See [Retry behavior in the AWS SDKs and Tools Reference Guide](https://docs.aws.amazon.com/sdkref/latest/guide/feature-retry-behavior.html).

If many deployments in the same account and region run at the same time, for example in CI, they share the same rate limit. When the services that reference each other deploy together, use [Serverless Framework Compose](../../compose) and pass values between them with the `${service.output}` syntax: outputs flow from the deploying service to the services that depend on it, in dependency order, without any `${cf:}` lookups. For stacks that deploy separately, you can reference their exported values with [`Fn::ImportValue`](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/intrinsic-function-reference-importvalue.html), which CloudFormation resolves during the deployment; an exported value cannot be changed or removed while another stack imports it. Otherwise, run fewer deployments concurrently.

# Classic (Pre-Resolvers) Format

You can reference CloudFormation stack output values as the source of your variables to use in your service with the `cf:stackName.outputKey` syntax.
It uses the deployment (provider) AWS credentials to access CloudFormation.
For example:

```yml
service: new-service
provider: aws
functions:
  hello:
    name: ${cf:another-service-dev.functionPrefix}-hello
    handler: handler.hello
  world:
    name: ${cf:another-stack.functionPrefix}-world
    handler: handler.world
```

In that case, the framework will fetch the values of those `functionPrefix` outputs from the provided stack names and populate your variables. There are many use cases for this functionality and it allows your service to communicate with other services/stacks.

You can add such custom output to CloudFormation stack. For example:

```yml
service: another-service
provider:
  name: aws
  runtime: nodejs14.x
  region: ap-northeast-1
  memorySize: 512
functions:
  hello:
    name: ${self:custom.functionPrefix}hello
    handler: handler.hello
custom:
  functionPrefix: 'my-prefix-'
resources:
  Outputs:
    functionPrefix:
      Value: ${self:custom.functionPrefix}
      Export:
        Name: functionPrefix
    memorySize:
      Value: ${self:provider.memorySize}
      Export:
        Name: memorySize
```

You can also reference CloudFormation stack in another regions with the `cf(REGION):stackName.outputKey` syntax. For example:

```yml
service: new-service
provider: aws
functions:
  hello:
    name: ${cf(us-west-2):another-service-dev.functionPrefix}-hello
    handler: handler.hello
  world:
    name: ${cf(ap-northeast-1):another-stack.functionPrefix}-world
    handler: handler.world
```

You can reference [CloudFormation stack outputs export values](http://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/outputs-section-structure.html) as well. For example:

```yml
# Make sure you set export value in StackA.

  Outputs:
    DynamoDbTable:
      Value:
        "Ref": DynamoDbTable
      Export:
        Name: DynamoDbTable-${self:custom.stage}

# Then you can reference the export name in StackB

provider:
  environment:
    Table:
        'Fn::ImportValue': 'DynamoDbTable-${self:custom.stage}'
```

## AWS CloudFormation Pseudo Parameters and Intrinsic functions

[AWS Pseudo Parameters](http://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/pseudo-parameter-reference.html)
can be used in values which are passed through as is to CloudFormation template properties.

Otherwise Serverless Framework has no implied understanding of them and does not try to resolve them on its own.

Same handling applies to [CloudFormation Intrinsic functions](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/intrinsic-function-reference.html)
