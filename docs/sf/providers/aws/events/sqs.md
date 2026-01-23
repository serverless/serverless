<!--
title: Serverless Framework - AWS Lambda Events - SQS Queues
description: Setting up AWS SQS Queue Events with AWS Lambda via the Serverless Framework
short_title: AWS Lambda Events - SQS
keywords:
  [
    'Serverless',
    'Framework',
    'AWS',
    'Lambda',
    'Events',
    'AWS SQS Events',
    'Serverless AWS Lambda SQS',
    'AWS Lambda SQS Integration',
    'AWS Lambda Event Sources',
    'AWS SQS Lambda Trigger',
    'AWS SQS Queue',
  ]
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/aws/events/sqs)

<!-- DOCS-SITE-LINK:END -->

# SQS Queues

In the following example, we specify that the `compute` function should be triggered whenever there are messages in the given SQS Queue.

The ARN for the queue can be specified as a string, the reference to the ARN of a resource by logical ID, or the import of an ARN that was exported by a different service or CloudFormation stack.

**Note:** The `sqs` event will hook up your existing SQS Queue to a Lambda function. Serverless won't create a new queue for you.

```yml
functions:
  compute:
    handler: handler.compute
    events:
      # These are all possible formats
      - sqs: arn:aws:sqs:region:XXXXXX:MyFirstQueue
      - sqs:
          arn:
            Fn::GetAtt:
              - MySecondQueue
              - Arn
      - sqs:
          arn:
            Fn::ImportValue: MyExportedQueueArnId
      - sqs:
          arn:
            Fn::Join:
              - ':'
              - - arn
                - aws
                - sqs
                - Ref: AWS::Region
                - Ref: AWS::AccountId
                - MyOtherQueue
```

## Setting the BatchSize

For the SQS event integration, you can set the `batchSize`, which effects how many SQS messages can be included in a single Lambda invocation. The default `batchSize` is `10`. The max `batchSize` is `10000` for a standard queue, `10` for a FIFO queue.

You can also set `maximumBatchingWindow` to standard queues to specify the maximum amount of time in seconds to gather records before invoking the function. The max `maximumBatchingWindow` is `300` seconds.

You can set `functionResponseType` to `ReportBatchItemFailures` to let your function return a partial success result if one or more messages in the batch have failed.

Check [AWS documentation](https://docs.aws.amazon.com/lambda/latest/dg/with-sqs.html) for more details.

```yml
functions:
  compute:
    handler: handler.compute
    events:
      - sqs:
          arn: arn:aws:sqs:region:XXXXXX:myQueue
          batchSize: 10
          maximumBatchingWindow: 60
          functionResponseType: ReportBatchItemFailures
```

## Setting filter patterns

This configuration allows customers to filter event before lambda invocation. It accepts up to 5 filter patterns by default and up to 10 with quota extension. If one event matches at least 1 pattern, lambda will process it.

For more details and examples of filter patterns, please see the [AWS event filtering documentation](https://docs.aws.amazon.com/lambda/latest/dg/invocation-eventfiltering.html)

Note: Serverless only sets this property if you explicitly add it to the `sqs` configuration (see an example below). The following example will only process records where field `a` is equal to 1 or 2.

```yml
functions:
  onlyOneOrTwo:
    handler: handler.preprocess
    events:
      - sqs:
          arn: arn:aws:sqs:region:XXXXXX:myQueue
          filterPatterns:
            - a: [1, 2]
```

## Setting the Maximum Concurrency

The maximum concurrency setting limits the number of concurrent instances of the function that an Amazon SQS event source can invoke. The minimum limit of concurrent functions that the event source can invoke is `2`, and the maximum is `1000`. To turn off maximum concurrency, leave this field empty.

For more details, see the [AWS SQS max concurrency documentation](https://docs.aws.amazon.com/lambda/latest/dg/with-sqs.html#events-sqs-max-concurrency).

```yml
functions:
  onlyOneOrTwo:
    handler: handler.preprocess
    events:
      - sqs:
          arn: arn:aws:sqs:region:XXXXXX:myQueue
          maximumConcurrency: 250
```

## SQS Provisioned Mode

SQS Provisioned Mode provides dedicated polling resources for your Lambda functions, enabling 3x faster scaling and up to 10x higher concurrency compared to the default on-demand polling mode. This is ideal for high-throughput, latency-sensitive workloads.

### Configuration

Use the `provisioned` property to configure SQS Provisioned Mode:

```yml
functions:
  processor:
    handler: handler.process
    events:
      - sqs:
          arn: arn:aws:sqs:region:XXXXXX:myQueue
          provisioned:
            mode: PROVISIONED
            minimumPollers: 10
            maximumPollers: 100
```

### Properties

| Property | Type | Description | Required |
|----------|------|-------------|----------|
| `mode` | `PROVISIONED` \| `ON_DEMAND` | The polling mode. `PROVISIONED` uses dedicated resources; `ON_DEMAND` uses shared infrastructure (default AWS behavior). | No |
| `minimumPollers` | integer (1-200) | Minimum number of dedicated pollers. Only valid when `mode` is `PROVISIONED`. | No |
| `maximumPollers` | integer (1-2000) | Maximum number of pollers that can scale up to handle increased load. | No |

### Examples

#### High-throughput processing with provisioned pollers

```yml
functions:
  highThroughputProcessor:
    handler: handler.process
    events:
      - sqs:
          arn: arn:aws:sqs:region:XXXXXX:highVolumeQueue
          batchSize: 100
          maximumBatchingWindow: 5
          provisioned:
            mode: PROVISIONED
            minimumPollers: 50
            maximumPollers: 500
```

#### Switching to on-demand mode

```yml
functions:
  lowVolumeProcessor:
    handler: handler.process
    events:
      - sqs:
          arn: arn:aws:sqs:region:XXXXXX:lowVolumeQueue
          provisioned:
            mode: ON_DEMAND
```

#### Setting only maximum pollers (allows AWS to manage minimum)

```yml
functions:
  flexibleProcessor:
    handler: handler.process
    events:
      - sqs:
          arn: arn:aws:sqs:region:XXXXXX:flexQueue
          provisioned:
            maximumPollers: 200
```

### When to Use Provisioned Mode

- **High-throughput workloads**: When processing millions of messages per hour
- **Latency-sensitive applications**: When you need faster response to message bursts
- **Predictable scaling**: When you want guaranteed minimum polling capacity
- **Cost optimization**: When consistent, high-volume processing justifies dedicated resources

### Validation Rules

- `minimumPollers` can only be set when `mode` is `PROVISIONED` (or mode is not specified)
- `minimumPollers` must be less than or equal to `maximumPollers`
- `minimumPollers` range: 1-200
- `maximumPollers` range: 1-2000

For more details, see the [AWS Lambda SQS Provisioned Mode documentation](https://docs.aws.amazon.com/lambda/latest/dg/with-sqs.html).

## IAM Permissions

The Serverless Framework will automatically configure the most minimal set of IAM permissions for you. However you can still add additional permissions if you need to. Read the official [AWS documentation](https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/sqs-configure-lambda-function-trigger.html) for more information about IAM Permissions for SQS events.

## Deploying SQS queues

The examples above show how to consume messages from an existing SQS queue. To create an SQS queue in `serverless.yml`, you can either write custom CloudFormation, or you can use Lift.

[Lift](https://github.com/getlift/lift) is a Serverless Framework plugin that simplifies deploying pieces of applications via "[constructs](https://github.com/getlift/lift#constructs)". Lift can be installed via:

```
serverless plugin install -n serverless-lift
```

We can use the [`queue` construct](https://github.com/getlift/lift/blob/master/docs/queue.md) to deploy an SQS queue with its Lambda consumer:

```yaml
constructs:
  my-queue:
    type: queue
    worker:
      handler: handler.compute

plugins:
  - serverless-lift
```

The `queue` construct deploys:

- An SQS queue
- A `worker` Lambda function: this function processes messages sent to the queue.
- An SQS "[dead letter queue](https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/sqs-dead-letter-queues.html)": this queue stores all the messages that failed to be processed.

Read the [`queue` construct documentation](https://github.com/getlift/lift/blob/master/docs/queue.md) to find a complete example with code, and to learn how to configure the batch size, retries and other options.
