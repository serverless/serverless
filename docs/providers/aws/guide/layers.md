<!--
title: Serverless Framework - AWS Lambda Guide - Layers
menuText: Layers
menuOrder: 7
description: How to configure AWS Lambda layers in the Serverless Framework
layout: Doc
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/aws/guide/layers)

<!-- DOCS-SITE-LINK:END -->

# AWS - Layers

If you are using AWS as a provider, all _layers_ inside the service are [AWS Lambda
layers](https://aws.amazon.com/blogs/aws/new-for-aws-lambda-use-any-programming-language-and-share-common-components/).

## Configuration

All of the Lambda layers in your serverless service can be found in `serverless.yml` under the `layers` property.

```yml
# serverless.yml
service: myService

provider:
  name: aws

layers:
  hello:
    path: layer-dir # required, path to layer contents on disk
    name: ${self:provider.stage}-layerName # optional, Deployed Lambda layer name
    description: Description of what the lambda layer does # optional, Description to publish to AWS
    compatibleRuntimes: # optional, a list of runtimes this layer is compatible with
      - python3.8
    licenseInfo: GPLv3 # optional, a string specifying license information
    allowedAccounts: # optional, a list of AWS account IDs allowed to access this layer.
      - '*'
    retain: false # optional, false by default. If true, layer versions are not deleted as new ones are created
```

You can add up to 5 layers as you want within this property.

```yml
# serverless.yml

service: myService

provider:
  name: aws

layers:
  layerOne:
    path: layerOne
    description: optional description for your layer
  layerTwo:
    path: layerTwo
  layerThree:
    path: layerThree
```

Your layers can either inherit their packaging settings from the global `package` property.

```yml
# serverless.yml
service: myService

provider:
  name: aws

package:
  exclude:
    - layerSourceTarball.tar.gz

layers:
  layerOne:
    path: layerOne
```

Or you can specify them at the layer level.

```yml
# serverless.yml
service: myService

provider:
  name: aws

layers:
  layerOne:
    path: layerOne
    package:
      exclude:
        - layerSourceTarball.tar.gz
```

You can also specify a prebuilt archive to create your layer. When you do this, you do not need to specify the `path` element of your layer.

```yml
# serverless.yml
service: myService

provider:
  name: aws

layers:
  layerOne:
    package:
      artifact: layerSource.zip
```

## Permissions

You can make your layers usable by other accounts by setting the `allowedAccounts` property:

```yml
# serverless.yml
service: myService

provider:
  name: aws

layers:
  layerOne:
    path: layerOne
    allowedAccounts:
      - 111111111111 # a specific account ID
      - 222222222222 # a different specific account ID
```

Another example, making the layer publicly accessible:

```yml
# serverless.yml
service: myService

provider:
  name: aws

layers:
  layerOne:
    path: layerOne
    allowedAccounts:
      - '*' # ALL accounts!
```

## Using your layers

Using the `layers` configuration key in a function makes it possible for your layer with a function

```yml
functions:
  hello:
    handler: handler.hello
    layers:
      - arn:aws:lambda:region:XXXXXX:layer:LayerName:Y
```

To use a layer with a function in the same service, use a CloudFormation Ref. The name of your layer
in the CloudFormation template will be your layer name
[TitleCased](https://en.wikipedia.org/wiki/Letter_case#Title_Case) (without spaces) and have
`LambdaLayer` appended to the end. EG:

```yml
layers:
  test:
    path: layer
functions:
  hello:
    handler: handler.hello
    layers:
      - { Ref: TestLambdaLayer }
```
