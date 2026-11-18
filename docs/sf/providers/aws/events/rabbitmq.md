<!--
title: Amazon MQ for RabbitMQ Events
description: 'Trigger a Lambda function from an Amazon MQ for RabbitMQ queue with the rabbitmq event: broker credentials, virtual hosts, batching and filters.'
short_title: RabbitMQ
keywords:
  [
    'Serverless Framework',
    'AWS Lambda RabbitMQ trigger',
    'Amazon MQ for RabbitMQ',
    'Amazon MQ event source mapping',
  ]
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/aws/events/rabbitmq)

<!-- DOCS-SITE-LINK:END -->

# Amazon MQ for RabbitMQ Events

The `rabbitmq` event triggers a Lambda function with messages from a queue on an Amazon MQ for RabbitMQ broker. The Framework creates a Lambda event source mapping: Lambda reads the queue, invokes the function with batches of messages, and acknowledges them after the function succeeds. The `rabbitmq` event connects to an existing broker and queue in the same AWS account; for an Amazon MQ for ActiveMQ broker, use the [`activemq` event](./activemq.md).

The `rabbitmq` event requires the broker's `arn`, the `queue` and `basicAuthArn`, the ARN of an AWS Secrets Manager secret that holds the broker user's sign-in credentials. This `serverless.yml` consumes the `orders` queue:

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
      - rabbitmq:
          arn: arn:aws:mq:us-east-1:123456789012:broker:ExampleMQBroker:b-1234a5b6-78cd-901e-2fgh-3i45j6k178l9
          queue: orders
          basicAuthArn: arn:aws:secretsmanager:us-east-1:123456789012:secret:MyBrokerSecret-AbCdEf
```

The handler receives the messages grouped by queue in `event.rmqMessagesByQueue`, under keys of the form `<queue>::<virtual host>`, each with its body in `data` as a base64-encoded string:

```javascript
// handler.mjs
export const compute = async (event) => {
  for (const messages of Object.values(event.rmqMessagesByQueue)) {
    for (const message of messages) {
      const body = Buffer.from(message.data, 'base64').toString('utf8')
      console.log(message.redelivered, body)
    }
  }
}
```

Lambda must reach the broker: either it has a public endpoint, or Lambda needs network access to the broker's VPC; see [Configure network security](https://docs.aws.amazon.com/lambda/latest/dg/process-mq-messages-with-lambda.html#process-mq-messages-with-lambda-networkconfiguration).

## rabbitmq event options

The `rabbitmq` event accepts these keys:

| Key                     | Type                                                   | Default   | Description                                                     |
| ----------------------- | ------------------------------------------------------ | --------- | --------------------------------------------------------------- |
| `arn`                   | broker ARN, `Ref` or `Fn::ImportValue`                 | Required  | The Amazon MQ broker                                            |
| `queue`                 | string                                                 | Required  | The queue to consume; one queue per event                       |
| `basicAuthArn`          | Secrets Manager secret ARN, `Ref` or `Fn::ImportValue` | Required  | The secret with the broker credentials                          |
| `virtualHost`           | string                                                 | Not set   | The virtual host that contains the queue                        |
| `batchSize`             | number, `1`–`10000`                                    | `100`     | The largest number of messages in one invocation                |
| `maximumBatchingWindow` | number, `0`–`300` seconds                              | 500 ms    | How long Lambda gathers messages before it invokes the function |
| `filterPatterns`        | list of 1–10 patterns                                  | No filter | Patterns a message must match to reach the function             |
| `enabled`               | boolean                                                | `true`    | Whether Lambda reads the queue                                  |

The broker ARN has the form `arn:aws:mq:<region>:<account>:broker:<name>:<broker id>`.

## Virtual host

When the queue is in a virtual host other than the broker's default, set the `rabbitmq` event's `virtualHost` to the virtual host's name:

```yaml
functions:
  compute:
    handler: handler.compute
    events:
      - rabbitmq:
          arn: arn:aws:mq:us-east-1:123456789012:broker:ExampleMQBroker:b-1234a5b6-78cd-901e-2fgh-3i45j6k178l9
          queue: orders
          virtualHost: sales
          basicAuthArn: arn:aws:secretsmanager:us-east-1:123456789012:secret:MyBrokerSecret-AbCdEf
```

## Batch size and batching window

The `rabbitmq` event's `batchSize` sets the largest number of messages in one invocation, and `maximumBatchingWindow` sets how many seconds Lambda gathers messages before it invokes the function:

```yaml
functions:
  compute:
    handler: handler.compute
    events:
      - rabbitmq:
          arn: arn:aws:mq:us-east-1:123456789012:broker:ExampleMQBroker:b-1234a5b6-78cd-901e-2fgh-3i45j6k178l9
          queue: orders
          basicAuthArn: arn:aws:secretsmanager:us-east-1:123456789012:secret:MyBrokerSecret-AbCdEf
          batchSize: 5000
          maximumBatchingWindow: 30
```

- `batchSize`: `1` to `10000`; AWS uses `100` when it isn't set.
- `maximumBatchingWindow`: `1` to `300` seconds. When it isn't set, AWS uses a 500 ms window. The Framework doesn't pass `0`, so `0` also leaves the 500 ms default in place.

Lambda invokes the function when the batch is full, when the window ends, or when the batch reaches the 6 MB payload limit, whichever comes first. See [Batching behavior](https://docs.aws.amazon.com/lambda/latest/dg/invocation-eventsourcemapping.html#invocation-eventsourcemapping-batching).

## Filter patterns

The `rabbitmq` event's `filterPatterns` passes only the messages that match at least one pattern. Amazon MQ event source mappings filter on the `data` key, which holds the message body; a pattern on body fields matches only bodies that are valid JSON. This example passes only messages whose field `a` is `1` or `2`:

```yaml
functions:
  compute:
    handler: handler.compute
    events:
      - rabbitmq:
          arn: arn:aws:mq:us-east-1:123456789012:broker:ExampleMQBroker:b-1234a5b6-78cd-901e-2fgh-3i45j6k178l9
          queue: orders
          basicAuthArn: arn:aws:secretsmanager:us-east-1:123456789012:secret:MyBrokerSecret-AbCdEf
          filterPatterns:
            - data:
                a: [1, 2]
```

- Lambda acknowledges messages that match no pattern without invoking the function, so they leave the queue.
- AWS allows 5 patterns per event source mapping by default, and up to 10 with a quota increase; the Framework accepts up to 10.

For the pattern syntax, see [Event filtering with Amazon MQ event sources](https://docs.aws.amazon.com/lambda/latest/dg/with-mq-filtering.html).

## Concurrency

Lambda runs at most one execution environment at a time for each `rabbitmq` event source mapping. Reserved or provisioned concurrency on the function doesn't raise this limit; to raise it, contact AWS Support with the event source mapping's UUID and Region. See [Using Lambda with Amazon MQ](https://docs.aws.amazon.com/lambda/latest/dg/with-mq.html#services-mq-configure).

## Disable the event source mapping

To stop Lambda from reading the queue without removing the mapping, set the `rabbitmq` event's `enabled: false`:

```yaml
functions:
  compute:
    handler: handler.compute
    events:
      - rabbitmq:
          arn: arn:aws:mq:us-east-1:123456789012:broker:ExampleMQBroker:b-1234a5b6-78cd-901e-2fgh-3i45j6k178l9
          queue: orders
          basicAuthArn: arn:aws:secretsmanager:us-east-1:123456789012:secret:MyBrokerSecret-AbCdEf
          enabled: false
```

## IAM permissions for RabbitMQ events

For `rabbitmq` events, the Framework adds these permissions to the function's execution role:

- `secretsmanager:GetSecretValue` on each `basicAuthArn` secret.
- `mq:DescribeBroker` on each broker.
- `ec2:CreateNetworkInterface`, `ec2:DescribeNetworkInterfaces`, `ec2:DescribeVpcs`, `ec2:DeleteNetworkInterface`, `ec2:DescribeSubnets` and `ec2:DescribeSecurityGroups`.

When the secret is encrypted with a customer managed KMS key, add `kms:Decrypt` on that key yourself:

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

See [Using Lambda with Amazon MQ](https://docs.aws.amazon.com/lambda/latest/dg/process-mq-messages-with-lambda.html) and [IAM permissions for functions](../guide/iam.md).

## Related

- [Amazon MQ for ActiveMQ events](./activemq.md)
- [RabbitMQ settings in the serverless.yml reference](../guide/serverless.yml.md#rabbitmq)
- [How Lambda processes Amazon MQ messages](https://docs.aws.amazon.com/lambda/latest/dg/with-mq.html)
