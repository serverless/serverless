<!--
title: Serverless Framework - API Gateway AWS Proxy
description: How to configure API Gateway AWS Proxy with the Serverless Framework.
short_title: API Gateway AWS Proxy
keywords:
  [
    'Serverless Framework',
    'API Gateway',
    'AWS proxy',
    'Kinesis',
    'SQS',
    'S3',
    'SNS',
    'DynamoDB',
    'EventBridge',
    'CORS',
  ]
-->

# API Gateway AWS Service Proxy Integration

Built-in support for API Gateway's AWS service proxy integration in the Serverless Framework. You can directly connect API Gateway to AWS services without Lambda.

Huge thanks to the [serverless-operations](https://github.com/serverless-operations) team and all community contributors for the original [`serverless-apigateway-service-proxy`](https://github.com/serverless-operations/serverless-apigateway-service-proxy) plugin - these capabilities now ship in the Framework by default.

- [Migration from the community plugin](#migration-from-the-community-plugin)
- [Supported AWS services](#supported-aws-services)
- [How to use](#how-to-use)
  - [Kinesis](#kinesis)
  - [SQS](#sqs)
    - [Customizing request parameters](#customizing-request-parameters)
    - [Customizing responses](#customizing-responses)
  - [S3](#s3)
    - [Customizing request parameters](#customizing-request-parameters-1)
    - [Customizing request templates](#customizing-request-templates)
    - [Customize the Path Override in API Gateway](#customize-the-path-override-in-api-gateway)
      - [Can use greedy, for deeper Folders](#can-use-greedy-for-deeper-folders)
    - [Customizing responses](#customizing-responses-1)
    - [Allow Binary Types](#allow-binary-type)
  - [SNS](#sns)
    - [Customizing responses](#customizing-responses-2)
  - [DynamoDB](#dynamodb)
    - [Customizing responses](#customizing-responses-3)
  - [EventBridge](#eventbridge)
- [Common API Gateway features](#common-api-gateway-features)
  - [Enabling CORS](#enabling-cors)
  - [Adding Authorization](#adding-authorization)
  - [Enabling API Token Authentication](#enabling-api-token-authentication)
  - [Using a Custom IAM Role](#using-a-custom-iam-role)
  - [Customizing API Gateway parameters](#customizing-api-gateway-parameters)
    - [Customizing request body mapping templates](#customizing-request-body-mapping-templates)
      - [Kinesis](#kinesis-1)
      - [SQS](#sqs-1)
      - [SNS](#sns-1)

## Migration from the community plugin

Migrating from the community plugin? This feature is included by default in the Framework. There is nothing to install.

Remove it from the `plugins` section of `serverless.yml` and from your dependencies. Keep your existing `custom.apiGatewayServiceProxies` configuration; the built-in integration continues to honor it.

## Supported AWS services

Here is the list of services that this built-in integration currently supports.

- Kinesis Streams
- SQS
- S3
- SNS
- DynamoDB
- EventBridge

## How to use

Define settings of the AWS services you want to integrate under `custom > apiGatewayServiceProxies` and run `serverless deploy`.

### Kinesis

Sample syntax for Kinesis proxy in `serverless.yml`.

```yaml
custom:
  apiGatewayServiceProxies:
    - kinesis: # partitionkey is set apigateway requestid by default
        path: /kinesis
        method: post
        streamName: { Ref: 'YourStream' }
        cors: true
    - kinesis:
        path: /kinesis
        method: post
        partitionKey: 'hardcordedkey' # use static partitionkey
        streamName: { Ref: 'YourStream' }
        cors: true
    - kinesis:
        path: /kinesis/{myKey} # use path parameter
        method: post
        partitionKey:
          pathParam: myKey
        streamName: { Ref: 'YourStream' }
        cors: true
    - kinesis:
        path: /kinesis
        method: post
        partitionKey:
          bodyParam: data.myKey # use body parameter
        streamName: { Ref: 'YourStream' }
        cors: true
    - kinesis:
        path: /kinesis
        method: post
        partitionKey:
          queryStringParam: myKey # use query string param
        streamName: { Ref: 'YourStream' }
        cors: true
    - kinesis: # PutRecords
        path: /kinesis
        method: post
        action: PutRecords
        streamName: { Ref: 'YourStream' }
        cors: true

resources:
  Resources:
    YourStream:
      Type: AWS::Kinesis::Stream
      Properties:
        ShardCount: 1
```

Sample request after deploying.

```bash
curl https://xxxxxxx.execute-api.us-east-1.amazonaws.com/dev/kinesis -d '{"message": "some data"}'  -H 'Content-Type:application/json'
```

### SQS

Sample syntax for SQS proxy in `serverless.yml`.

```yaml
custom:
  apiGatewayServiceProxies:
    - sqs:
        path: /sqs
        method: post
        queueName: { 'Fn::GetAtt': ['SQSQueue', 'QueueName'] }
        cors: true

resources:
  Resources:
    SQSQueue:
      Type: 'AWS::SQS::Queue'
```

Sample request after deploying.

```bash
curl https://xxxxxx.execute-api.us-east-1.amazonaws.com/dev/sqs -d '{"message": "testtest"}' -H 'Content-Type:application/json'
```

#### Customizing request parameters

If you'd like to pass additional data to the integration request, you can do so by including your custom [API Gateway request parameters](https://docs.aws.amazon.com/apigateway/latest/developerguide/request-response-data-mappings.html) in `serverless.yml` like so:

```yml
custom:
  apiGatewayServiceProxies:
    - sqs:
        path: /queue
        method: post
        queueName: !GetAtt MyQueue.QueueName
        cors: true

        requestParameters:
          'integration.request.querystring.MessageAttribute.1.Name': "'cognitoIdentityId'"
          'integration.request.querystring.MessageAttribute.1.Value.StringValue': 'context.identity.cognitoIdentityId'
          'integration.request.querystring.MessageAttribute.1.Value.DataType': "'String'"
          'integration.request.querystring.MessageAttribute.2.Name': "'cognitoAuthenticationProvider'"
          'integration.request.querystring.MessageAttribute.2.Value.StringValue': 'context.identity.cognitoAuthenticationProvider'
          'integration.request.querystring.MessageAttribute.2.Value.DataType': "'String'"
```

The alternative way to pass `MessageAttribute` parameters is via a request body mapping template.

#### Customizing request body mapping templates

See the [SQS section](#sqs-1) under [Customizing request body mapping templates](#customizing-request-body-mapping-templates)

#### Customizing responses

##### Simplified response template customization

You can get a simple customization of the responses by providing a template for the possible responses. The template is assumed to be `application/json`.

```yml
custom:
  apiGatewayServiceProxies:
    - sqs:
        path: /queue
        method: post
        queueName: !GetAtt MyQueue.QueueName
        cors: true
        response:
          template:
            # `success` is used when the integration response is 200
            success: |-
              { "message: "accepted" }
            # `clientError` is used when the integration response is 400
            clientError: |-
              { "message": "there is an error in your request" }
            # `serverError` is used when the integration response is 500
            serverError: |-
              { "message": "there was an error handling your request" }
```

##### Full response customization

If you want more control over the integration response, you can
provide an array of objects for the `response` value:

```yml
custom:
  apiGatewayServiceProxies:
    - sqs:
        path: /queue
        method: post
        queueName: !GetAtt MyQueue.QueueName
        cors: true
        response:
          - statusCode: 200
            selectionPattern: '2\d{2}'
            responseParameters: {}
            responseTemplates:
              application/json: |-
                { "message": "accepted" }
```

The object keys correspond to the API Gateway [integration response](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-properties-apitgateway-method-integration-integrationresponse.html#cfn-apigateway-method-integration-integrationresponse-responseparameters) object.

### S3

Sample syntax for S3 proxy in `serverless.yml`.

```yaml
custom:
  apiGatewayServiceProxies:
    - s3:
        path: /s3
        method: post
        action: PutObject
        bucket:
          Ref: S3Bucket
        key: static-key.json # use static key
        cors: true

    - s3:
        path: /s3/{myKey} # use path param
        method: get
        action: GetObject
        bucket:
          Ref: S3Bucket
        key:
          pathParam: myKey
        cors: true

    - s3:
        path: /s3
        method: delete
        action: DeleteObject
        bucket:
          Ref: S3Bucket
        key:
          queryStringParam: key # use query string param
        cors: true

resources:
  Resources:
    S3Bucket:
      Type: 'AWS::S3::Bucket'
```

Sample request after deploying.

```bash
curl https://xxxxxx.execute-api.us-east-1.amazonaws.com/dev/s3 -d '{"message": "testtest"}' -H 'Content-Type:application/json'
```

#### Customizing request parameters

Similar to the [SQS](#sqs) support, you can customize the default request parameters `serverless.yml` like so:

```yml
custom:
  apiGatewayServiceProxies:
    - s3:
        path: /s3
        method: post
        action: PutObject
        bucket:
          Ref: S3Bucket
        cors: true

        requestParameters:
          # if requestParameters has a 'integration.request.path.object' property you should remove the key setting
          'integration.request.path.object': 'context.requestId'
          'integration.request.header.cache-control': "'public, max-age=31536000, immutable'"
```

#### Customizing request templates

If you'd like use custom [API Gateway request templates](https://docs.aws.amazon.com/apigateway/latest/developerguide/apigateway-override-request-response-parameters.html), you can do so like so:

```yml
custom:
  apiGatewayServiceProxies:
    - s3:
        path: /s3
        method: get
        action: GetObject
        bucket:
          Ref: S3Bucket
        request:
          template:
            application/json: |
              #set ($specialStuff = $context.request.header.x-special)
              #set ($context.requestOverride.path.object = $specialStuff.replaceAll('_', '-'))
              {}
```

Note that if the client does not provide a `Content-Type` header in the request, [ApiGateway defaults to `application/json`](https://docs.aws.amazon.com/apigateway/latest/developerguide/integration-passthrough-behaviors.html).

#### Customize the Path Override in API Gateway

Added the new customization parameter that lets the user set a custom Path Override in API Gateway other than the `{bucket}/{object}`
This parameter is optional and if not set, will fall back to `{bucket}/{object}`
The Path Override will add `{bucket}/` automatically in front

Please keep in mind, that key or path.object still needs to be set at the moment (maybe this will be made optional later on with this)

Usage (With 2 Path Parameters (folder and file and a fixed file extension)):

```yaml
custom:
  apiGatewayServiceProxies:
    - s3:
        path: /s3/{folder}/{file}
        method: get
        action: GetObject
        pathOverride: '{folder}/{file}.xml'
        bucket:
          Ref: S3Bucket
        cors: true

        requestParameters:
          # if requestParameters has a 'integration.request.path.object' property you should remove the key setting
          'integration.request.path.folder': 'method.request.path.folder'
          'integration.request.path.file': 'method.request.path.file'
          'integration.request.path.object': 'context.requestId'
          'integration.request.header.cache-control': "'public, max-age=31536000, immutable'"
```

This will result in API Gateway setting the Path Override attribute to `{bucket}/{folder}/{file}.xml`
So for example if you navigate to the API Gateway endpoint `/language/en` it will fetch the file in S3 from `{bucket}/language/en.xml`

##### Can use greedy, for deeper Folders

The aforementioned example can also be shortened by a greedy approach. Thanks to @taylorreece for mentioning this.

```yaml
custom:
  apiGatewayServiceProxies:
    - s3:
        path: /s3/{myPath+}
        method: get
        action: GetObject
        pathOverride: '{myPath}.xml'
        bucket:
          Ref: S3Bucket
        cors: true

        requestParameters:
          # if requestParameters has a 'integration.request.path.object' property you should remove the key setting
          'integration.request.path.myPath': 'method.request.path.myPath'
          'integration.request.path.object': 'context.requestId'
          'integration.request.header.cache-control': "'public, max-age=31536000, immutable'"
```

This will translate for example `/s3/a/b/c` to `a/b/c.xml`

#### Customizing responses

You can get a simple customization of the responses by providing a template for the possible responses. The template is assumed to be `application/json`.

```yml
custom:
  apiGatewayServiceProxies:
    - s3:
        path: /s3
        method: post
        action: PutObject
        bucket:
          Ref: S3Bucket
        key: static-key.json
        response:
          template:
            # `success` is used when the integration response is 200
            success: |-
              { "message: "accepted" }
            # `clientError` is used when the integration response is 400
            clientError: |-
              { "message": "there is an error in your request" }
            # `serverError` is used when the integration response is 500
            serverError: |-
              { "message": "there was an error handling your request" }
```

#### Allow Binary Type

In order to allow the browser to recognize binary type (e.g. images), add the following.

```yml
#provider.apiGateway.binaryMediaTypes
provider:
  apiGateway:
    binaryMediaTypes: '*/*'
```

### SNS

Sample syntax for SNS proxy in `serverless.yml`.

```yaml
custom:
  apiGatewayServiceProxies:
    - sns:
        path: /sns
        method: post
        topicName: { 'Fn::GetAtt': ['SNSTopic', 'TopicName'] }
        cors: true

resources:
  Resources:
    SNSTopic:
      Type: AWS::SNS::Topic
```

Sample request after deploying.

```bash
curl https://xxxxxx.execute-api.us-east-1.amazonaws.com/dev/sns -d '{"message": "testtest"}' -H 'Content-Type:application/json'
```

#### Customizing responses

##### Simplified response template customization

You can get a simple customization of the responses by providing a template for the possible responses. The template is assumed to be `application/json`.

```yml
custom:
  apiGatewayServiceProxies:
    - sns:
        path: /sns
        method: post
        topicName: { 'Fn::GetAtt': ['SNSTopic', 'TopicName'] }
        cors: true
        response:
          template:
            # `success` is used when the integration response is 200
            success: |-
              { "message": "accepted" }
            # `clientError` is used when the integration response is 400
            clientError: |-
              { "message": "there is an error in your request" }
            # `serverError` is used when the integration response is 500
            serverError: |-
              { "message": "there was an error handling your request" }
```

##### Full response customization

If you want more control over the integration response, you can
provide an array of objects for the `response` value:

```yml
custom:
  apiGatewayServiceProxies:
    - sns:
        path: /sns
        method: post
        topicName: { 'Fn::GetAtt': ['SNSTopic', 'TopicName'] }
        cors: true
        response:
          - statusCode: 200
            selectionPattern: '2\d{2}'
            responseParameters: {}
            responseTemplates:
              application/json: |-
                { "message": "accepted" }
```

The object keys correspond to the API Gateway [integration response](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-properties-apitgateway-method-integration-integrationresponse.html#cfn-apigateway-method-integration-integrationresponse-responseparameters) object.

##### Content Handling and Pass Through Behaviour customization

If you want to work with binary fata, you can not specify `contentHandling` and `PassThrough` inside the `request` object.

```yml
custom:
  apiGatewayServiceProxies:
    - sns:
        path: /sns
        method: post
        topicName: { 'Fn::GetAtt': ['SNSTopic', 'TopicName'] }
        request:
          contentHandling: CONVERT_TO_TEXT
          passThrough: WHEN_NO_TEMPLATES
```

The allowed values correspond with the API Gateway Method integration for [ContentHandling](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-properties-apitgateway-method-integration.html#cfn-apigateway-method-integration-contenthandling) and [PassthroughBehavior](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-properties-apitgateway-method-integration.html#cfn-apigateway-method-integration-passthroughbehavior)

### DynamoDB

Sample syntax for DynamoDB proxy in `serverless.yml`. Currently, the supported [DynamoDB Operations](https://docs.aws.amazon.com/amazondynamodb/latest/APIReference/API_Operations.html) are `PutItem`, `GetItem` and `DeleteItem`.

```yaml
custom:
  apiGatewayServiceProxies:
    - dynamodb:
        path: /dynamodb/{id}/{sort}
        method: put
        tableName: { Ref: 'YourTable' }
        hashKey: # set pathParam or queryStringParam as a partitionkey.
          pathParam: id
          attributeType: S
        rangeKey: # required if also using sort key. set pathParam or queryStringParam.
          pathParam: sort
          attributeType: S
        action: PutItem # specify action to the table what you want
        condition: attribute_not_exists(Id) # optional Condition Expressions parameter for the table
        cors: true
    - dynamodb:
        path: /dynamodb
        method: get
        tableName: { Ref: 'YourTable' }
        hashKey:
          queryStringParam: id # use query string parameter
          attributeType: S
        rangeKey:
          queryStringParam: sort
          attributeType: S
        action: GetItem
        cors: true
    - dynamodb:
        path: /dynamodb/{id}
        method: delete
        tableName: { Ref: 'YourTable' }
        hashKey:
          pathParam: id
          attributeType: S
        action: DeleteItem
        cors: true

resources:
  Resources:
    YourTable:
      Type: AWS::DynamoDB::Table
      Properties:
        TableName: YourTable
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
        ProvisionedThroughput:
          ReadCapacityUnits: 1
          WriteCapacityUnits: 1
```

Sample request after deploying.

```bash
curl -XPUT https://xxxxxxx.execute-api.us-east-1.amazonaws.com/dev/dynamodb/<hashKey>/<sortkey> \
 -d '{"name":{"S":"john"},"address":{"S":"xxxxx"}}' \
 -H 'Content-Type:application/json'
```

#### Customizing responses

##### Simplified response template customization

You can get a simple customization of the responses by providing a template for the possible responses. The template returns the same kind of response for both `application/json` and `application/x-www-form-urlendcoded`.

```yml
custom:
  apiGatewayServiceProxies:
    - dynamodb:
        path: /dynamodb
        method: get
        tableName: { Ref: 'YourTable' }
        hashKey:
          queryStringParam: id # use query string parameter
          attributeType: S
        rangeKey:
          queryStringParam: sort
          attributeType: S
        action: GetItem
        cors: true
        response:
          template:
            # `success` is used when the integration response is 200
            success: |-
              #set($item = $input.path('$.Item')){ "Item": $item }
            # `clientError` is used when the integration response is 400
            clientError: |-
              { "message": "there is an error in your request" }
            # `serverError` is used when the integration response is 500
            serverError: |-
              { "message": "there was an error handling your request" }
```

##### Full response customization

If you want more control over the integration response, you can
provide an array of objects for the `response` value:

```yml
custom:
  apiGatewayServiceProxies:
    - dynamodb:
        path: /dynamodb
        method: get
        tableName: { Ref: 'YourTable' }
        hashKey:
          queryStringParam: id # use query string parameter
          attributeType: S
        rangeKey:
          queryStringParam: sort
          attributeType: S
        action: GetItem
        cors: true
        response:
          - statusCode: 200
            selectionPattern: '2\d{2}'
            responseParameters: {}
            responseTemplates:
              application/json: |-
                #set($item = $input.path('$.Item')){ "Item": $item }
```

### EventBridge

Sample syntax for EventBridge proxy in `serverless.yml`.

```yaml
custom:
  apiGatewayServiceProxies:
    - eventbridge: # source and detailType are hardcoded; detail defaults to POST body
        path: /eventbridge
        method: post
        source: 'hardcoded_source'
        detailType: 'hardcoded_detailType'
        eventBusName: { Ref: 'YourBusName' }
        cors: true
    - eventbridge: # source and detailType as path parameters
        path: /eventbridge/{detailTypeKey}/{sourceKey}
        method: post
        detailType:
          pathParam: detailTypeKey
        source:
          pathParam: sourceKey
        eventBusName: { Ref: 'YourBusName' }
        cors: true
    - eventbridge: # source, detail, and detailType as body parameters
        path: /eventbridge/{detailTypeKey}/{sourceKey}
        method: post
        detailType:
          bodyParam: data.detailType
        source:
          bodyParam: data.source
        detail:
          bodyParam: data.detail
        eventBusName: { Ref: 'YourBusName' }
        cors: true

resources:
  Resources:
    YourBus:
      Type: AWS::Events::EventBus
      Properties:
        Name: YourEventBus
```

Sample request after deploying.

```bash
curl https://xxxxxxx.execute-api.us-east-1.amazonaws.com/dev/eventbridge -d '{"message": "some data"}'  -H 'Content-Type:application/json'
```

## Common API Gateway features

### Enabling CORS

To set CORS configurations for your HTTP endpoints, simply modify your event configurations as follows:

```yml
custom:
  apiGatewayServiceProxies:
    - kinesis:
        path: /kinesis
        method: post
        streamName: { Ref: 'YourStream' }
        cors: true
```

Setting cors to true assumes a default configuration which is equivalent to:

```yml
custom:
  apiGatewayServiceProxies:
    - kinesis:
        path: /kinesis
        method: post
        streamName: { Ref: 'YourStream' }
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

Configuring the cors property sets Access-Control-Allow-Origin, Access-Control-Allow-Headers, Access-Control-Allow-Methods,Access-Control-Allow-Credentials headers in the CORS preflight response.
To enable the Access-Control-Max-Age preflight response header, set the maxAge property in the cors object:

```yml
custom:
  apiGatewayServiceProxies:
    - kinesis:
        path: /kinesis
        method: post
        streamName: { Ref: 'YourStream' }
        cors:
          origin: '*'
          maxAge: 86400
```

If you are using CloudFront or another CDN for your API Gateway, you may want to setup a Cache-Control header to allow for OPTIONS request to be cached to avoid the additional hop.

To enable the Cache-Control header on preflight response, set the cacheControl property in the cors object:

```yml
custom:
  apiGatewayServiceProxies:
    - kinesis:
        path: /kinesis
        method: post
        streamName: { Ref: 'YourStream' }
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
          cacheControl: 'max-age=600, s-maxage=600, proxy-revalidate' # Caches on browser and proxy for 10 minutes and doesnt allow proxy to serve out of date content
```

### Adding Authorization

You can pass in any supported authorization type:

```yml
custom:
  apiGatewayServiceProxies:
    - sqs:
        path: /sqs
        method: post
        queueName: { 'Fn::GetAtt': ['SQSQueue', 'QueueName'] }
        cors: true

        # optional - defaults to 'NONE'
        authorizationType: 'AWS_IAM' # can be one of ['NONE', 'AWS_IAM', 'CUSTOM', 'COGNITO_USER_POOLS']

        # when using 'CUSTOM' authorization type, one should specify authorizerId
        # authorizerId: { Ref: 'AuthorizerLogicalId' }
        # when using 'COGNITO_USER_POOLS' authorization type, one can specify a list of authorization scopes
        # authorizationScopes: ['scope1','scope2']

resources:
  Resources:
    SQSQueue:
      Type: 'AWS::SQS::Queue'
```

Source: [AWS::ApiGateway::Method docs](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-resource-apigateway-method.html#cfn-apigateway-method-authorizationtype)

### Enabling API Token Authentication

You can indicate whether the method requires clients to submit a valid API key using `private` flag:

```yml
custom:
  apiGatewayServiceProxies:
    - sqs:
        path: /sqs
        method: post
        queueName: { 'Fn::GetAtt': ['SQSQueue', 'QueueName'] }
        cors: true
        private: true

resources:
  Resources:
    SQSQueue:
      Type: 'AWS::SQS::Queue'
```

which is the same syntax used in Serverless framework.

Source: [Serverless: Setting API keys for your Rest API](https://serverless.com/framework/docs/providers/aws/events/apigateway/#setting-api-keys-for-your-rest-api)

Source: [AWS::ApiGateway::Method docs](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-resource-apigateway-method.html#cfn-apigateway-method-apikeyrequired)

### Using a Custom IAM Role

By default, the Framework will generate a role with the required permissions for each service type that is configured.

You can configure your own role by setting the `roleArn` attribute:

```yaml
custom:
  apiGatewayServiceProxies:
    - sqs:
        path: /sqs
        method: post
        queueName: { 'Fn::GetAtt': ['SQSQueue', 'QueueName'] }
        cors: true
        roleArn: # Optional. A default role is created when not configured
          Fn::GetAtt: [CustomS3Role, Arn]

resources:
  Resources:
    SQSQueue:
      Type: 'AWS::SQS::Queue'
    CustomS3Role:
      # Custom Role definition
      Type: 'AWS::IAM::Role'
```

### Customizing API Gateway parameters

You can specify which [parameters the API Gateway method accepts](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-resource-apigateway-method.html#cfn-apigateway-method-requestparameters).

A common use case is to pass custom data to the integration request:

```yaml
custom:
  apiGatewayServiceProxies:
    - sqs:
        path: /sqs
        method: post
        queueName: { 'Fn::GetAtt': ['SqsQueue', 'QueueName'] }
        cors: true
        acceptParameters:
          'method.request.header.Custom-Header': true
        requestParameters:
          'integration.request.querystring.MessageAttribute.1.Name': "'custom-Header'"
          'integration.request.querystring.MessageAttribute.1.Value.StringValue': 'method.request.header.Custom-Header'
          'integration.request.querystring.MessageAttribute.1.Value.DataType': "'String'"
resources:
  Resources:
    SqsQueue:
      Type: 'AWS::SQS::Queue'
```

Any published SQS message will have the `Custom-Header` value added as a message attribute.

### Customizing request body mapping templates

#### Kinesis

If you'd like to add content types or customize the default templates, you can do so by including your custom [API Gateway request mapping template](https://docs.aws.amazon.com/apigateway/latest/developerguide/api-gateway-mapping-template-reference.html) in `serverless.yml` like so:

```yml
# Required for using Fn::Sub
plugins:
  - serverless-cloudformation-sub-variables

custom:
  apiGatewayServiceProxies:
    - kinesis:
        path: /kinesis
        method: post
        streamName: { Ref: 'MyStream' }
        request:
          template:
            text/plain:
              Fn::Sub:
                - |
                  #set($msgBody = $util.parseJson($input.body))
                  #set($msgId = $msgBody.MessageId)
                  {
                      "Data": "$util.base64Encode($input.body)",
                      "PartitionKey": "$msgId",
                      "StreamName": "#{MyStreamArn}"
                  }
                - MyStreamArn:
                    Fn::GetAtt: [MyStream, Arn]
```

> It is important that the mapping template will return a valid `application/json` string

Source: [How to connect SNS to Kinesis for cross-account delivery via API Gateway](https://theburningmonk.com/2019/07/how-to-connect-sns-to-kinesis-for-cross-account-delivery-via-api-gateway/)

#### SQS

Customizing SQS request templates requires us to force all requests to use an `application/x-www-form-urlencoded` style body. The Framework sets the `Content-Type` header to `application/x-www-form-urlencoded` for you, but API Gateway will still look for the template under the `application/json` request template type, so that is where you need to configure your request body in `serverless.yml`:

```yml
custom:
  apiGatewayServiceProxies:
    - sqs:
        path: /{version}/event/receiver
        method: post
        queueName: { 'Fn::GetAtt': ['SqsQueue', 'QueueName'] }
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

Note that the `##` at the end of each line is an empty comment. In VTL this has the effect of stripping the newline from the end of the line (as it is commented out), which makes API Gateway read all the lines in the template as one line.

Be careful when mixing additional `requestParameters` into your SQS endpoint as you may overwrite the `integration.request.header.Content-Type` and stop the request template from being parsed correctly. You may also unintentionally create conflicts between parameters passed using `requestParameters` and those in your request template. Typically you should only use the request template if you need to manipulate the incoming request body in some way.

Your custom template must also set the `Action` and `MessageBody` parameters, as these will not be added for you by the Framework integration.

When using a custom request body, headers sent by a client will no longer be passed through to the SQS queue (`PassthroughBehavior` is automatically set to `NEVER`). You will need to pass through headers sent by the client explicitly in the request body. Also, any custom querystring parameters in the `requestParameters` array will be ignored. These also need to be added via the custom request body.

#### SNS

Similar to the [Kinesis](#kinesis-1) support, you can customize the default request mapping templates in `serverless.yml` like so:

```yml
# Required for using Fn::Sub
plugins:
  - serverless-cloudformation-sub-variables

custom:
  apiGatewayServiceProxies:
    - kinesis:
        path: /sns
        method: post
        topicName: { 'Fn::GetAtt': ['SNSTopic', 'TopicName'] }
        request:
          template:
            application/json:
              Fn::Sub:
                - "Action=Publish&Message=$util.urlEncode('This is a fixed message')&TopicArn=$util.urlEncode('#{MyTopicArn}')"
                - MyTopicArn: { Ref: MyTopic }
```

> It is important that the mapping template will return a valid `application/x-www-form-urlencoded` string

Source: [Connect AWS API Gateway directly to SNS using a service integration](https://www.alexdebrie.com/posts/aws-api-gateway-service-proxy/)

### Custom response body mapping templates

You can customize the response body by providing mapping templates for success, server errors (5xx) and client errors (4xx).

> Templates must be in JSON format. If a template isn't provided, the integration response will be returned as-is to the client.

#### Kinesis Example

```yml
custom:
  apiGatewayServiceProxies:
    - kinesis:
        path: /kinesis
        method: post
        streamName: { Ref: 'MyStream' }
        response:
          template:
            success: |
              {
                "success": true
              }
            serverError: |
              {
                "success": false,
                "errorMessage": "Server Error"
              }
            clientError: |
              {
                "success": false,
                "errorMessage": "Client Error"
              }
```
