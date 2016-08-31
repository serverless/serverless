# Overview of event sources

Here's a list of all available event sources grouped by provider.

**Note:** This list will be updated constantly as we're adding more and more event sources in the future.
Just open up an [issue](https://github.com/serverless/serverless/issues) if you have any wishes regarding event support.

The examples will show you how you can use the different event definitions.

- [S3](#s3)
- [Schedule](#schedule)
- [HTTP endpoint](#http-endpoint)
- [SNS](#sns)
- [Kinesis Streams](#kinesis-streams)
- [DynamoDB Streams](#dynamodb-streams)

## Amazon Web Services (AWS)

### S3

#### Simple event definition

This will create a `photos` bucket which fires the `resize` function when an object is added or modified inside the bucket.

```yml
functions:
  resize:
    handler: resize
    events:
      - s3: photos
```

#### Extended event definition

This will create a bucket `photos`. The `users` function is called whenever an object is removed from the bucket.

```yml
functions:
  users:
    handler: users.handler
    events:
      - s3:
          bucket: photos
          event: s3:ObjectRemoved:*
```

### Schedule

#### Simple event definition

This will attach a schedule event and causes the function `crawl` to be called every 2 hours.

```yml
functions:
  crawl:
    handler: crawl
    events:
      - schedule: rate(2 hours)
```

#### Extended event definition

This will create and attach a schedule event for the `aggregate` function which is disabled. If enabled it will call
the `aggregate` function every 10 minutes.

```yml
functions:
  aggregate:
    handler: statistics.handler
    events:
      - schedule:
          rate: rate(10 minutes)
          enabled: false
```

### HTTP endpoint

#### Simple event definition

This will create a new HTTP endpoint which is accessible at `users/show` via a `GET` request. `show` will be called
whenever the endpoint is accessed.

```yml
functions:
  show:
    handler: users.show
    events:
      - http: GET users/show
```

#### Extended event definition

This will create a new HTTP endpoint which is accessible at `posts/create` with the help of the HTTP `POST` method.
The function `create` is called every time someone visits this endpoint.

```yml
functions:
  create:
    handler: posts.create
    events:
      - http:
          path: posts/create
          method: POST
```

See more in-depth configuration for the HTTP event [here](/lib/plugins/aws/deploy/compile/events/apiGateway/README.md).

### SNS

#### Simple event definition

Here we create a new SNS topic with the name `dispatch` which is bound to the `dispatcher` function. The function will be
called every time a message is sent to the `dispatch` topic.

```yml
functions:
  dispatcher:
    handler: dispatcher.dispatch
    events:
      - sns: dispatch
```
Or if you have a pre-existing topic ARN, you can just provide the topic ARN instead:

```yml
functions:
  dispatcher:
    handler: dispatcher.dispatch
    events:
      - sns: topic:arn:xxx
```

Just make sure your topic is already subscribed to the function, as there's no way to add subscriptions to pre-existing topics in CF. The framework will just give permission to SNS to invoke the function.

#### Extended event definition

This event definition ensures that the `aggregator` function get's called every time a message is sent to the
`aggregate` topic. `Data aggregation pipeline` will be shown in the AWS console so that the user can understand what the
SNS topic is used for.

```yml
functions:
  aggregator:
    handler: aggregator.handler
    events:
      - sns:
          topicName: aggregate
          displayName: Data aggregation pipeline
```

### Kinesis Streams

Currently there's no native support for Kinesis Streams ([we need your feedback](https://github.com/serverless/serverless/issues/1608))
but you can use custom provider resources to setup the mapping.

**Note:** You can also create the stream in the `resources.Resources` section and use `Fn::GetAtt` to reference the `Arn`
in the mappings `EventSourceArn` definition.

```yml
# serverless.yml

resources:
  Resources:
    mapping:
      Type: AWS::Lambda::EventSourceMapping
      Properties:
        BatchSize: 10
        EventSourceArn: "arn:aws:kinesis:<region>:<aws-account-id>:stream/<stream-name>"
        FunctionName:
          Fn::GetAtt:
            - "<function-name>"
            - "Arn"
        StartingPosition: "TRIM_HORIZON"
```

### DynamoDB Streams

Currently there's no native support for DynamoDB Streams ([we need your feedback](https://github.com/serverless/serverless/issues/1441))
but you can use custom provider resources to setup the mapping.

**Note:** You can also create the table in the `resources.Resources` section and use `Fn::GetAtt` to reference the `StreamArn`
in the mappings `EventSourceArn` definition.

```yml
# serverless.yml

resources:
  Resources:
    mapping:
      Type: AWS::Lambda::EventSourceMapping
      Properties:
        BatchSize: 10
        EventSourceArn: "arn:aws:dynamodb:<region>:<aws-account-id>:table/<table-name>/stream/<stream-name>"
        FunctionName:
          Fn::GetAtt:
            - "<function-name>"
            - "Arn"
        StartingPosition: "TRIM_HORIZON"
```
