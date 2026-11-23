<!--
title: API Gateway Service Proxies
description: Connect an API Gateway REST API route straight to Kinesis, SQS, S3, SNS, DynamoDB or EventBridge, with no Lambda function in between.
short_title: API Gateway Service Proxies
keywords:
  [
    'Serverless Framework',
    'API Gateway AWS service integration',
    'API Gateway service proxy',
    'apiGatewayServiceProxies',
    'Kinesis',
    'SQS',
    'S3',
    'SNS',
    'DynamoDB',
    'EventBridge',
  ]
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/aws/guide/api-gateway-aws-proxy)

<!-- DOCS-SITE-LINK:END -->

# API Gateway Service Proxies

API Gateway service proxies connect a route of your service's REST API straight to an AWS service, with no Lambda function in between: API Gateway calls Amazon Kinesis Data Streams, Amazon SQS, Amazon S3, Amazon SNS, Amazon DynamoDB or Amazon EventBridge itself, through an [AWS service integration](https://docs.aws.amazon.com/apigateway/latest/developerguide/getting-started-aws-proxy.html). Use one when a route only forwards the request to that service, such as queueing a message or storing a record; use an [`http` event](../events/apigateway.md) when code has to run first.

Declare the proxies under `custom.apiGatewayServiceProxies` in `serverless.yml`. This service accepts a message on `POST /messages` and queues it:

```yaml
# serverless.yml
service: my-service
frameworkVersion: '4'

provider:
  name: aws
  region: us-east-1

custom:
  apiGatewayServiceProxies:
    - sqs:
        path: /messages
        method: post
        queueName: { 'Fn::GetAtt': ['MessagesQueue', 'QueueName'] }
        cors: true

resources:
  Resources:
    MessagesQueue:
      Type: AWS::SQS::Queue
```

Run `serverless deploy`. After the deployment, the CLI lists each proxy's method and URL:

```text
Serverless API Gateway Service Proxy Outputs
endpoints:
  POST - https://abc123def4.execute-api.us-east-1.amazonaws.com/dev/messages
```

Send a message:

```bash
curl https://abc123def4.execute-api.us-east-1.amazonaws.com/dev/messages \
  -H 'Content-Type: application/json' -d '{"orderId": "o-1"}'
```

The request body becomes the SQS message body, and the response carries the result of SQS's `SendMessage` call.

## How service proxies work

- **One REST API.** Proxies are routes on the service's API Gateway REST API, the same API that `http` events use, at `https://<api-id>.execute-api.<region>.amazonaws.com/<stage>/<path>`. Settings under `provider.apiGateway`, such as an existing `restApiId` or `binaryMediaTypes`, apply to them too.
- **One route per proxy.** Each list item is one method on one path. Two items with the same `path` and `method` compile to the same API Gateway method, and only one of them is deployed.
- **One IAM role per service type.** API Gateway calls the AWS service with an IAM role. The Framework creates one role per service type that has a proxy without `roleArn`, with only the actions that service type needs on the resources you name (see [Use your own IAM role](#use-your-own-iam-role)).
- **Mapping templates.** The Framework writes the [mapping templates](https://docs.aws.amazon.com/apigateway/latest/developerguide/models-mappings.html) that turn the request into the AWS API call. You can add or replace them per content type (see [Customize request templates](#customize-request-templates)).
- **Status codes.** The service's answer reaches the client as `200`, `400` or `500` (S3 also `206`), with the service's response body unless you set a [response template](#customize-responses).

## Settings every proxy takes

Each list item has one key, the service type (`kinesis`, `sqs`, `s3`, `sns`, `dynamodb` or `eventbridge`), with these settings under it beside the service's own:

| Setting               | Type                                                                   | Default                      | Description                                                                                                                                          |
| --------------------- | ---------------------------------------------------------------------- | ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `path`                | string                                                                 | Required                     | The route's path, such as `/messages` or `/items/{id}`. Path parameters use `{name}`, and `{name+}` matches the rest of the path.                    |
| `method`              | `get`, `post`, `put`, `patch`, `options`, `head`, `delete` or `any`    | Required                     | The route's HTTP method, in any case.                                                                                                                |
| `cors`                | boolean or object                                                      | No CORS                      | Adds an `OPTIONS` preflight and CORS headers. See [Enable CORS](#enable-cors).                                                                       |
| `private`             | boolean                                                                | `false`                      | Requires an API key. See [Require an API key](#require-an-api-key).                                                                                  |
| `authorizationType`   | `NONE`, `AWS_IAM`, `CUSTOM`, `COGNITO_USER_POOLS` or `JWT` (uppercase) | `NONE`                       | How API Gateway authorizes callers. See [Require authorization](#require-authorization).                                                             |
| `authorizerId`        | string or `Ref`                                                        | None                         | The authorizer for `CUSTOM`, `COGNITO_USER_POOLS` or `JWT`.                                                                                          |
| `authorizationScopes` | list                                                                   | None                         | OAuth scopes for `COGNITO_USER_POOLS` or `JWT`.                                                                                                      |
| `roleArn`             | ARN string or `Fn::GetAtt` of a role's `Arn`                           | A role the Framework creates | The role API Gateway uses to call the service. DynamoDB proxies don't use it.                                                                        |
| `acceptParameters`    | map of method request parameter to boolean                             | None                         | Method request parameters the route accepts; the boolean says whether each is required. See [Accept request parameters](#accept-request-parameters). |
| `request`             | object                                                                 | None                         | Your own request mapping templates. See [Customize request templates](#customize-request-templates).                                                 |
| `response`            | object or list                                                         | None                         | Your own response templates. See [Customize responses](#customize-responses).                                                                        |

An invalid proxy stops `serverless package` and `serverless deploy` with the validation message, for example `"sns.request.template" is required`.

## Send records to Kinesis

A `kinesis` proxy writes the request to an Amazon Kinesis data stream with `PutRecord`, or with `PutRecords` when `action: PutRecords` is set:

```yaml
custom:
  apiGatewayServiceProxies:
    - kinesis:
        path: /records
        method: post
        streamName: { Ref: 'RecordsStream' }

resources:
  Resources:
    RecordsStream:
      Type: AWS::Kinesis::Stream
      Properties:
        ShardCount: 1
```

```bash
curl https://abc123def4.execute-api.us-east-1.amazonaws.com/dev/records \
  -H 'Content-Type: application/json' -d '{"message": "some data"}'
```

The Kinesis settings:

- `streamName` (required): the stream's name, as a string or a `Ref` to an `AWS::Kinesis::Stream`.
- `action`: `PutRecord` (default) or `PutRecords`.
- `partitionKey`: the record's partition key. Default: the API Gateway request id (`$context.requestId`). Set a fixed string, or an object with one of `pathParam`, `queryStringParam` or `bodyParam` (a dotted path into the JSON body, such as `data.myKey`).

With `PutRecord`, the whole request body is the record's data. This route takes the partition key from the path:

```yaml
custom:
  apiGatewayServiceProxies:
    - kinesis:
        path: /records/{myKey}
        method: post
        streamName: { Ref: 'RecordsStream' }
        partitionKey:
          pathParam: myKey
```

With `PutRecords`, the body carries a `records` array, and each record gives its own `data` and `partition-key`; `partitionKey` is not used:

```yaml
custom:
  apiGatewayServiceProxies:
    - kinesis:
        path: /records/batch
        method: post
        action: PutRecords
        streamName: { Ref: 'RecordsStream' }
```

```bash
curl https://abc123def4.execute-api.us-east-1.amazonaws.com/dev/records/batch \
  -H 'Content-Type: application/json' \
  -d '{"records": [{"data": "first", "partition-key": "a"}, {"data": "second", "partition-key": "b"}]}'
```

A Kinesis proxy takes `response` with `template` only (see [Customize responses](#customize-responses)).

## Send messages to SQS

An `sqs` proxy sends the request body as a message to an Amazon SQS queue with `SendMessage`. `queueName` (required) is the queue's name, as a string or as `{ 'Fn::GetAtt': ['<QueueLogicalId>', 'QueueName'] }`; the queue is in the stage's account and region. The example at the top of this page is a complete SQS proxy.

To set message attributes, map them in `requestParameters`, the [API Gateway integration request parameters](https://docs.aws.amazon.com/apigateway/latest/developerguide/request-response-data-mappings.html). This route adds the caller's Amazon Cognito identity to each message:

```yaml
custom:
  apiGatewayServiceProxies:
    - sqs:
        path: /messages
        method: post
        queueName: { 'Fn::GetAtt': ['MessagesQueue', 'QueueName'] }
        requestParameters:
          'integration.request.querystring.MessageAttribute.1.Name': "'cognitoIdentityId'"
          'integration.request.querystring.MessageAttribute.1.Value.StringValue': 'context.identity.cognitoIdentityId'
          'integration.request.querystring.MessageAttribute.1.Value.DataType': "'String'"
```

A value in single quotes inside the string (`"'String'"`) is a fixed value; a value without them is a mapping expression.

### SQS request templates

An SQS request template replaces the Framework's query-string mapping, so it builds the whole `SendMessage` call, `Action` and `MessageBody` included. With a template, the Framework sets the integration's `Content-Type` to `application/x-www-form-urlencoded` and the pass-through behavior to `NEVER`, and drops every `integration.request.querystring.*` entry of `requestParameters`; headers the client sent reach SQS only through the template. Key the template by the content type clients send, usually `application/json`. This one sends to a FIFO queue:

```yaml
custom:
  apiGatewayServiceProxies:
    - sqs:
        path: /{version}/event/receiver
        method: post
        queueName: { 'Fn::GetAtt': ['EventsQueue', 'QueueName'] }
        request:
          template:
            application/json: |-
              #set ($body = $util.parseJson($input.body))
              Action=SendMessage##
              &MessageGroupId=$util.urlEncode($body.event_type)##
              &MessageDeduplicationId=$util.urlEncode($body.event_id)##
              &MessageAttribute.1.Name=$util.urlEncode("X-Custom-Signature")##
              &MessageAttribute.1.Value.DataType=String##
              &MessageAttribute.1.Value.StringValue=$util.urlEncode($input.params("X-Custom-Signature"))##
              &MessageBody=$util.urlEncode($input.body)
```

The `##` at the end of each line is an empty Velocity comment: it removes the line break, so API Gateway sends the lines as one form-encoded string. A `requestParameters` entry for `integration.request.header.Content-Type` replaces the form content type, and SQS then can't read the call.

## Read and write S3 objects

An `s3` proxy calls `GetObject`, `PutObject` or `DeleteObject` on an Amazon S3 bucket:

```yaml
custom:
  apiGatewayServiceProxies:
    - s3:
        path: /files/{fileKey}
        method: get
        action: GetObject
        bucket: { Ref: 'FilesBucket' }
        key:
          pathParam: fileKey
    - s3:
        path: /files
        method: delete
        action: DeleteObject
        bucket: { Ref: 'FilesBucket' }
        key:
          queryStringParam: key

resources:
  Resources:
    FilesBucket:
      Type: AWS::S3::Bucket
```

The S3 settings:

- `action` (required): `GetObject`, `PutObject` or `DeleteObject`.
- `bucket` (required): the bucket's name, as a string or a `Ref` to an `AWS::S3::Bucket`.
- `key`: the object key, as a fixed string or an object with one of `pathParam` or `queryStringParam`. Required, except with a `request.template` (the template sets the object path) or when `requestParameters` sets `integration.request.path.object`; in that second case, leave `key` out.
- `pathOverride`: the object path after `{bucket}/`, instead of `{object}`. See [Build the object path from several parameters](#build-the-object-path-from-several-parameters).
- `requestParameters`: integration request parameters, merged over the Framework's.

`GetObject` passes the `Range` header through, answers a partial read with `206`, and returns the object's `Content-Type`. To serve binary objects such as images, list their media types in [`provider.apiGateway.binaryMediaTypes`](../events/apigateway.md#binary-media-types):

```yaml
provider:
  name: aws
  apiGateway:
    binaryMediaTypes:
      - '*/*'
```

### Write objects to a bucket with ACLs disabled

`PutObject` stores the request body with the request's `Content-Type`, and sends the canned ACL `authenticated-read` in the `x-amz-acl` header. A bucket with ACLs disabled, the S3 default for new buckets, refuses an upload with that ACL with `400 AccessControlListNotSupported` (see [Object Ownership](https://docs.aws.amazon.com/AmazonS3/latest/userguide/about-object-ownership.html)). For such a bucket, set the header to `bucket-owner-full-control` in `requestParameters`:

```yaml
custom:
  apiGatewayServiceProxies:
    - s3:
        path: /files
        method: post
        action: PutObject
        bucket: { Ref: 'FilesBucket' }
        key: static-key.json
        requestParameters:
          'integration.request.header.x-amz-acl': "'bucket-owner-full-control'"
```

To name each object after the request id instead of a fixed key, map `integration.request.path.object` and leave `key` out:

```yaml
custom:
  apiGatewayServiceProxies:
    - s3:
        path: /files
        method: post
        action: PutObject
        bucket: { Ref: 'FilesBucket' }
        requestParameters:
          'integration.request.path.object': 'context.requestId'
          'integration.request.header.x-amz-acl': "'bucket-owner-full-control'"
          'integration.request.header.cache-control': "'public, max-age=31536000, immutable'"
```

### Build the object path from several parameters

`pathOverride` sets the S3 path after `{bucket}/`; the default is `{object}`. Each `{name}` in it needs a matching `integration.request.path.<name>` entry in `requestParameters`. `key` or `integration.request.path.object` is still required, even when `pathOverride` doesn't use it. This route serves `/files/language/en` from the object `language/en.xml`:

```yaml
custom:
  apiGatewayServiceProxies:
    - s3:
        path: /files/{folder}/{file}
        method: get
        action: GetObject
        pathOverride: '{folder}/{file}.xml'
        bucket: { Ref: 'FilesBucket' }
        requestParameters:
          'integration.request.path.folder': 'method.request.path.folder'
          'integration.request.path.file': 'method.request.path.file'
          'integration.request.path.object': 'context.requestId'
```

A greedy path parameter covers any depth. This route serves `/files/a/b/c` from `a/b/c.xml`:

```yaml
custom:
  apiGatewayServiceProxies:
    - s3:
        path: /files/{myPath+}
        method: get
        action: GetObject
        pathOverride: '{myPath}.xml'
        bucket: { Ref: 'FilesBucket' }
        requestParameters:
          'integration.request.path.myPath': 'method.request.path.myPath'
          'integration.request.path.object': 'context.requestId'
```

### S3 request templates

An S3 request template can set the object path from the request with `$context.requestOverride`. With a template, the pass-through behavior is `NEVER`, and `key` is optional:

```yaml
custom:
  apiGatewayServiceProxies:
    - s3:
        path: /files
        method: get
        action: GetObject
        bucket: { Ref: 'FilesBucket' }
        request:
          template:
            application/json: |
              #set ($specialStuff = $context.request.header.x-special)
              #set ($context.requestOverride.path.object = $specialStuff.replaceAll('_', '-'))
              {}
```

API Gateway picks the template by the request's `Content-Type`, and uses `application/json` when the client sends none (see [pass-through behavior](https://docs.aws.amazon.com/apigateway/latest/developerguide/integration-passthrough-behaviors.html)).

## Publish to SNS

An `sns` proxy publishes the request body as the message of an Amazon SNS topic. `topicName` (required) is the topic's name, as a string or as `{ 'Fn::GetAtt': ['<TopicLogicalId>', 'TopicName'] }`; the topic is in the stage's account and region:

```yaml
custom:
  apiGatewayServiceProxies:
    - sns:
        path: /notifications
        method: post
        topicName: { 'Fn::GetAtt': ['NotificationsTopic', 'TopicName'] }

resources:
  Resources:
    NotificationsTopic:
      Type: AWS::SNS::Topic
```

An SNS request template replaces the Framework's template for its content type and returns a form-encoded `Publish` call. Reference the topic with `Fn::Sub`; `Ref` of a topic is its ARN:

```yaml
custom:
  apiGatewayServiceProxies:
    - sns:
        path: /notifications
        method: post
        topicName: { 'Fn::GetAtt': ['NotificationsTopic', 'TopicName'] }
        request:
          template:
            application/json:
              Fn::Sub: "Action=Publish&Message=$util.urlEncode('This is a fixed message')&TopicArn=$util.urlEncode('${NotificationsTopic}')"
```

SNS proxies also take two integration settings inside `request`, beside its required `template`; the other proxy types ignore them:

- `contentHandling`: `CONVERT_TO_BINARY` or `CONVERT_TO_TEXT`, for binary payloads (see [ContentHandling](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-properties-apitgateway-method-integration.html#cfn-apigateway-method-integration-contenthandling)).
- `passThrough`: `WHEN_NO_MATCH`, `NEVER` (default) or `WHEN_NO_TEMPLATES` (see [PassthroughBehavior](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-properties-apitgateway-method-integration.html#cfn-apigateway-method-integration-passthroughbehavior)).

```yaml
custom:
  apiGatewayServiceProxies:
    - sns:
        path: /notifications
        method: post
        topicName: { 'Fn::GetAtt': ['NotificationsTopic', 'TopicName'] }
        request:
          contentHandling: CONVERT_TO_TEXT
          passThrough: WHEN_NO_TEMPLATES
          template:
            application/json:
              Fn::Sub: "Action=Publish&Message=$util.urlEncode($input.body)&TopicArn=$util.urlEncode('${NotificationsTopic}')"
```

## Read and write DynamoDB items

A `dynamodb` proxy calls `PutItem`, `GetItem` or `DeleteItem` on an Amazon DynamoDB table, with the key taken from the path or the query string:

```yaml
custom:
  apiGatewayServiceProxies:
    - dynamodb:
        path: /items/{id}/{sort}
        method: put
        action: PutItem
        tableName: { Ref: 'ItemsTable' }
        hashKey:
          pathParam: id
          attributeType: S
        rangeKey:
          pathParam: sort
          attributeType: S
        condition: attribute_not_exists(id)
    - dynamodb:
        path: /items
        method: get
        action: GetItem
        tableName: { Ref: 'ItemsTable' }
        hashKey:
          queryStringParam: id
          attributeType: S
        rangeKey:
          queryStringParam: sort
          attributeType: S
    - dynamodb:
        path: /items/{id}/{sort}
        method: delete
        action: DeleteItem
        tableName: { Ref: 'ItemsTable' }
        hashKey:
          pathParam: id
          attributeType: S
        rangeKey:
          pathParam: sort
          attributeType: S

resources:
  Resources:
    ItemsTable:
      Type: AWS::DynamoDB::Table
      Properties:
        BillingMode: PAY_PER_REQUEST
        AttributeDefinitions:
          - AttributeName: id
            AttributeType: S
          - AttributeName: sort
            AttributeType: S
        KeySchema:
          - AttributeName: id
            KeyType: HASH
          - AttributeName: sort
            KeyType: RANGE
```

The DynamoDB settings:

- `action` (required): `PutItem`, `GetItem` or `DeleteItem`.
- `tableName` (required): the table's name, as a string or a `Ref` to an `AWS::DynamoDB::Table`.
- `hashKey` (required) and `rangeKey` (for a table with a sort key): one of `pathParam` or `queryStringParam`, and `attributeType`, the key's DynamoDB type (`S`, `N` or `B`). The key attribute's name is the parameter's name: `pathParam: id` reads and writes the attribute `id`, so name the parameters after the table's key attributes.
- `condition`: a [condition expression](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/Expressions.ConditionExpressions.html) for `PutItem` and `DeleteItem`.
- `requestParameters`: integration request parameters.

A `PutItem` body lists the item's other attributes in DynamoDB's attribute-value format:

```bash
curl -X PUT https://abc123def4.execute-api.us-east-1.amazonaws.com/dev/items/1/a \
  -H 'Content-Type: application/json' -d '{"name": {"S": "john"}, "address": {"S": "Main Street 1"}}'
```

Without a `response`, a `GetItem` answers with the item's attributes as a flat JSON object, such as `{"id":"1","sort":"a","name":"john"}`. DynamoDB proxies always use the role the Framework creates for them; `roleArn` has no effect.

## Put events on EventBridge

An `eventbridge` proxy puts one event on an Amazon EventBridge event bus with `PutEvents`:

```yaml
custom:
  apiGatewayServiceProxies:
    - eventbridge:
        path: /events
        method: post
        source: 'my-service'
        detailType: 'OrderPlaced'
        eventBusName: { Ref: 'OrdersBus' }
    - eventbridge:
        path: /events/{detailTypeKey}/{sourceKey}
        method: post
        detailType:
          pathParam: detailTypeKey
        source:
          pathParam: sourceKey
        eventBusName: { Ref: 'OrdersBus' }
    - eventbridge:
        path: /events/body
        method: post
        detailType:
          bodyParam: data.detailType
        source:
          bodyParam: data.source
        detail:
          bodyParam: data.detail
        eventBusName: { Ref: 'OrdersBus' }

resources:
  Resources:
    OrdersBus:
      Type: AWS::Events::EventBus
      Properties:
        Name: orders
```

The EventBridge settings:

- `eventBusName` (required): the bus's name, as a string or a `Ref` to an `AWS::Events::EventBus`.
- `source` (required): the event's source, as a fixed string or an object with one of `pathParam`, `queryStringParam` or `bodyParam`.
- `detailType`: the event's detail type, in the same forms. Default: the API Gateway request id.
- `detail`: `bodyParam`, a dotted path into the JSON body. Default: the whole request body.

EventBridge proxies take no `response` setting.

## Customize request templates

Every proxy type accepts `request.template`, a map of content type to [mapping template](https://docs.aws.amazon.com/apigateway/latest/developerguide/api-gateway-mapping-template-reference.html). For Kinesis, SNS, DynamoDB and EventBridge, the Framework writes templates for `application/json` and `application/x-www-form-urlencoded`; a template you give for one of those types replaces it, and a template for another type is added. SQS and S3 templates work differently: see [SQS request templates](#sqs-request-templates) and [S3 request templates](#s3-request-templates).

A template can reference resources of the stack with `Fn::Sub`. The Framework leaves `${Name}` placeholders that name no variable source, such as `${RecordsStream}` or `${AWS::Region}`, for CloudFormation to fill in. This Kinesis template takes the partition key from the body:

```yaml
custom:
  apiGatewayServiceProxies:
    - kinesis:
        path: /records
        method: post
        streamName: { Ref: 'RecordsStream' }
        request:
          template:
            text/plain:
              Fn::Sub: |
                #set($msgBody = $util.parseJson($input.body))
                #set($msgId = $msgBody.MessageId)
                {
                    "Data": "$util.base64Encode($input.body)",
                    "PartitionKey": "$msgId",
                    "StreamName": "${RecordsStream}"
                }
```

A Kinesis template returns the JSON body of the Kinesis API call; an SNS or SQS template returns a form-encoded string.

## Customize responses

`response.template` sets the response body for three outcomes, as `application/json` templates:

```yaml
custom:
  apiGatewayServiceProxies:
    - sqs:
        path: /messages
        method: post
        queueName: { 'Fn::GetAtt': ['MessagesQueue', 'QueueName'] }
        response:
          template:
            success: |-
              { "message": "accepted" }
            clientError: |-
              { "message": "there is an error in your request" }
            serverError: |-
              { "message": "there was an error handling your request" }
```

- `success` answers a `200` from the service, `clientError` a `400` and `serverError` a `500`. For S3, `success` answers any `2xx` (including `206`), `clientError` any `4xx` and `serverError` any `5xx`.
- Without a template for an outcome, the service's response body reaches the client as it is.
- For SQS, SNS and DynamoDB, the templates apply only when `success` is set.
- Kinesis and S3 proxies take this form only; EventBridge proxies take no `response`.

For SQS, SNS and DynamoDB, `response` can instead be a list of [integration responses](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-properties-apitgateway-method-integration-integrationresponse.html), each with `statusCode`, `selectionPattern` (a regular expression over the service's status code; default: the `statusCode`), `responseParameters` and `responseTemplates`:

```yaml
custom:
  apiGatewayServiceProxies:
    - dynamodb:
        path: /items
        method: get
        action: GetItem
        tableName: { Ref: 'ItemsTable' }
        hashKey:
          queryStringParam: id
          attributeType: S
        rangeKey:
          queryStringParam: sort
          attributeType: S
        response:
          - statusCode: 200
            selectionPattern: '2\d{2}'
            responseParameters: {}
            responseTemplates:
              application/json: |-
                #set($item = $input.path('$.Item')){ "Item": $item }
```

## Enable CORS

`cors: true` adds an `OPTIONS` preflight on the proxy's path and sets `Access-Control-Allow-Origin` on its responses. It is the same as this object:

```yaml
custom:
  apiGatewayServiceProxies:
    - sqs:
        path: /messages
        method: post
        queueName: { 'Fn::GetAtt': ['MessagesQueue', 'QueueName'] }
        cors:
          origin: '*'
          headers:
            - Content-Type
            - X-Amz-Date
            - Authorization
            - X-Api-Key
            - X-Amz-Security-Token
            - X-Amz-User-Agent
          allowCredentials: false
```

The `cors` object takes:

- `origin` (a string) or `origins` (a list), not both. Default: `*`.
- `headers`: the allowed request headers. Default: the six in the preceding example.
- `methods`: the allowed methods; `OPTIONS` and the proxy's own method are always added.
- `allowCredentials`: sets `Access-Control-Allow-Credentials`. Default: `false`.
- `maxAge`: seconds browsers may cache the preflight answer (`Access-Control-Max-Age`), at least `1`.
- `cacheControl`: the preflight answer's `Cache-Control` header, so a CDN in front of the API can cache it, such as `'max-age=600, s-maxage=600, proxy-revalidate'`.

Proxies that share a `path` share one preflight, which combines their headers, methods and origins; for `maxAge` and `cacheControl`, the last proxy that sets them wins.

The preflight takes no authorization and no API key, whatever the route's `authorizationType` and `private` settings. With `origin`, the preflight and the route's responses carry that origin in `Access-Control-Allow-Origin`. With `origins`, the preflight answers with the caller's `Origin` when it matches an entry (`*` in an entry matches any characters), and the route's responses carry all entries joined by commas. Browsers accept only one origin in `Access-Control-Allow-Origin`, so with two or more `origins` entries, browsers reject the route's responses even though the preflight succeeds. For routes that browsers call, set a single `origin`, or `*` for requests without credentials.

## Require authorization

`authorizationType` sets how API Gateway authorizes callers of the route:

```yaml
custom:
  apiGatewayServiceProxies:
    - sqs:
        path: /messages
        method: post
        queueName: { 'Fn::GetAtt': ['MessagesQueue', 'QueueName'] }
        authorizationType: COGNITO_USER_POOLS
        authorizerId: { Ref: 'MessagesAuthorizer' }
        authorizationScopes:
          - messages/write
```

- `NONE` (default): no authorization.
- `AWS_IAM`: callers sign requests with AWS credentials (Signature Version 4).
- `CUSTOM` or `COGNITO_USER_POOLS`: set `authorizerId` to the authorizer's ID, or to a `Ref` to an `AWS::ApiGateway::Authorizer` you declare under `resources`.
- `JWT`: set `authorizerId` to the ID of a JWT authorizer, or to a `Ref` to one defined under `provider.apiGateway.authorizers` (see the following example).

`authorizationScopes` applies to `COGNITO_USER_POOLS` and `JWT`; without `authorizerId`, scopes need `COGNITO_USER_POOLS`. `JWT` always needs `authorizerId`. A `JWT` route accepts a token whose `scope` or `scp` claim contains at least one of the scopes.

To protect a proxy route with a [JWT authorizer](../events/apigateway.md#jwt-authorizers) of the same service, `Ref` its CloudFormation resource: the authorizer's key with the first letter in uppercase, followed by `ApiGatewayJwtAuthorizer`:

```yaml
provider:
  name: aws
  apiGateway:
    authorizers:
      messages:
        type: jwt
        issuerUrl: https://my-tenant.us.auth0.com/
        audience: https://api.example.com/messages
        algorithms:
          - rs256

custom:
  apiGatewayServiceProxies:
    - sqs:
        path: /messages
        method: post
        queueName: { 'Fn::GetAtt': ['MessagesQueue', 'QueueName'] }
        authorizationType: JWT
        authorizerId: { Ref: 'MessagesApiGatewayJwtAuthorizer' }
        authorizationScopes:
          - messages:write
```

See [AuthorizationType](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-resource-apigateway-method.html#cfn-apigateway-method-authorizationtype) for what each type checks.

## Require an API key

`private: true` makes the route require an API key in the `x-api-key` header. Declare the keys and usage plan under `provider.apiGateway`, as for `http` events (see [Setting API keys for your Rest API](../events/apigateway.md#setting-api-keys-for-your-rest-api)):

```yaml
custom:
  apiGatewayServiceProxies:
    - sqs:
        path: /messages
        method: post
        queueName: { 'Fn::GetAtt': ['MessagesQueue', 'QueueName'] }
        private: true
```

The Framework creates the API keys and usage plans of `provider.apiGateway` when it compiles the service's `http` events, for the whole stage of the REST API. A service whose functions have no `http` event gets no API key or usage plan from `provider.apiGateway.apiKeys`, even with `private: true` proxies. The `OPTIONS` preflight that `cors` adds needs no API key (see [Enable CORS](#enable-cors)).

## Use your own IAM role

Without `roleArn`, API Gateway calls the service with a role the Framework creates for that service type. Each role trusts `apigateway.amazonaws.com`, allows `logs:CreateLogGroup`, `logs:CreateLogStream` and `logs:PutLogEvents`, and allows these actions on the resources the proxies of that type name:

| Service type  | Role logical ID               | Actions                                                   | Resources                                                   |
| ------------- | ----------------------------- | --------------------------------------------------------- | ----------------------------------------------------------- |
| `kinesis`     | `ApigatewayToKinesisRole`     | `kinesis:PutRecord`, `kinesis:PutRecords`                 | Each `streamName`, in the stage's account and region        |
| `sqs`         | `ApigatewayToSqsRole`         | `sqs:SendMessage`                                         | Each `queueName`, in the stage's account and region         |
| `s3`          | `ApigatewayToS3Role`          | `s3:<action>*` for each `action`, such as `s3:GetObject*` | The objects of each `bucket` (`<bucket ARN>/*`)             |
| `sns`         | `ApigatewayToSnsRole`         | `sns:Publish`                                             | Each `topicName`, in the stage's account and region         |
| `dynamodb`    | `ApigatewayToDynamodbRole`    | Each proxy's `action`, such as `dynamodb:PutItem`         | That proxy's `tableName`, in the stage's account and region |
| `eventbridge` | `ApigatewayToEventBridgeRole` | `events:PutEvents`                                        | Each `eventBusName`, in the stage's account and region      |

A service with an `sqs` proxy and an `s3` proxy, for example, gets `ApigatewayToSqsRole` and `ApigatewayToS3Role`. The Framework creates no role for a service type whose proxies all set `roleArn`, except for DynamoDB, which always gets its role.

To use your own role, set `roleArn` to its ARN or to `Fn::GetAtt` of its `Arn`. The role must trust `apigateway.amazonaws.com` and allow the service action. DynamoDB proxies always use the Framework's role.

```yaml
custom:
  apiGatewayServiceProxies:
    - sqs:
        path: /messages
        method: post
        queueName: { 'Fn::GetAtt': ['MessagesQueue', 'QueueName'] }
        roleArn: { 'Fn::GetAtt': ['MessagesProxyRole', 'Arn'] }
```

## Accept request parameters

`acceptParameters` declares the [method request parameters](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-resource-apigateway-method.html#cfn-apigateway-method-requestparameters) a route accepts, so `requestParameters` can map them. This route adds a request header to each SQS message as a message attribute:

```yaml
custom:
  apiGatewayServiceProxies:
    - sqs:
        path: /messages
        method: post
        queueName: { 'Fn::GetAtt': ['MessagesQueue', 'QueueName'] }
        acceptParameters:
          'method.request.header.Custom-Header': true
        requestParameters:
          'integration.request.querystring.MessageAttribute.1.Name': "'custom-Header'"
          'integration.request.querystring.MessageAttribute.1.Value.StringValue': 'method.request.header.Custom-Header'
          'integration.request.querystring.MessageAttribute.1.Value.DataType': "'String'"
```

S3 proxies declare the method request parameters their `requestParameters` use without `acceptParameters`.

## Migrate from serverless-apigateway-service-proxy

The Framework includes the community plugin [`serverless-apigateway-service-proxy`](https://github.com/serverless-operations/serverless-apigateway-service-proxy), with thanks to its authors and contributors. To migrate, remove the plugin from `plugins` in `serverless.yml` and from your dependencies, and keep `custom.apiGatewayServiceProxies` as it is. `Fn::Sub` in templates needs no `serverless-cloudformation-sub-variables` plugin (see [Customize request templates](#customize-request-templates)).

## Related

- [API Gateway REST API events](../events/apigateway.md): routes that invoke a Lambda function, and the `provider.apiGateway` settings proxies share.
- [Set up an AWS service integration](https://docs.aws.amazon.com/apigateway/latest/developerguide/getting-started-aws-proxy.html) in the API Gateway developer guide.
