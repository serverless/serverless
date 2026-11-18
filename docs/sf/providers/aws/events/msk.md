<!--
title: Amazon MSK Events
description: 'Trigger a Lambda function from an Amazon MSK (Managed Streaming for Apache Kafka) topic with the msk event: authentication, batching, filters, provisioned mode.'
short_title: MSK
keywords:
  [
    'Serverless Framework',
    'AWS Lambda MSK trigger',
    'Amazon Managed Streaming for Apache Kafka',
    'MSK event source mapping',
    'Kafka',
  ]
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/aws/events/msk)

<!-- DOCS-SITE-LINK:END -->

# Amazon MSK Events

The `msk` event triggers a Lambda function with records from a topic on an Amazon MSK (Amazon Managed Streaming for Apache Kafka) cluster. The Framework creates a Lambda event source mapping: Lambda polls the topic, invokes the function with batches of records, and commits the offsets. The `msk` event connects to an existing cluster and topic; for a Kafka cluster outside Amazon MSK, use the [`kafka` event](./kafka.md).

The `msk` event requires the cluster's `arn` and the `topic`. This `serverless.yml` consumes the `orders` topic:

```yaml
# serverless.yml
service: my-service

provider:
  name: aws
  runtime: nodejs24.x

functions:
  compute:
    handler: handler.compute
    events:
      - msk:
          arn: arn:aws:kafka:us-east-1:123456789012:cluster/MyCluster/a1b2c3d4-5678-90ab-cdef-11111EXAMPLE-1
          topic: orders
```

The handler receives the records in `event.records`, an object keyed by `<topic>-<partition>` (for example `orders-0`) whose values are arrays of records, each with its message in `value` as a base64-encoded string. The `.mjs` extension makes the handler an ES module:

```javascript
// handler.mjs
export const compute = async (event) => {
  for (const records of Object.values(event.records)) {
    for (const record of records) {
      const message = Buffer.from(record.value, 'base64').toString('utf8')
      console.log(record.topic, record.partition, record.offset, message)
    }
  }
}
```

Without `saslScram512`, Lambda connects with IAM authentication when the cluster has it enabled, or without authentication; IAM authentication needs extra permissions (see [Authentication](#authentication)). The function itself needs no `vpc` settings: the event source mapping connects through the cluster's subnets and security groups, which must allow that traffic; see [Configuring your Amazon MSK cluster and Amazon VPC network for Lambda](https://docs.aws.amazon.com/lambda/latest/dg/with-msk-cluster-network.html).

## msk event options

The `msk` event accepts these keys:

| Key                         | Type                                       | Default                      | Description                                                               |
| --------------------------- | ------------------------------------------ | ---------------------------- | ------------------------------------------------------------------------- |
| `arn`                       | cluster ARN, `Ref` or `Fn::ImportValue`    | Required                     | The MSK cluster                                                           |
| `topic`                     | string                                     | Required                     | The topic to consume                                                      |
| `saslScram512`              | Secrets Manager secret ARN                 | Not set                      | Authenticate with SASL/SCRAM-SHA-512, the SCRAM mechanism Amazon MSK uses |
| `consumerGroupId`           | string, up to 200 characters               | Not set                      | The Kafka consumer group to join                                          |
| `startingPosition`          | `TRIM_HORIZON`, `LATEST` or `AT_TIMESTAMP` | `TRIM_HORIZON`               | Where Lambda starts reading                                               |
| `startingPositionTimestamp` | number, Unix time in seconds               | Required with `AT_TIMESTAMP` | The time to start reading from                                            |
| `batchSize`                 | number, `1`–`10000`                        | `100`                        | The largest number of records in one invocation                           |
| `maximumBatchingWindow`     | integer, `1`–`300` seconds                 | 500 ms (AWS)                 | How long Lambda gathers records before it invokes the function            |
| `filterPatterns`            | list of 1–10 patterns                      | No filter                    | Patterns a record must match to reach the function                        |
| `enabled`                   | boolean                                    | `true`                       | Whether Lambda polls the topic                                            |
| `provisionedPollers`        | object, or `false`                         | Not set: on-demand mode      | Provisioned mode settings                                                 |

## Cluster ARN formats

The `msk` event's `arn` takes the cluster ARN as a string, a `Ref` to an `AWS::MSK::Cluster` resource in the same service, or an `Fn::ImportValue` of an ARN that another stack exports. Other intrinsic functions, such as `Fn::GetAtt`, aren't accepted:

```yaml
functions:
  compute:
    handler: handler.compute
    events:
      # A literal ARN
      - msk:
          arn: arn:aws:kafka:us-east-1:123456789012:cluster/MyCluster/a1b2c3d4-5678-90ab-cdef-11111EXAMPLE-1
          topic: orders
      # An ARN exported by another CloudFormation stack
      - msk:
          arn: !ImportValue MyExportedMSKClusterArn
          topic: payments
      # A cluster declared in this service's resources
      - msk:
          arn: !Ref MyMSKCluster
          topic: refunds
```

## Authentication

The `msk` event supports these Amazon MSK authentication methods:

- **SASL/SCRAM**: set `saslScram512` to the ARN of a Secrets Manager secret that you have associated with the cluster in Amazon MSK; the Framework doesn't create or associate the secret. Amazon MSK requires the secret's name to start with `AmazonMSK_` and the secret to be encrypted with a customer managed KMS key.
- **IAM**: omit `saslScram512`. When IAM authentication is enabled on the cluster, Lambda uses it.
- **Unauthenticated**: omit `saslScram512` on a cluster without IAM authentication.

```yaml
functions:
  compute:
    handler: handler.compute
    events:
      - msk:
          arn: arn:aws:kafka:us-east-1:123456789012:cluster/MyCluster/a1b2c3d4-5678-90ab-cdef-11111EXAMPLE-1
          topic: orders
          saslScram512: arn:aws:secretsmanager:us-east-1:123456789012:secret:AmazonMSK_MySecret-AbCdEf
```

SASL/SCRAM and IAM authentication need permissions that the Framework doesn't add; see [IAM permissions for MSK events](#iam-permissions-for-msk-events). For the methods and how Lambda chooses between them, see [Configuring Amazon MSK cluster authentication methods in Lambda](https://docs.aws.amazon.com/lambda/latest/dg/msk-cluster-auth.html).

## Starting position and consumer group

The `msk` event's `startingPosition` sets where a new event source mapping starts reading:

- `TRIM_HORIZON` (the default): the oldest record in the topic.
- `LATEST`: just after the newest record. Lambda can miss records written while it creates or updates the mapping.
- `AT_TIMESTAMP`: the position at the time in `startingPositionTimestamp`, in Unix time seconds.

```yaml
functions:
  compute:
    handler: handler.compute
    events:
      - msk:
          arn: arn:aws:kafka:us-east-1:123456789012:cluster/MyCluster/a1b2c3d4-5678-90ab-cdef-11111EXAMPLE-1
          topic: orders
          consumerGroupId: orders-processor
          startingPosition: AT_TIMESTAMP
          startingPositionTimestamp: 1767225600
```

The `msk` event's `consumerGroupId` sets the Kafka consumer group that Lambda joins:

- It must be unique among your Kafka event sources, and it can't be changed after the event source mapping is created.
- If the group already exists in the cluster, Lambda starts from the group's committed offsets and ignores `startingPosition`.
- Other active consumers in the group receive part of the topic's records, and Lambda receives the rest.

See [Customizable consumer group ID](https://docs.aws.amazon.com/lambda/latest/dg/kafka-consumer-group-id.html) and [Starting positions](https://docs.aws.amazon.com/lambda/latest/dg/kafka-starting-positions.html).

## Batch size and batching window

The `msk` event's `batchSize` sets the largest number of records in one invocation, and `maximumBatchingWindow` sets how many seconds Lambda gathers records before it invokes the function:

```yaml
functions:
  compute:
    handler: handler.compute
    events:
      - msk:
          arn: arn:aws:kafka:us-east-1:123456789012:cluster/MyCluster/a1b2c3d4-5678-90ab-cdef-11111EXAMPLE-1
          topic: orders
          batchSize: 1000
          maximumBatchingWindow: 30
```

- `batchSize`: `1` to `10000`; AWS uses `100` when it isn't set.
- `maximumBatchingWindow`: `1` to `300` seconds. When it isn't set, AWS uses a 500 ms window. The Framework doesn't pass `0`, so `0` also leaves the 500 ms default in place.

Lambda invokes the function when the batch is full, when the window ends, or when the batch reaches the 6 MB payload limit, whichever comes first. See [Batching behavior](https://docs.aws.amazon.com/lambda/latest/dg/invocation-eventsourcemapping.html#invocation-eventsourcemapping-batching).

## Filter patterns

The `msk` event's `filterPatterns` passes only the records that match at least one pattern. MSK event source mappings filter on the `value` key, which holds the message; a pattern on message fields matches only messages that are valid JSON. This example passes only messages whose field `status` is `paid`:

```yaml
functions:
  compute:
    handler: handler.compute
    events:
      - msk:
          arn: arn:aws:kafka:us-east-1:123456789012:cluster/MyCluster/a1b2c3d4-5678-90ab-cdef-11111EXAMPLE-1
          topic: orders
          filterPatterns:
            - value:
                status: ['paid']
```

This pattern passes records whose JSON value has `"status": "paid"`; list several values to match any of them (`status: ['paid', 'refunded']`), and match numbers without quotes (`quantity: [1, 2]`). A pattern on fields doesn't apply to a value that isn't JSON; to filter plain-string messages, match the whole value, as in `value: [{ prefix: 'ERROR' }]`.

- Lambda drops records that match no pattern and commits their offsets, so the function never receives them.
- AWS allows 5 patterns per event source mapping by default, and up to 10 with a quota increase; the Framework accepts up to 10.

For the pattern syntax, see [Event filtering with Kafka event sources](https://docs.aws.amazon.com/lambda/latest/dg/kafka-filtering.html).

## Provisioned mode

Provisioned mode gives the event source mapping a dedicated pool of event pollers between a minimum and a maximum, for consistent low-latency processing. To use it, set the `msk` event's `provisionedPollers`:

```yaml
functions:
  compute:
    handler: handler.compute
    events:
      - msk:
          arn: arn:aws:kafka:us-east-1:123456789012:cluster/MyCluster/a1b2c3d4-5678-90ab-cdef-11111EXAMPLE-1
          topic: orders
          provisionedPollers:
            min: 1
            max: 100
            group: shared-capacity
```

- `min`: integer, `1` to `200`; AWS uses `1` when it isn't set.
- `max`: integer, `1` to `2000`, at least `min`; AWS uses `200` when it isn't set. Lambda caps it at the topic's partition count.
- `group`: up to 128 letters, digits, hyphens and underscores. Up to 100 event source mappings in the same VPC that share a group name share event poller capacity, which lowers cost; the `max` values in a group add up to at most 2,000. Removing `group` takes the mapping out of its group on the next deploy and keeps its `min` and `max`.

Provisioned mode adds a charge per event poller, and `min` pollers run all the time; see [AWS Lambda pricing](https://aws.amazon.com/lambda/pricing/).

**Important:** Removing `provisionedPollers` from `serverless.yml`, or running `serverless rollback` to a deployment without it, leaves provisioned mode on for the deployed mapping, and its pollers keep running. To turn provisioned mode off, deploy once with `provisionedPollers: false`. Use `false` only for a mapping that already exists; for a new mapping, omit the key.

See [Provisioned mode for Kafka event source mappings](https://docs.aws.amazon.com/lambda/latest/dg/kafka-scaling-modes.html#kafka-provisioned-mode).

## Disable the event source mapping

To stop Lambda from polling the topic without removing the mapping, set the `msk` event's `enabled: false`:

```yaml
functions:
  compute:
    handler: handler.compute
    events:
      - msk:
          arn: arn:aws:kafka:us-east-1:123456789012:cluster/MyCluster/a1b2c3d4-5678-90ab-cdef-11111EXAMPLE-1
          topic: orders
          enabled: false
```

## IAM permissions for MSK events

For `msk` events, the Framework adds these permissions to the function's execution role:

- `kafka:DescribeCluster` and `kafka:GetBootstrapBrokers` on each cluster ARN.
- `ec2:CreateNetworkInterface`, `ec2:DescribeNetworkInterfaces`, `ec2:DescribeVpcs`, `ec2:DeleteNetworkInterface`, `ec2:DescribeSubnets` and `ec2:DescribeSecurityGroups`.

Depending on the cluster, add these permissions with `provider.iam.role.statements`:

- **SASL/SCRAM**: `secretsmanager:GetSecretValue` on the `saslScram512` secret and `kms:Decrypt` on the secret's KMS key (the key ARN).
- **IAM authentication**: `kafka-cluster:Connect`, `kafka-cluster:DescribeGroup`, `kafka-cluster:AlterGroup`, `kafka-cluster:DescribeTopic` and `kafka-cluster:ReadData` on the cluster, its topics and its consumer groups.
- **MSK Serverless**: `kafka:DescribeClusterV2` on the cluster.

This example adds the SASL/SCRAM permissions:

```yaml
provider:
  name: aws
  runtime: nodejs24.x
  iam:
    role:
      statements:
        - Effect: Allow
          Action: secretsmanager:GetSecretValue
          Resource: arn:aws:secretsmanager:us-east-1:123456789012:secret:AmazonMSK_MySecret-AbCdEf
        - Effect: Allow
          Action: kms:Decrypt
          Resource: arn:aws:kms:us-east-1:123456789012:key/1234abcd-12ab-34cd-56ef-1234567890ab
```

See [Lambda execution role permissions for Amazon MSK](https://docs.aws.amazon.com/lambda/latest/dg/with-msk-permissions.html) and [IAM permissions for functions](../guide/iam.md).

## Troubleshooting MSK events

### `You must specify startingPositionTimestamp for function: ... when startingPosition is AT_TIMESTAMP.`

This happens when `startingPosition` is `AT_TIMESTAMP` without `startingPositionTimestamp`. Add the start time in Unix time seconds.

### `The "msk" event of function "..." has "provisionedPollers.min" (...) greater than "max" (...).`

This happens when `provisionedPollers.min` is larger than `provisionedPollers.max`. Lower `min` or raise `max`.

## Related

- [Self-managed Apache Kafka events](./kafka.md)
- [MSK settings in the serverless.yml reference](../guide/serverless.yml.md#msk)
- [Using Lambda with Amazon MSK](https://docs.aws.amazon.com/lambda/latest/dg/with-msk.html)
