<!--
title: Serverless Framework - AWS Lambda Events - SQS Queues
menuText: SQS
menuOrder: 6
description:  Setting up AWS SQS Queue Events with AWS Lambda via the Serverless Framework
layout: Doc
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->
### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/aws/events/sqs)
<!-- DOCS-SITE-LINK:END -->

# SQS Queues

In the following example, we specify that the `compute` function should be triggered whenever there are messages in the given SQS Queue.

The ARN for the queue can be specified as a string, the reference to the ARN of a resource by logical ID, or the import of an ARN that was exported by a different service or CloudFormation stack.

**Note:** The `sqs` event will hook up your existing SQS Queue to a Lambda function. Serverless won't create a new queue for you.

**IMPORTANT:** AWS is [not supporting FIFO queue](https://docs.aws.amazon.com/lambda/latest/dg/with-sqs.html) to trigger Lambda function so your queue(s) **must be** a standard queue.

```yml
functions:
  compute:
    handler: handler.compute
    events:
      - sqs: arn:aws:sqs:region:XXXXXX:MyFirstQueue
      - sqs:
          arn:
            Fn::GetAtt:
              - MySecondQueue
              - Arn
      - sqs:
          arn:
            Fn::ImportValue: MyExportedQueueArnId
```

## Setting the BatchSize

For the SQS event integration, you can set the `batchSize`, which effects how many SQS messages will be included in a single Lambda invocation. The default `batchSize` is 10, and the max `batchSize` is 10.

```yml
functions:
  preprocess:
    handler: handler.preprocess
    events:
      - sqs:
          arn: arn:aws:sqs:region:XXXXXX:myQueue
          batchSize: 10
```
