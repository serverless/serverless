<!--
title: SNS Event configuration docs
layout: Page
-->

# DynamoDB Streams

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
