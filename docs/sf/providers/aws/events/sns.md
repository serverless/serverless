<!--
title: SNS Topic Events
description: 'Trigger a Lambda function from an Amazon SNS topic with the sns event: new or existing topics, filter policies, encryption and dead-letter queues.'
short_title: SNS
keywords:
  [
    'Serverless Framework',
    'AWS Lambda SNS trigger',
    'SNS subscription',
    'SNS filter policy',
    'SNS dead-letter queue',
  ]
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/aws/events/sns)

<!-- DOCS-SITE-LINK:END -->

# SNS Topic Events

The `sns` event subscribes a Lambda function to an Amazon SNS topic, so every message published to the topic invokes the function. Given a topic name, the Framework creates the topic; given a topic ARN, it subscribes the function to the existing topic. In both cases it adds the Lambda permission that lets SNS invoke the function.

This `serverless.yml` creates a topic named `dispatch` and subscribes the `dispatcher` function to it:

```yaml
# serverless.yml
service: my-service

provider:
  name: aws
  runtime: nodejs24.x

functions:
  dispatcher:
    handler: handler.dispatch
    events:
      - sns: dispatch
```

Each SNS message arrives in `event.Records`, with the message text in `Sns.Message`:

```javascript
// handler.mjs
export const dispatch = async (event) => {
  for (const record of event.Records) {
    console.log(record.Sns.Subject, record.Sns.Message)
  }
}
```

A topic name has 1 to 256 letters, digits, hyphens and underscores. The Framework names the topic's CloudFormation resource `SNSTopic` followed by the topic name without non-alphanumeric characters (`SNSTopicDispatch`), so other resources can reference it with `!Ref SNSTopicDispatch`. Several functions can list the same topic name: the Framework creates the topic once and subscribes each function.

## Subscribe to an existing topic

To subscribe to a topic that already exists, give its ARN as the `sns` event, or as the `arn` key of the object form:

```yaml
functions:
  dispatcher:
    handler: handler.dispatch
    events:
      - sns: arn:aws:sns:us-east-1:123456789012:orders
      - sns:
          arn: arn:aws:sns:us-east-1:123456789012:payments
```

The Framework creates an `AWS::SNS::Subscription` and an `AWS::Lambda::Permission` for each event, and leaves the topic unchanged.

The `arn` key also takes CloudFormation intrinsic functions, such as `Ref`, `Fn::GetAtt`, `Fn::ImportValue` or `Fn::Join`. With an intrinsic function, set `topicName` too: the Framework uses it to name the subscription and permission resources, and stops packaging without it:

```text
Missing "sns.topicName" setting (it needs to be provided if "sns.arn" is not provided as plain ARN string)
```

For a topic declared in the same service's `resources`, reference it with `Ref` so CloudFormation creates the topic before the subscription:

```yaml
functions:
  dispatcher:
    handler: handler.dispatch
    events:
      - sns:
          arn: !Ref SuperTopic
          topicName: MyCustomTopic

resources:
  Resources:
    SuperTopic:
      Type: AWS::SNS::Topic
      Properties:
        TopicName: MyCustomTopic
```

An ARN built as a string, for example with `Fn::Join`, carries no dependency on the topic resource, so use it only for topics that exist before the deploy.

### Topics in another Region or account

When `arn` is a literal ARN string in the object form, the Framework sets the subscription's Region to the Region in the ARN, so the function can subscribe to a topic in another Region. The string form (`sns: arn:...`) and intrinsic functions subscribe in the service's Region.

A topic in another AWS account needs a topic policy that lets the function's account subscribe; see [Using Lambda with Amazon SNS](https://docs.aws.amazon.com/lambda/latest/dg/with-sns.html).

To subscribe one function to topics with the same name in several Regions or accounts, give each event a different `topicName`. Without an intrinsic function, `topicName` is optional and defaults to the last segment of the ARN; it only names the CloudFormation resources, so distinct values keep their logical IDs apart:

```yaml
functions:
  hello:
    handler: handler.run
    events:
      - sns:
          arn: arn:aws:sns:us-east-1:123456789012:topicname
          topicName: topicname-account-1-us-east-1
      - sns:
          arn: arn:aws:sns:us-east-1:111122223333:topicname
          topicName: topicname-account-2-us-east-1
```

## Topic display name and encryption

For a topic the Framework creates, the `sns` event's `displayName` sets the topic's display name, and `kmsMasterKeyId` encrypts the topic with an AWS KMS key:

```yaml
functions:
  aggregator:
    handler: handler.aggregate
    events:
      - sns:
          topicName: aggregate
          displayName: Data aggregation pipeline
          kmsMasterKeyId: alias/aws/sns
```

- `displayName`: the display name SNS uses for SMS subscriptions, up to 100 characters.
- `kmsMasterKeyId`: a key alias (`alias/aws/sns` for the AWS managed SNS key, or `alias/my-sns-key`), a key ID, a key ARN such as `arn:aws:kms:us-east-1:123456789012:key/12345678-9abc-def0-1234-56789abcdef1`, or a CloudFormation intrinsic function such as `!Ref MyKmsKey`.
- Both keys apply only to topics the Framework creates from `topicName`; they don't change a topic referenced by `arn`. When several events create the same topic, the topic takes both values from the first of those events.

To encrypt with a key declared in the same service, reference it with `Ref`:

```yaml
functions:
  dispatcher:
    handler: handler.dispatch
    events:
      - sns:
          topicName: dispatcher
          kmsMasterKeyId: !Ref MyKmsKey

resources:
  Resources:
    MyKmsKey:
      Type: AWS::KMS::Key
      Properties:
        KeyPolicy:
          Version: '2012-10-17'
          Statement:
            - Effect: Allow
              Principal:
                AWS: !Sub arn:aws:iam::${AWS::AccountId}:root
              Action: kms:*
              Resource: '*'
```

## Filter policies

The `sns` event's `filterPolicy` sets a subscription filter policy, so the function receives only the messages that match it. This subscription receives messages whose `pet` message attribute is `dog` or `cat`:

```yaml
functions:
  pets:
    handler: handler.pets
    events:
      - sns:
          topicName: pets
          filterPolicy:
            pet:
              - dog
              - cat
```

The `sns` event's `filterPolicyScope` chooses what the policy matches:

- `MessageAttributes` (the default): the message attributes.
- `MessageBody`: the fields of a JSON message body.

This subscription matches messages whose JSON body has `pet` equal to `dog` or `cat`:

```yaml
functions:
  pets:
    handler: handler.pets
    events:
      - sns:
          topicName: pets
          filterPolicyScope: MessageBody
          filterPolicy:
            pet:
              - dog
              - cat
```

Set `filterPolicyScope` together with `filterPolicy`: on a topic the Framework creates, `filterPolicyScope` without `filterPolicy` has no effect. For the policy syntax, see [Amazon SNS message filtering](https://docs.aws.amazon.com/sns/latest/dg/sns-message-filtering.html) and [Amazon SNS subscription filter policies](https://docs.aws.amazon.com/sns/latest/dg/sns-subscription-filter-policies.html).

## Setting a redrive policy

A redrive policy sends the messages that SNS can't deliver to the function to an SQS dead-letter queue. SNS moves a message there after a client-side error, such as a missing permission, or after a server-side error persists through its delivery retries. Without a redrive policy, SNS discards those messages.

The `sns` event's `redrivePolicy` takes exactly one of three keys. `deadLetterTargetArn` takes the queue ARN:

```yaml
functions:
  dispatcher:
    handler: handler.dispatch
    events:
      - sns:
          topicName: dispatcher
          redrivePolicy:
            deadLetterTargetArn: arn:aws:sqs:us-east-1:123456789012:myDLQ
```

`deadLetterTargetRef` takes the logical ID of a queue declared in the same service's `resources`:

```yaml
functions:
  dispatcher:
    handler: handler.dispatch
    events:
      - sns:
          topicName: dispatcher
          redrivePolicy:
            deadLetterTargetRef: myDLQ

resources:
  Resources:
    myDLQ:
      Type: AWS::SQS::Queue
      Properties:
        QueueName: myDLQ
```

`deadLetterTargetImport` takes the names of two CloudFormation exports of another stack, one for the queue ARN and one for the queue URL:

```yaml
functions:
  dispatcher:
    handler: handler.dispatch
    events:
      - sns:
          topicName: dispatcher
          redrivePolicy:
            deadLetterTargetImport:
              arn: MyShared-DLQArn
              url: MyShared-DLQUrl
```

The configuration schema expects `deadLetterTargetImport.arn` to start with `arn:`, so an export name is reported as a configuration warning, or as an error with `configValidationMode: error`.

The dead-letter queue must be an SQS queue in the same AWS account and Region as the subscription. The Framework adds an `AWS::SQS::QueuePolicy` that lets SNS send messages to the queue. A queue encrypted with AWS KMS needs a customer managed key whose key policy lets the SNS service principal use it. See [Amazon SNS dead-letter queues](https://docs.aws.amazon.com/sns/latest/dg/sns-dead-letter-queues.html).

## `sns` event options

The `sns` event takes a topic name, a topic ARN, or an object with these keys. The object needs `arn` or `topicName`:

| Key                 | Type                    | Default                                                   | Allowed values                                                                                                                                  |
| ------------------- | ----------------------- | --------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `arn`               | ARN string or intrinsic | Not set: the Framework creates the topic from `topicName` | An SNS topic ARN, or an intrinsic function (`Ref`, `Fn::GetAtt`, `Fn::ImportValue`, `Fn::Join`, `Fn::Sub`) that resolves to one                 |
| `topicName`         | String                  | With a literal `arn`, the last segment of the ARN         | 1 to 256 letters, digits, `-` and `_`; required with an intrinsic `arn`                                                                         |
| `displayName`       | String                  | Not set                                                   | Up to 100 characters; topics the Framework creates only                                                                                         |
| `kmsMasterKeyId`    | String or intrinsic     | Not set (no encryption)                                   | Key alias (`alias/...`), key ID, key ARN or intrinsic; topics the Framework creates only                                                        |
| `filterPolicy`      | Object                  | Not set                                                   | An SNS filter policy                                                                                                                            |
| `filterPolicyScope` | String                  | `MessageAttributes`                                       | `MessageAttributes`, `MessageBody`                                                                                                              |
| `redrivePolicy`     | Object                  | Not set                                                   | Exactly one of `deadLetterTargetArn` (queue ARN), `deadLetterTargetRef` (logical ID) or `deadLetterTargetImport` (`arn` and `url` export names) |

## Permissions for SNS events

For each `sns` event, the Framework adds an `AWS::Lambda::Permission` that lets `sns.amazonaws.com` invoke the function, limited to the topic's ARN. The function needs no IAM permission to receive messages. To publish to the topic from a function, add `sns:Publish` on the topic to the execution role; see [IAM permissions](../guide/iam.md).

## Related

- [SQS queue events](./sqs.md), to process messages from a queue subscribed to the topic
- [EventBridge events](./event-bridge.md), for content-based routing between services
- [`serverless.yml` reference: SNS](../guide/serverless.yml.md#sns)
- [Using Lambda with Amazon SNS](https://docs.aws.amazon.com/lambda/latest/dg/with-sns.html)
