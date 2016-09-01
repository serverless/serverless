<!--
title: Kinesis Streams Event configuration
layout: Page
-->

# Kinesis Streams

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
