<!--
title: Self-Managed Apache Kafka Events
description: 'Trigger a Lambda function from a self-managed Apache Kafka topic with the kafka event: authentication, VPC access, batching, filters and provisioned mode.'
short_title: Kafka
keywords:
  [
    'Serverless Framework',
    'AWS Lambda Kafka trigger',
    'self-managed Apache Kafka',
    'Kafka event source mapping',
    'SASL/SCRAM',
    'mTLS',
  ]
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/aws/events/kafka)

<!-- DOCS-SITE-LINK:END -->

# Self-Managed Apache Kafka Events

The `kafka` event triggers a Lambda function with records from a topic on a self-managed Apache Kafka cluster: a cluster you run yourself or with a provider other than Amazon MSK. The Framework creates a Lambda event source mapping: Lambda polls the topic, invokes the function with batches of records, and commits the offsets. The `kafka` event connects to an existing cluster and topic; for an Amazon MSK cluster, use the [`msk` event](./msk.md).

The `kafka` event requires `accessConfigurations`, `bootstrapServers` and `topic`. This `serverless.yml` consumes the `orders` topic, authenticating with SASL/SCRAM credentials stored in AWS Secrets Manager:

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
      - kafka:
          accessConfigurations:
            saslScram512Auth: arn:aws:secretsmanager:us-east-1:123456789012:secret:MyBrokerSecret
          bootstrapServers:
            - broker1.example.com:9092
            - broker2.example.com:9092
          topic: orders
```

The handler receives the records grouped by topic and partition in `event.records`, each with its message in `value` as a base64-encoded string:

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

Lambda must reach the brokers: either they have public endpoints, or you give the event source mapping access to the cluster's VPC (see [VPC access](#vpc-access)).

## kafka event options

The `kafka` event accepts these keys:

| Key                         | Type                                       | Default                      | Description                                                    |
| --------------------------- | ------------------------------------------ | ---------------------------- | -------------------------------------------------------------- |
| `accessConfigurations`      | object                                     | Required                     | Authentication and VPC settings; at least one key              |
| `bootstrapServers`          | list of `host:port` strings                | Required                     | The cluster's bootstrap brokers                                |
| `topic`                     | string                                     | Required                     | The topic to consume                                           |
| `consumerGroupId`           | string, up to 200 characters               | Not set                      | The Kafka consumer group to join                               |
| `startingPosition`          | `TRIM_HORIZON`, `LATEST` or `AT_TIMESTAMP` | `TRIM_HORIZON`               | Where Lambda starts reading                                    |
| `startingPositionTimestamp` | number, Unix time in seconds               | Required with `AT_TIMESTAMP` | The time to start reading from                                 |
| `batchSize`                 | number, `1`–`10000`                        | `100`                        | The largest number of records in one invocation                |
| `maximumBatchingWindow`     | number, `0`–`300` seconds                  | 500 ms                       | How long Lambda gathers records before it invokes the function |
| `filterPatterns`            | list of 1–10 patterns                      | No filter                    | Patterns a record must match to reach the function             |
| `enabled`                   | boolean                                    | `true`                       | Whether Lambda polls the topic                                 |
| `provisionedPollers`        | object, or `false`                         | Not set: on-demand mode      | Provisioned mode settings                                      |

## Authentication

The `kafka` event's `accessConfigurations` holds the authentication method and, optionally, VPC access. Each authentication key takes the ARN of a Secrets Manager secret (one value or a list):

| Key                        | Authentication                  | Secret contents                                                                                      |
| -------------------------- | ------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `saslScram512Auth`         | SASL/SCRAM with SHA-512         | The username and password                                                                            |
| `saslScram256Auth`         | SASL/SCRAM with SHA-256         | The username and password                                                                            |
| `saslPlainAuth`            | SASL/PLAIN, over TLS            | The username and password                                                                            |
| `clientCertificateTlsAuth` | Mutual TLS                      | `certificate` (PEM chain) and `privateKey` (PKCS #8), plus `privateKeyPassword` for an encrypted key |
| `serverRootCaCertificate`  | Server certificate verification | `certificate`: the root CA certificate that signed the brokers' certificates                         |

The secret ARNs must have the form `arn:aws:secretsmanager:<region>:<account>:secret:<name>`. For the secret formats, see [Configuring cluster authentication methods](https://docs.aws.amazon.com/lambda/latest/dg/kafka-cluster-auth.html).

### SASL/SCRAM and SASL/PLAIN

To authenticate with a username and password, store them in a Secrets Manager secret and set the key that matches the cluster's mechanism. The example at the top of this page uses `saslScram512Auth`. Lambda supports SASL/SCRAM over TLS only, and SASL/PLAIN needs a TLS connection to protect the clear-text credentials.

### Mutual TLS

To authenticate with a client certificate, set `clientCertificateTlsAuth`. When the brokers' certificates are signed by a private CA, also set `serverRootCaCertificate`:

```yaml
functions:
  compute:
    handler: handler.compute
    events:
      - kafka:
          accessConfigurations:
            clientCertificateTlsAuth: arn:aws:secretsmanager:us-east-1:123456789012:secret:ClientCertificate
            serverRootCaCertificate: arn:aws:secretsmanager:us-east-1:123456789012:secret:ServerRootCa
          bootstrapServers:
            - broker1.example.com:9093
          topic: orders
```

### VPC access

When the brokers are in a VPC, set the `kafka` event's `vpcSubnet` and `vpcSecurityGroup` in `accessConfigurations`, together. Each takes an ID or a list of IDs, without the `subnet:` or `security_group:` prefix that the AWS API uses:

```yaml
functions:
  compute:
    handler: handler.compute
    events:
      - kafka:
          accessConfigurations:
            saslScram512Auth: arn:aws:secretsmanager:us-east-1:123456789012:secret:MyBrokerSecret
            vpcSubnet:
              - subnet-0011001100
              - subnet-0022002200
            vpcSecurityGroup: sg-0123456789
          bootstrapServers:
            - broker1.internal.example.com:9092
          topic: orders
```

Lambda creates network interfaces in these subnets to reach the brokers, so the security group must allow traffic to the brokers' ports. In the default on-demand mode, the event source mapping also needs AWS PrivateLink VPC endpoints for Lambda, AWS STS and, with secrets, Secrets Manager, or a NAT gateway; provisioned mode doesn't. See [Configuring self-managed Apache Kafka cluster network access](https://docs.aws.amazon.com/lambda/latest/dg/with-kafka-cluster-network.html).

## Starting position and consumer group

The `kafka` event's `startingPosition` sets where a new event source mapping starts reading:

- `TRIM_HORIZON` (the default): the oldest record in the topic.
- `LATEST`: just after the newest record. Lambda can miss records written while it creates or updates the mapping.
- `AT_TIMESTAMP`: the position at the time in `startingPositionTimestamp`, in Unix time seconds.

```yaml
functions:
  compute:
    handler: handler.compute
    events:
      - kafka:
          accessConfigurations:
            saslScram512Auth: arn:aws:secretsmanager:us-east-1:123456789012:secret:MyBrokerSecret
          bootstrapServers:
            - broker1.example.com:9092
          topic: orders
          consumerGroupId: orders-processor
          startingPosition: AT_TIMESTAMP
          startingPositionTimestamp: 1767225600
```

The `kafka` event's `consumerGroupId` sets the Kafka consumer group that Lambda joins:

- It must be unique among your Kafka event sources, and it can't be changed after the event source mapping is created.
- If the group already exists in the cluster, Lambda starts from the group's committed offsets and ignores `startingPosition`.
- Other active consumers in the group receive part of the topic's records, and Lambda receives the rest.

See [Customizable consumer group ID](https://docs.aws.amazon.com/lambda/latest/dg/kafka-consumer-group-id.html) and [Starting positions](https://docs.aws.amazon.com/lambda/latest/dg/kafka-starting-positions.html).

## Batch size and batching window

The `kafka` event's `batchSize` sets the largest number of records in one invocation, and `maximumBatchingWindow` sets how many seconds Lambda gathers records before it invokes the function:

```yaml
functions:
  compute:
    handler: handler.compute
    events:
      - kafka:
          accessConfigurations:
            saslScram512Auth: arn:aws:secretsmanager:us-east-1:123456789012:secret:MyBrokerSecret
          bootstrapServers:
            - broker1.example.com:9092
          topic: orders
          batchSize: 1000
          maximumBatchingWindow: 30
```

- `batchSize`: `1` to `10000`; AWS uses `100` when it isn't set.
- `maximumBatchingWindow`: `1` to `300` seconds. When it isn't set, AWS uses a 500 ms window. The Framework doesn't pass `0`, so `0` also leaves the 500 ms default in place.

Lambda invokes the function when the batch is full, when the window ends, or when the batch reaches the 6 MB payload limit, whichever comes first. See [Batching behavior](https://docs.aws.amazon.com/lambda/latest/dg/invocation-eventsourcemapping.html#invocation-eventsourcemapping-batching).

## Filter patterns

The `kafka` event's `filterPatterns` passes only the records that match at least one pattern. Kafka event source mappings filter on the `value` key, which holds the message; a pattern on message fields matches only messages that are valid JSON. This example passes only messages whose `eventName` is `INSERT`:

```yaml
functions:
  compute:
    handler: handler.compute
    events:
      - kafka:
          accessConfigurations:
            saslScram512Auth: arn:aws:secretsmanager:us-east-1:123456789012:secret:MyBrokerSecret
          bootstrapServers:
            - broker1.example.com:9092
          topic: orders
          filterPatterns:
            - value:
                eventName:
                  - INSERT
```

- Lambda drops records that match no pattern and commits their offsets, so the function never receives them.
- AWS allows 5 patterns per event source mapping by default, and up to 10 with a quota increase; the Framework accepts up to 10.

For the pattern syntax, see [Event filtering with Kafka event sources](https://docs.aws.amazon.com/lambda/latest/dg/kafka-filtering.html).

## Provisioned mode

Provisioned mode gives the event source mapping a dedicated pool of event pollers between a minimum and a maximum, for consistent low-latency processing. To use it, set the `kafka` event's `provisionedPollers`:

```yaml
functions:
  compute:
    handler: handler.compute
    events:
      - kafka:
          accessConfigurations:
            saslScram512Auth: arn:aws:secretsmanager:us-east-1:123456789012:secret:MyBrokerSecret
          bootstrapServers:
            - broker1.example.com:9092
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

To stop Lambda from polling the topic without removing the mapping, set the `kafka` event's `enabled: false`. Setting it back to `true` resumes from the committed offsets:

```yaml
functions:
  compute:
    handler: handler.compute
    events:
      - kafka:
          accessConfigurations:
            saslScram512Auth: arn:aws:secretsmanager:us-east-1:123456789012:secret:MyBrokerSecret
          bootstrapServers:
            - broker1.example.com:9092
          topic: orders
          enabled: false
```

## IAM permissions for Kafka events

For `kafka` events, the Framework adds these permissions to the function's execution role:

- `secretsmanager:GetSecretValue` on each secret in `accessConfigurations`.
- With `vpcSubnet` and `vpcSecurityGroup`: `ec2:CreateNetworkInterface`, `ec2:DescribeNetworkInterfaces`, `ec2:DescribeVpcs`, `ec2:DeleteNetworkInterface`, `ec2:DescribeSubnets` and `ec2:DescribeSecurityGroups`.

When a secret is encrypted with a customer managed KMS key, add `kms:Decrypt` on that key yourself:

```yaml
provider:
  name: aws
  runtime: nodejs24.x
  iam:
    role:
      statements:
        - Effect: Allow
          Action: kms:Decrypt
          Resource: arn:aws:kms:us-east-1:123456789012:key/1234abcd-12ab-34cd-56ef-1234567890ab
```

See [Lambda execution role permissions for Kafka](https://docs.aws.amazon.com/lambda/latest/dg/with-kafka-permissions.html) and [IAM permissions for functions](../guide/iam.md).

## Troubleshooting Kafka events

### `You must specify at least one "vpcSecurityGroup" accessConfiguration for function: ...`

This happens when `accessConfigurations` has `vpcSubnet` without `vpcSecurityGroup`; the message names `vpcSubnet` for the opposite case. Set both keys.

### `You must specify startingPositionTimestamp for function: ... when startingPosition is AT_TIMESTAMP.`

This happens when `startingPosition` is `AT_TIMESTAMP` without `startingPositionTimestamp`. Add the start time in Unix time seconds.

### `The "kafka" event of function "..." has "provisionedPollers.min" (...) greater than "max" (...).`

This happens when `provisionedPollers.min` is larger than `provisionedPollers.max`. Lower `min` or raise `max`.

## Related

- [Amazon MSK events](./msk.md)
- [Kafka settings in the serverless.yml reference](../guide/serverless.yml.md#kafka)
- [Using Lambda with self-managed Apache Kafka](https://docs.aws.amazon.com/lambda/latest/dg/with-kafka.html)
