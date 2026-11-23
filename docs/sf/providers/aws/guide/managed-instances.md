<!--
title: Managed Instances (AWS Lambda Managed Instances)
description: 'Run Lambda functions on EC2 instances in your VPC with capacity providers: setup, instance types, scaling, concurrency, IAM and errors.'
short_title: Managed Instances
keywords:
  [
    'Serverless Framework',
    'AWS Lambda Managed Instances',
    'Lambda capacity provider',
    'capacityProvider',
    'EC2',
  ]
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/aws/guide/managed-instances)

<!-- DOCS-SITE-LINK:END -->

# Managed Instances (AWS Lambda Managed Instances)

Managed Instances run your Lambda functions on Amazon EC2 instances in your own VPC, using what AWS calls [Lambda Managed Instances](https://docs.aws.amazon.com/lambda/latest/dg/lambda-managed-instances.html). Lambda launches, patches and scales the instances; you choose the network, the instance types and the scaling limits through a **capacity provider**, and point functions at it with `capacityProvider`. Each execution environment serves many requests at once, and you pay EC2 prices for the instances, so Savings Plans and Reserved Instances apply.

Use Managed Instances instead of standard Lambda functions when:

- Traffic is high and steady, and paying for instances costs less than paying per request.
- You need specific hardware: the latest CPUs (Graviton4), memory-to-vCPU ratios up to 8 GiB per vCPU, or high network bandwidth.
- Requests mostly wait on databases and APIs, so one environment can serve many of them concurrently.
- Compliance requires functions to run on instances in your VPC.

Stay with standard functions for bursty, latency-sensitive traffic: Managed Instances scale on CPU use rather than per request, and a function that [scales to zero](#scale-to-zero) throttles requests for a few minutes while it starts again.

## Quick start

Prerequisites:

- Serverless Framework v4 and AWS credentials that can deploy (see [IAM permissions for Managed Instances](#iam-permissions-for-managed-instances)).
- A VPC with subnets in at least two Availability Zones and a security group. The instances run there, so the subnets need a route to a NAT gateway or VPC endpoints for the AWS services your code calls.
- A runtime Lambda Managed Instances supports: Node.js 22 or later, Python 3.13 or later, Java 21 or later, .NET 8 or later, or `provided.al2023` ([supported runtimes](https://docs.aws.amazon.com/lambda/latest/dg/lambda-managed-instances-runtimes.html)).
- A Region where Lambda Managed Instances are available.

This `serverless.yml` runs one function on the default capacity provider:

```yaml
# serverless.yml
service: my-service

provider:
  name: aws
  runtime: nodejs24.x
  region: us-east-1
  vpc:
    subnetIds:
      - subnet-0a1b2c3d4e5f60718
      - subnet-0f1e2d3c4b5a69788
    securityGroupIds:
      - sg-0123456789abcdef0

functions:
  api:
    handler: handler.handler
    capacityProvider: default
```

Replace the subnet and security group IDs with your own. `capacityProvider: default` makes the Framework create a capacity provider named `default` in `provider.vpc`, with an operator role and AWS's default scaling. The function gets 2048 MB of memory, the minimum for Managed Instances.

The handler, in `handler.mjs`, is an async function, as Lambda Managed Instances require for Node.js:

```javascript
export const handler = async (event) => {
  return { statusCode: 200, body: JSON.stringify({ ok: true }) }
}
```

Deploy:

```bash
serverless deploy
```

The first deploy takes several minutes: Lambda launches three instances across Availability Zones and starts three execution environments before the function version becomes active. Check it with:

```bash
serverless invoke --function api
```

```text
{
    "statusCode": 200,
    "body": "{\"ok\":true}"
}
```

The instances run, and bill, until you remove the service:

```bash
serverless remove
```

`serverless remove` deletes the capacity provider, and Lambda terminates its instances.

## Write code for concurrent requests

One execution environment handles many invocations at the same time, unlike standard Lambda, where it handles one. Module-level variables, open connections and files in `/tmp` are shared by concurrent invocations:

- Keep per-request state inside the handler, not in module-level variables.
- Use a connection pool rather than one shared database connection.
- Give files in `/tmp` per-request names.
- In Node.js, write `async` handlers: Managed Instances don't run callback-based handlers on Node.js 22, and Node.js 24 deprecates them.

The runtime guides for [Node.js](https://docs.aws.amazon.com/lambda/latest/dg/lambda-managed-instances-nodejs-runtime.html) and the other languages describe how each runtime runs concurrent requests.

## Define a capacity provider

Capacity providers are defined under `provider.capacityProviders`, each under a name, and functions reference that name:

```yaml
provider:
  name: aws
  runtime: nodejs24.x
  vpc:
    subnetIds:
      - subnet-0a1b2c3d4e5f60718
      - subnet-0f1e2d3c4b5a69788
    securityGroupIds:
      - sg-0123456789abcdef0
  capacityProviders:
    highMem:
      instanceRequirements:
        allowedInstanceTypes:
          - r7i.*
      scaling:
        maxVCpuCount: 100

functions:
  report:
    handler: report.handler
    capacityProvider: highMem
```

Each capacity provider is deployed as `<service>-<stage>-<name>` (`my-service-dev-highMem` here). Functions on the same capacity provider share its instances, and the capacity provider is their security boundary: put functions that don't trust each other on separate capacity providers.

A `capacityProvider` value that is neither a name under `provider.capacityProviders` nor `default` is passed to Lambda as a capacity provider ARN.

## Choose instance types and architecture

A function must use the same architecture as its capacity provider. Set it once in `provider.architecture`, which the Framework applies to every function and every capacity provider; `arm64` runs on Graviton instances:

```yaml
provider:
  architecture: arm64
  capacityProviders:
    compute:
      instanceRequirements:
        allowedInstanceTypes:
          - c7g.large
          - c7g.xlarge
```

`instanceRequirements` restricts the instance types Lambda may launch. List the allowed types, or the excluded ones, but not both; a `*` matches the sizes of one family (`c7g.*`). Without `instanceRequirements`, Lambda chooses the instance types, which AWS recommends for availability.

The Framework sets the two architectures separately and doesn't match one to the other:

- A capacity provider uses `instanceRequirements.architectures`, else `provider.architecture`, else `x86_64`.
- A function uses its own `architecture`, else `provider.architecture`, else Lambda's default, `x86_64`.

`instanceRequirements.architectures: [arm64]` alone leaves the functions on `x86_64`; set `provider.architecture`, or each function's `architecture`, to match it.

## Configure scaling

Scaling has two levels: the capacity provider caps the instances, and each function sets how many execution environments it keeps.

On the capacity provider, `scaling.mode: auto` (the default) lets Lambda scale on CPU use, and `maxVCpuCount` caps the fleet (AWS default 400). `scaling.mode: manual` scales on your target-tracking policies instead:

```yaml
provider:
  capacityProviders:
    steady:
      scaling:
        mode: manual
        maxVCpuCount: 200
        policies:
          - predefinedMetricType: LambdaCapacityProviderAverageCPUUtilization
            targetValue: 70
```

On the function, `capacityProvider.scaling` sets the minimum and maximum execution environments. Without it, Lambda keeps at least 3 (one per Availability Zone) and sets no maximum:

```yaml
functions:
  api:
    handler: handler.handler
    capacityProvider:
      name: steady
      scaling:
        min: 5
        max: 20
```

Lambda scales asynchronously, without cold starts; when traffic more than doubles within 5 minutes, requests can be throttled while capacity grows ([scaling](https://docs.aws.amazon.com/lambda/latest/dg/lambda-managed-instances-scaling.html)).

### Scale to zero

Set `min` to `0` to let the function scale to zero when it is idle, and keep `max` above `0` or unset:

```yaml
functions:
  report:
    handler: handler.handler
    capacityProvider:
      name: default
      scaling:
        min: 0
        max: 10
```

Lambda starts one execution environment when the function is deployed and stops the last one after a period without invocations; it terminates an instance once no function on the capacity provider runs on it, so instance charges stop. The next invocation is throttled with HTTP 429 while Lambda starts an execution environment, which typically takes a few minutes, longer with a slow initialization. Retry synchronous invocations with exponential backoff for long enough to cover that, or keep `min` at `1` or more for latency-sensitive functions (`3` keeps one per Availability Zone). A function that keeps using CPU between invocations, such as with background threads, doesn't scale to zero ([scaling to zero](https://docs.aws.amazon.com/lambda/latest/dg/lambda-managed-instances-scaling.html#lambda-managed-instances-scale-to-zero)).

Lambda keeps a scaling configuration per function version. The Framework applies `scaling` to the function and to the version each deploy publishes; versions published before keep their own configuration, Lambda's default minimum of 3 when they had none, and their execution environments keep instances running. Remove them with [`prune`](./prune.md).

Setting both `min` and `max` to `0` deactivates the function without deleting it: Lambda stops its execution environments and doesn't start them on invocation until `max` is set above `0` again.

## Tune concurrency and memory per function

The object form of `functions.<name>.capacityProvider` sets how many requests one execution environment takes and how much memory each vCPU gets:

```yaml
functions:
  etl:
    handler: etl.handler
    memorySize: 8192
    capacityProvider:
      name: highMem
      maxConcurrency: 32
      memoryPerVCpu: 4
```

- `memorySize` sets the environment's memory, from 2048 to 32768 MB.
- `memoryPerVCpu` sets the ratio of GiB to vCPUs, `2`, `4` or `8`. The environment's vCPUs are its memory divided by that ratio, so this function gets 8 GiB and 2 vCPUs. An environment has at least 1 vCPU, so `memorySize` must be at least `memoryPerVCpu` × 1024. Without `memoryPerVCpu`, Lambda's default ratio applies; set it when you need a known number of vCPUs. Python functions often need a ratio of 4 or 8.
- `maxConcurrency` caps the concurrent requests of one execution environment, whatever its vCPUs: here 32 for 2 vCPUs. Without it, Lambda's default grows with the vCPUs: 64 per vCPU for Node.js, 32 for Java and .NET, 16 for Python. Lower it for functions that use much memory and little CPU; AWS suggests at most 64 per vCPU ([scaling](https://docs.aws.amazon.com/lambda/latest/dg/lambda-managed-instances-scaling.html)).

## Move existing functions onto a capacity provider

Add `capacityProvider` to a function and deploy: CloudFormation updates the function in place ([`CapacityProviderConfig`](https://docs.aws.amazon.com/AWSCloudFormation/latest/TemplateReference/aws-resource-lambda-function.html#cfn-lambda-function-capacityproviderconfig) updates without interruption). Before you deploy, check that each function:

- Uses a [supported runtime](https://docs.aws.amazon.com/lambda/latest/dg/lambda-managed-instances-runtimes.html) and, on Node.js, an `async` handler.
- Has no `memorySize` below 2048, on the function or in `provider`.
- Has the capacity provider's architecture.
- Has no `fileSystemConfig`.

The function's own `vpc` and `provider.vpc` stop applying to it: it runs in the capacity provider's subnets.

This configuration moves two functions onto one Graviton capacity provider, capped at 64 vCPUs, in two private subnets:

```yaml
provider:
  name: aws
  runtime: nodejs24.x
  architecture: arm64
  vpc:
    subnetIds:
      - subnet-0a1b2c3d4e5f60718
      - subnet-0f1e2d3c4b5a69788
    securityGroupIds:
      - sg-0123456789abcdef0
  capacityProviders:
    graviton:
      scaling:
        maxVCpuCount: 64

functions:
  api:
    handler: handler.handler
    memorySize: 4096
    capacityProvider:
      name: graviton
      maxConcurrency: 32
      memoryPerVCpu: 4
  worker:
    handler: worker.handler
    runtime: python3.14
    memorySize: 8192
    capacityProvider:
      name: graviton
      maxConcurrency: 8
      memoryPerVCpu: 4
      scaling:
        min: 1
        max: 5
```

`api` gets 4 GiB and 1 vCPU per execution environment and takes up to 32 requests in each; `worker` gets 8 GiB and 2 vCPUs, takes up to 8 requests in each, and runs 1 to 5 execution environments. The deploying identity needs the permissions in [IAM permissions for Managed Instances](#iam-permissions-for-managed-instances).

## Use a different VPC for a capacity provider

A capacity provider's own `vpc` replaces `provider.vpc` for its instances:

```yaml
provider:
  vpc:
    subnetIds:
      - subnet-0a1b2c3d4e5f60718
    securityGroupIds:
      - sg-0123456789abcdef0
  capacityProviders:
    isolated:
      vpc:
        subnetIds:
          - subnet-0b2c3d4e5f6071829
          - subnet-0c3d4e5f607182930
        securityGroupIds:
          - sg-0fedcba9876543210

functions:
  onCapacityProvider:
    handler: handler.a
    capacityProvider: isolated # runs in subnet-0b2c… and subnet-0c3d…
  standard:
    handler: handler.b # a standard function in provider.vpc
```

A function on a capacity provider takes its network from the capacity provider: its own `vpc` and `provider.vpc` don't apply to it.

## Use your own operator role

The operator role lets Lambda manage EC2 resources for the capacity provider. Without `permissions.operatorRole`, the Framework creates one role, `LambdaCapacityProviderOperatorRole`, that trusts `lambda.amazonaws.com` and has the `AWSLambdaManagedEC2ResourceOperator` managed policy, and all capacity providers without their own role share it. To use an existing role instead:

```yaml
provider:
  capacityProviders:
    highMem:
      permissions:
        operatorRole: arn:aws:iam::123456789012:role/MyOperatorRole
```

The role needs the `AWSLambdaManagedEC2ResourceOperator` managed policy, or equivalent permissions ([security and permissions](https://docs.aws.amazon.com/lambda/latest/dg/lambda-managed-instances-security.html)).

## Use a capacity provider from another stack

To run a function on a capacity provider that this service doesn't define, give its ARN, or a CloudFormation intrinsic that resolves to it:

```yaml
functions:
  shared:
    handler: handler.shared
    capacityProvider: arn:aws:lambda:us-east-1:123456789012:capacity-provider:platform-shared
  imported:
    handler: handler.imported
    capacityProvider:
      name: !ImportValue SharedCapacityProviderArn
      maxConcurrency: 16
```

The object form keeps `maxConcurrency`, `memoryPerVCpu` and `scaling` available with an ARN or an intrinsic in `name`.

## Configuration reference

### `provider.capacityProviders`

A map of capacity provider names to their settings. Each entry creates an `AWS::Lambda::CapacityProvider` named `<service>-<stage>-<name>`. Optional; the `default` entry is created automatically when a function uses `capacityProvider: default`. Every key below is optional.

- `vpc`: the instances' subnets and security groups. Object with `subnetIds` (1 to 16) and `securityGroupIds` (up to 5), each a list of IDs or CloudFormation references, or one expression that yields the list (`Fn::Split`, `Fn::FindInMap`). Default: `provider.vpc`. One of the two is required.
- `instanceRequirements.allowedInstanceTypes`: list of instance types or `family.*` patterns Lambda may launch. No default (Lambda chooses). Not with `excludedInstanceTypes`.
- `instanceRequirements.excludedInstanceTypes`: list of instance types or `family.*` patterns Lambda must not launch. No default. Not with `allowedInstanceTypes`.
- `instanceRequirements.architectures`: a one-item list, `x86_64` or `arm64`. Default: `provider.architecture`, else `x86_64`. Functions don't take it: they use their own `architecture` or `provider.architecture`.
- `scaling.mode`: `auto` or `manual`, case-insensitive. Default: AWS's, `auto`. `manual` requires `scaling.policies`.
- `scaling.maxVCpuCount`: integer, 12 to 15000. Default: AWS's, 400.
- `scaling.policies`: list of 1 to 10 target-tracking policies, each with `predefinedMetricType: LambdaCapacityProviderAverageCPUUtilization` and `targetValue`, a number from 0 to 100. No default.
- `kmsKeyArn`: KMS key ARN that encrypts the instances' EBS volumes. Default: an AWS managed key.
- `permissions.operatorRole`: ARN of an existing operator role. Default: the generated `LambdaCapacityProviderOperatorRole`.

### `functions.<name>.capacityProvider`

Runs the function on a capacity provider. A string (a name under `provider.capacityProviders`, `default`, or an ARN), a CloudFormation intrinsic that resolves to an ARN, or an object with these keys:

- `name`: required in the object form. A string or a CloudFormation intrinsic, with the same meaning as the string form.
- `maxConcurrency`: integer, 1 to 1600; the most concurrent requests per execution environment, whatever its vCPUs. Default: Lambda's, which grows with the vCPUs: 64 per vCPU for Node.js, 32 for Java and .NET, 16 for Python.
- `memoryPerVCpu`: `2`, `4` or `8`; GiB of memory per vCPU, so the environment has `memorySize` ÷ 1024 ÷ `memoryPerVCpu` vCPUs, at least 1. Default: Lambda's.
- `scaling.min`: integer, 0 to 15000; execution environments Lambda keeps. Default: Lambda's, 3. `0` lets the function [scale to zero](#scale-to-zero), or deactivates it with `scaling.max: 0`. `min` can't exceed `max`.
- `scaling.max`: integer, 0 to 15000. Default: no maximum.

The function's `memorySize` defaults to 2048 when neither the function nor `provider` sets it, and must be 2048 to 32768. Setting `capacityProvider` on a function has these effects:

- The function's own `vpc` and `provider.vpc` don't apply to it.
- `fileSystemConfig` isn't available.
- `serverless dev` leaves the function running in AWS instead of on your machine.

## Limits and behavior

- **Resources created**: an `AWS::Lambda::CapacityProvider` per entry (logical ID `<Name>LambdaCapacityProvider`, such as `DefaultLambdaCapacityProvider`), and one `AWS::IAM::Role`, `LambdaCapacityProviderOperatorRole`, unless every capacity provider names its own `operatorRole`.
- **Quotas**: 1,000 capacity providers per account (default), 15,000 vCPUs per capacity provider, and 100 function versions per capacity provider, which AWS doesn't increase. EC2 quotas for vCPUs, EBS volumes and subnet IP addresses apply too ([quotas](https://docs.aws.amazon.com/lambda/latest/dg/lambda-managed-instances-quotas.html)).
- **Function versions**: with versioning on (`provider.versionFunctions`, the default), each deploy that changes a function publishes a version tied to the capacity provider in use, with the function's `scaling`. Each version keeps the execution environments its own scaling configuration asks for until it is removed, so remove old versions with [`prune`](./prune.md) to stay under 100 per capacity provider.
- **Cost**: EC2 pricing for the instances plus a management fee, whether or not requests arrive, down to the functions' minimum execution environments ([AWS Lambda pricing](https://aws.amazon.com/lambda/pricing/)). Instances stop billing when Lambda terminates them after `serverless remove` or a deactivation.
- **Scale to zero**: with `scaling.min: 0`, the first invocations after an idle period are throttled for a few minutes while an execution environment starts. Standard functions suit rare, latency-sensitive traffic better.
- **Not for** workloads that need a file system mount.

## IAM permissions for Managed Instances

`serverless deploy` creates capacity providers and attaches functions to them through CloudFormation. Besides what every deploy needs, the identity that deploys needs:

- `lambda:PassCapacityProvider` on each capacity provider its functions use, including one from another stack.
- `lambda:CreateCapacityProvider`, `lambda:GetCapacityProvider`, `lambda:UpdateCapacityProvider`, `lambda:DeleteCapacityProvider`, `lambda:ListTags`, `lambda:TagResource`, `lambda:UntagResource` and `kms:DescribeKey`, for the capacity providers the service defines.
- `iam:PassRole` on the operator role, and the IAM permissions to create the generated `LambdaCapacityProviderOperatorRole` unless every capacity provider sets `permissions.operatorRole`.
- `iam:CreateServiceLinkedRole` for `lambda.amazonaws.com` when the account has no capacity provider yet, or its `AWSServiceRoleForLambda` role was deleted ([operator role](https://docs.aws.amazon.com/lambda/latest/dg/lambda-managed-instances-operator-role.html)).

With `provider.iam.deploymentRole` set, CloudFormation makes these calls with that role, so grant them to it.

Account administrators scope `lambda:PassCapacityProvider` to control which functions run on which capacity providers. Capacity providers are named `<service>-<stage>-<name>`, so this statement covers every capacity provider of `my-service`:

```json
{
  "Effect": "Allow",
  "Action": "lambda:PassCapacityProvider",
  "Resource": "arn:aws:lambda:us-east-1:123456789012:capacity-provider:my-service-*"
}
```

See [security and permissions](https://docs.aws.amazon.com/lambda/latest/dg/lambda-managed-instances-security.html) in the AWS Lambda Developer Guide.

## Troubleshooting Managed Instances

### `Capacity provider "default": VPC configuration is required...`

```text
Capacity provider "default": VPC configuration is required. Specify subnetIds and securityGroupIds on provider.vpc or provider.capacityProviders.default.vpc.
```

Cause: neither `provider.vpc` nor the capacity provider's `vpc` sets both `subnetIds` and `securityGroupIds`.

Fix: add both to `provider.vpc`, or to `provider.capacityProviders.<name>.vpc`, as in the [quick start](#quick-start).

### `Functions using capacityProvider must have memory size at least 2048 MB...`

```text
Functions using capacityProvider must have memory size at least 2048 MB; received 1024 for function "api".
```

Cause: the function's `memorySize`, or `provider.memorySize`, is below 2048.

Fix: set `memorySize: 2048` or more on the function, or remove the smaller value so the 2048 default applies.

### `...when scaling.mode is set to "manual", at least one scaling.policies entry is required.`

```text
Capacity provider "steady": when scaling.mode is set to "manual", at least one scaling.policies entry is required.
```

Fix: add a `scaling.policies` entry, as in [Configure scaling](#configure-scaling), or use `mode: auto`.

### `...allowedInstanceTypes and instanceRequirements.excludedInstanceTypes cannot be set at the same time.`

```text
Capacity provider "highMem": instanceRequirements.allowedInstanceTypes and instanceRequirements.excludedInstanceTypes cannot be set at the same time.
```

Fix: keep one of the two lists.

### `Invalid function scaling configuration for function "api"...`

```text
Invalid function scaling configuration for function "api": scaling.min (5) cannot be greater than scaling.max (2).
```

Cause: `capacityProvider.scaling.min` is greater than `max`.

Fix: lower `min` or raise `max`.

### `File system configuration isn't compatible with functions using capacity provider compute.`

Cause: the function sets both `fileSystemConfig` and `capacityProvider`.

Fix: remove one of them; read shared files from Amazon S3 or a database instead.

### `The capacity provider is currently in use by 1 functions...`

CloudFormation reports this from AWS when a deploy removes a capacity provider:

```text
The capacity provider is currently in use by 1 functions. To delete this capacity provider, first remove its association with arn:aws:lambda:us-east-1:123456789012:capacity-provider:my-service-dev-highMem.
```

Cause: published versions of a function still belong to the old capacity provider after you moved the function to another one and removed the old entry from `provider.capacityProviders`.

Fix: list the versions still attached to the old capacity provider, move traffic off them, delete them (for example with [`serverless prune`](./prune.md)), and deploy again:

```bash
aws lambda list-function-versions-by-capacity-provider --capacity-provider-name my-service-dev-highMem
```

A service that invokes only `$LATEST` can set `provider.versionFunctions: false` so that the Framework publishes no new versions and later capacity provider removals delete cleanly. The setting doesn't remove versions already published, so delete those first.

## Related

- [Functions](./functions.md): the function settings `capacityProvider` combines with.
- [Capacity Providers in the `serverless.yml` reference](./serverless.yml.md#capacity-providers).
- [Prune](./prune.md): remove old function versions.
- [Lambda Managed Instances](https://docs.aws.amazon.com/lambda/latest/dg/lambda-managed-instances.html) and [capacity providers](https://docs.aws.amazon.com/lambda/latest/dg/lambda-managed-instances-capacity-providers.html) in the AWS Lambda Developer Guide.
