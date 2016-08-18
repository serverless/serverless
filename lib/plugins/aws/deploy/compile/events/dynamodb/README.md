# Compile DynamoDB Stream Events

We're currently gathering feedback regarding the exact implementation of this plugin in the following GitHub issue:

[Issue #1441](https://github.com/serverless/serverless/issues/1441)

It would be great if you can chime in on this and give us feedback on your specific use case and how you think the plugin
should work.

In the meantime you can simply add the code below to the [custom provider resources](/docs/guide/custom-provider-resources.md)
section in your [`serverless.yml`](/docs/understanding-serverless/serverless-yml.md) file.

## Template code for DynamoDB Stream support

Add the following code to your [`serverless.yml`](/docs/understanding-serverless/serverless-yml.md) file to setup
DynamoDB Stream support.

**Note:** You can also create the table in the `resources.Resources` section and use `Fn::GetAtt` to reference the `StreamArn`
in the mappings `EventSourceArn` definition.

```yml
# serverless.yml

resources
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
