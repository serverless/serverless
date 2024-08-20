<!--
title: Serverless Framework - Variables - CloudFormation Stack Outputs
description: How to reference AWS CloudFormation Stack Outputs in the Serverless Framework for enhanced service integration.
short_title: Serverless Variables - CloudFormation Outputs
keywords:
  [
    'Serverless Framework',
    'CloudFormation Stack Outputs',
    'AWS',
    'configuration',
    'deployment',
  ]
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/guides/variables/cf-stack)

<!-- DOCS-SITE-LINK:END -->

# Reference AWS CloudFormation Stack Outputs

You can reference CloudFormation stack output values as the source of your variables to use in your service with the `cf:stackName.outputKey` syntax. For example:

```yml
service: new-service
provider: aws
functions:
  hello:
    name: ${cf:another-service-dev.functionPrefix}-hello
    handler: handler.hello
  world:
    name: ${cf:another-stack.functionPrefix}-world
    handler: handler.world
```

In that case, the framework will fetch the values of those `functionPrefix` outputs from the provided stack names and populate your variables. There are many use cases for this functionality and it allows your service to communicate with other services/stacks.

You can add such custom output to CloudFormation stack. For example:

```yml
service: another-service
provider:
  name: aws
  runtime: nodejs14.x
  region: ap-northeast-1
  memorySize: 512
functions:
  hello:
    name: ${self:custom.functionPrefix}hello
    handler: handler.hello
custom:
  functionPrefix: 'my-prefix-'
resources:
  Outputs:
    functionPrefix:
      Value: ${self:custom.functionPrefix}
      Export:
        Name: functionPrefix
    memorySize:
      Value: ${self:provider.memorySize}
      Export:
        Name: memorySize
```

You can also reference CloudFormation stack in another regions with the `cf(REGION):stackName.outputKey` syntax. For example:

```yml
service: new-service
provider: aws
functions:
  hello:
    name: ${cf(us-west-2):another-service-dev.functionPrefix}-hello
    handler: handler.hello
  world:
    name: ${cf(ap-northeast-1):another-stack.functionPrefix}-world
    handler: handler.world
```

You can reference [CloudFormation stack outputs export values](http://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/outputs-section-structure.html) as well. For example:

```yml
# Make sure you set export value in StackA.

  Outputs:
    DynamoDbTable:
      Value:
        "Ref": DynamoDbTable
      Export:
        Name: DynamoDbTable-${self:custom.stage}

# Then you can reference the export name in StackB

provider:
  environment:
    Table:
        'Fn::ImportValue': 'DynamoDbTable-${self:custom.stage}'
```

## AWS CloudFormation Pseudo Parameters and Intrinsic functions

[AWS Pseudo Parameters](http://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/pseudo-parameter-reference.html)
can be used in values which are passed through as is to CloudFormation template properties.

Otherwise Serverless Framework has no implied understanding of them and does not try to resolve them on its own.

Same handling applies to [CloudFormation Intrinsic functions](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/intrinsic-function-reference.html)
