<!--
title: Serverless Framework - AWS Lambda Guide - Functions
menuText: Functions
menuOrder: 5
description: How to configure AWS Lambda functions in the Serverless Framework
layout: Doc
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/aws/guide/functions)

<!-- DOCS-SITE-LINK:END -->

# AWS - Functions

If you are using AWS as a provider, all _functions_ inside the service are AWS Lambda functions.

## Configuration

All of the Lambda functions in your serverless service can be found in `serverless.yml` under the `functions` property.

```yml
# serverless.yml
service: myService

provider:
  name: aws
  runtime: nodejs12.x
  memorySize: 512 # optional, in MB, default is 1024
  timeout: 10 # optional, in seconds, default is 6
  versionFunctions: false # optional, default is true
  tracing:
    lambda: true # optional, enables tracing for all functions (can be true (true equals 'Active') 'Active' or 'PassThrough')

functions:
  hello:
    handler: handler.hello # required, handler set in AWS Lambda
    name: ${sls:stage}-lambdaName # optional, Deployed Lambda name
    description: Description of what the lambda function does # optional, Description to publish to AWS
    runtime: python2.7 # optional overwrite, default is provider runtime
    memorySize: 512 # optional, in MB, default is 1024
    timeout: 10 # optional, in seconds, default is 6
    provisionedConcurrency: 3 # optional, Count of provisioned lambda instances
    reservedConcurrency: 5 # optional, reserved concurrency limit for this function. By default, AWS uses account concurrency limit
    tracing: PassThrough # optional, overwrite, can be 'Active' or 'PassThrough'
```

The `handler` property points to the file and module containing the code you want to run in your function.

```javascript
// handler.js
module.exports.functionOne = function (event, context, callback) {};
```

You can add as many functions as you want within this property.

```yml
# serverless.yml

service: myService

provider:
  name: aws
  runtime: nodejs12.x

functions:
  functionOne:
    handler: handler.functionOne
    description: optional description for your Lambda
  functionTwo:
    handler: handler.functionTwo
  functionThree:
    handler: handler.functionThree
```

Your functions can either inherit their settings from the `provider` property.

```yml
# serverless.yml
service: myService

provider:
  name: aws
  runtime: nodejs12.x
  memorySize: 512 # will be inherited by all functions

functions:
  functionOne:
    handler: handler.functionOne
```

Or you can specify properties at the function level.

```yml
# serverless.yml
service: myService

provider:
  name: aws
  runtime: nodejs12.x

functions:
  functionOne:
    handler: handler.functionOne
    memorySize: 512 # function specific
```

You can specify an array of functions, which is useful if you separate your functions in to different files:

```yml
# serverless.yml
---
functions:
  - ${file(./foo-functions.yml)}
  - ${file(./bar-functions.yml)}
```

```yml
# foo-functions.yml
getFoo:
  handler: handler.foo
deleteFoo:
  handler: handler.foo
```

## Permissions

Every AWS Lambda function needs permission to interact with other AWS infrastructure resources within your account. These permissions are set via an AWS IAM Role. You can set permission policy statements within this role via the `provider.iam.role.statements` property.

```yml
# serverless.yml
service: myService

provider:
  name: aws
  runtime: nodejs12.x
  iam:
    role:
      statements: # permissions for all of your functions can be set here
        - Effect: Allow
          Action: # Gives permission to DynamoDB tables in a specific region
            - dynamodb:DescribeTable
            - dynamodb:Query
            - dynamodb:Scan
            - dynamodb:GetItem
            - dynamodb:PutItem
            - dynamodb:UpdateItem
            - dynamodb:DeleteItem
          Resource: 'arn:aws:dynamodb:us-east-1:*:*'

functions:
  functionOne:
    handler: handler.functionOne
    memorySize: 512
```

Another example:

```yml
# serverless.yml
service: myService
provider:
  name: aws
  iam:
    role:
      statements:
        - Effect: 'Allow'
          Action:
            - 's3:ListBucket'
          # You can put CloudFormation syntax in here.  No one will judge you.
          # Remember, this all gets translated to CloudFormation.
          Resource: { 'Fn::Join': ['', ['arn:aws:s3:::', { 'Ref': 'ServerlessDeploymentBucket' }]] }
        - Effect: 'Allow'
          Action:
            - 's3:PutObject'
          Resource:
            Fn::Join:
              - ''
              - - 'arn:aws:s3:::'
                - 'Ref': 'ServerlessDeploymentBucket'
                - '/*'

functions:
  functionOne:
    handler: handler.functionOne
    memorySize: 512
```

You can also use an existing IAM role by adding your IAM Role ARN in the `role` property. For example:

```yml
# serverless.yml
service: new-service
provider:
  name: aws
  role: arn:aws:iam::YourAccountNumber:role/YourIamRole
```

See the documentation about [IAM](./iam.md) for function level IAM roles.

## Referencing container image as a target

Alternatively lambda environment can be configured through docker images. Image published to AWS ECR registry can be referenced as lambda source (check [AWS Lambda – Container Image Support](https://aws.amazon.com/blogs/aws/new-for-aws-lambda-container-image-support/)). In addition, you can also define your own images that will be built locally and uploaded to AWS ECR registry.

Serverless will create an ECR repository for your image, but it currently does not manage updates to it. An ECR repository is created only for new services or the first time that a function configured with an `image` is deployed. In service configuration, you can configure the ECR repository to scan for CVEs via the `provider.ecr.scanOnPush` property, which is `false` by default. (See [documentation](https://docs.aws.amazon.com/AmazonECR/latest/userguide/image-scanning.html))

In service configuration, images can be configured via `provider.ecr.images`. To define an image that will be built locally, you need to specify `path` property, which should point to valid docker context directory. Optionally, you can also set `file` to specify Dockerfile that should be used when building an image. It is also possible to define images that already exist in AWS ECR repository. In order to do that, you need to define `uri` property, which should follow `<account>.dkr.ecr.<region>.amazonaws.com/<repository>@<digest>` or `<account>.dkr.ecr.<region>.amazonaws.com/<repository>:<tag>` format. Additionally, with `buildArgs` property, you can define arguments that will be passed to `docker build` command with `--build-arg` flag. They might be later referenced via `ARG` within your `Dockerfile`. The `cacheFrom` property can be used to specify which images to use as a source for layer caching in the `docker build` command with `--cache-from` flag. When `uri` is defined for an image, `buildArgs` and `cacheFrom` cannot be defined.

Example configuration

```yml
service: service-name
provider:
  name: aws
  ecr:
    scanOnPush: true
    images:
      baseimage:
        path: ./path/to/context
        file: Dockerfile.dev
        buildArgs:
          STAGE: ${opt:stage}
        cacheFrom:
          - my-image:latest
      anotherimage:
        uri: 000000000000.dkr.ecr.sa-east-1.amazonaws.com/test-lambda-docker@sha256:6bb600b4d6e1d7cf521097177dd0c4e9ea373edb91984a505333be8ac9455d38
```

When configuring functions, images should be referenced via `image` property, which can point to an image already defined in `provider.ecr.images` or directly to an existing AWS ECR image, following the same format as `uri` above.
Both `handler` and `runtime` properties are not supported when `image` is used.

Example configuration:

```yml
service: service-name
provider:
  name: aws
  ecr:
    images:
      baseimage:
        path: ./path/to/context

functions:
  hello:
    image: 000000000000.dkr.ecr.sa-east-1.amazonaws.com/test-lambda-docker@sha256:6bb600b4d6e1d7cf521097177dd0c4e9ea373edb91984a505333be8ac9455d38
  world:
    image: baseimage
```

It is also possible to provide additional image configuration via `workingDirectory`, `entryPoint` and `command` properties of to `functions[].image`. The `workingDirectory` accepts path in form of string, where both `entryPoint` and `command` needs to be defined as a list of strings, following "exec form" format. In order to provide additional image config properties, `functions[].image` has to be defined as an object, and needs to define either `uri` pointing to an existing AWS ECR image or `name` property, which references image already defined in `provider.ecr.images`.

Example configuration:

```yml
service: service-name
provider:
  name: aws
  ecr:
    images:
      baseimage:
        path: ./path/to/context

functions:
  hello:
    image:
      uri: 000000000000.dkr.ecr.sa-east-1.amazonaws.com/test-lambda-docker@sha256:6bb600b4d6e1d7cf521097177dd0c4e9ea373edb91984a505333be8ac9455d38
      workingDirectory: /workdir
      command:
        - executable
        - flag
      entryPoint:
        - executable
        - flag
  world:
    image:
      name: baseimage
      command:
        - command
      entryPoint:
        - executable
        - flag
```

During the first deployment when locally built images are used, Framework will automatically create a dedicated ECR repository to store these images, with name `serverless-<service>-<stage>`. Currently, the Framework will not remove older versions of images uploaded to ECR as they still might be in use by versioned functions. During `sls remove`, the created ECR repository will be removed. During deployment, Framework will attempt to `docker login` to ECR if needed. Depending on your local configuration, docker authorization token might be stored unencrypted. Please refer to documentation for more details: https://docs.docker.com/engine/reference/commandline/login/#credentials-store

## VPC Configuration

You can add VPC configuration to a specific function in `serverless.yml` by adding a `vpc` object property in the function configuration. This object should contain the `securityGroupIds` and `subnetIds` array properties needed to construct VPC for this function. Here's an example configuration:

```yml
# serverless.yml
service: service-name
provider: aws

functions:
  hello:
    handler: handler.hello
    vpc:
      securityGroupIds:
        - securityGroupId1
        - securityGroupId2
      subnetIds:
        - subnetId1
        - subnetId2
```

Or if you want to apply VPC configuration to all functions in your service, you can add the configuration to the higher level `provider` object, and overwrite these service level config at the function level. For example:

```yml
# serverless.yml
service: service-name
provider:
  name: aws
  vpc:
    securityGroupIds:
      - securityGroupId1
      - securityGroupId2
    subnetIds:
      - subnetId1
      - subnetId2

functions:
  hello: # this function will overwrite the service level vpc config above
    handler: handler.hello
    vpc:
      securityGroupIds:
        - securityGroupId1
        - securityGroupId2
      subnetIds:
        - subnetId1
        - subnetId2
  users: # this function will inherit the service level vpc config above
    handler: handler.users
```

Then, when you run `serverless deploy`, VPC configuration will be deployed along with your lambda function.

**VPC IAM permissions**

The Lambda function execution role must have permissions to create, describe and delete [Elastic Network Interfaces](http://docs.aws.amazon.com/AmazonVPC/latest/UserGuide/VPC_ElasticNetworkInterfaces.html) (ENI). When VPC configuration is provided the default AWS `AWSLambdaVPCAccessExecutionRole` will be associated with your Lambda execution role. In case custom roles are provided be sure to include the proper [ManagedPolicyArns](http://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-resource-iam-role.html#cfn-iam-role-managepolicyarns). For more information please check [configuring a Lambda Function for Amazon VPC Access](http://docs.aws.amazon.com/lambda/latest/dg/vpc.html)

**VPC Lambda Internet Access**

By default, when a Lambda function is executed inside a VPC, it loses internet access and some resources inside AWS may become unavailable. In order for S3 resources and [DynamoDB](https://serverless.com/dynamodb/) resources to be available for your Lambda function running inside the VPC, a VPC end point needs to be created. For more information please check [VPC Endpoint for Amazon S3](https://aws.amazon.com/blogs/aws/new-vpc-endpoint-for-amazon-s3/).
In order for other services such as Kinesis streams to be made available, a NAT Gateway needs to be configured inside the subnets that are being used to run the Lambda, for the VPC used to execute the Lambda. For more information, please check [Enable Outgoing Internet Access within VPC](https://medium.com/@philippholly/aws-lambda-enable-outgoing-internet-access-within-vpc-8dd250e11e12)

## Environment Variables

You can add environment variable configuration to a specific function in `serverless.yml` by adding an `environment` object property in the function configuration. This object should contain a key-value pairs of string to string:

```yml
# serverless.yml
service: service-name
provider: aws

functions:
  hello:
    handler: handler.hello
    environment:
      TABLE_NAME: tableName
```

Or if you want to apply environment variable configuration to all functions in your service, you can add the configuration to the higher level `provider` object. Environment variables configured at the function level are merged with those at the provider level, so your function with specific environment variables will also have access to the environment variables defined at the provider level. If an environment variable with the same key is defined at both the function and provider levels, the function-specific value overrides the provider-level default value. For example:

```yml
# serverless.yml
service: service-name
provider:
  name: aws
  environment:
    SYSTEM_NAME: mySystem
    TABLE_NAME: tableName1

functions:
  hello:
    # this function will have SYSTEM_NAME=mySystem and TABLE_NAME=tableName1 from the provider-level environment config above
    handler: handler.hello
  users:
    # this function will have SYSTEM_NAME=mySystem from the provider-level environment config above
    # but TABLE_NAME will be tableName2 because this more specific config will override the default above
    handler: handler.users
    environment:
      TABLE_NAME: tableName2
```

If you want your function's environment variables to have the same values from your machine's environment variables, please read the documentation about [Referencing Environment Variables](./variables.md).

## Tags

Using the `tags` configuration makes it possible to add `key` / `value` tags to your functions.

Those tags will appear in your AWS console and make it easier for you to group functions by tag or find functions with a common tag.

```yml
functions:
  hello:
    handler: handler.hello
    tags:
      foo: bar
```

Or if you want to apply tags configuration to all functions in your service, you can add the configuration to the higher level `provider` object. Tags configured at the function level are merged with those at the provider level, so your function with specific tags will get the tags defined at the provider level. If a tag with the same key is defined at both the function and provider levels, the function-specific value overrides the provider-level default value. For example:

```yml
# serverless.yml
service: service-name
provider:
  name: aws
  tags:
    foo: bar
    baz: qux

functions:
  hello:
    # this function will inherit the service level tags config above
    handler: handler.hello
  users:
    # this function will overwrite the foo tag and inherit the baz tag
    handler: handler.users
    tags:
      foo: quux
```

Real-world use cases where tagging your functions is helpful include:

- Cost estimations (tag functions with an environment tag: `environment: Production`)
- Keeping track of legacy code (e.g. tag functions which use outdated runtimes: `runtime: nodejs0.10`)
- ...

## Layers

Using the `layers` configuration makes it possible for your function to use
[Lambda Layers](https://aws.amazon.com/blogs/aws/new-for-aws-lambda-use-any-programming-language-and-share-common-components/)

```yml
functions:
  hello:
    handler: handler.hello
    layers:
      - arn:aws:lambda:region:XXXXXX:layer:LayerName:Y
```

Layers can be used in combination with `runtime: provided` to implement your own custom runtime on
AWS Lambda.

To publish Lambda Layers, check out the [Layers](./layers.md) documentation.

## Log Group Resources

By default, the framework will create LogGroups for your Lambdas. This makes it easy to clean up your log groups in the case you remove your service, and make the lambda IAM permissions much more specific and secure.

You can opt out of the default behavior by setting `disableLogs: true`

```yml
functions:
  hello:
    handler: handler.hello
    disableLogs: true
```

## Versioning Deployed Functions

By default, the framework creates function versions for every deploy. This behavior is optional, and can be turned off in cases where you don't invoke past versions by their qualifier. If you would like to do this, you can invoke your functions as `arn:aws:lambda:....:function/myFunc:3` to invoke version 3 for example.

Versions are not cleaned up by serverless, so make sure you use a plugin or other tool to prune sufficiently old versions. The framework can't clean up versions because it doesn't have information about whether older versions are invoked or not. This feature adds to the number of total stack outputs and resources because a function version is a separate resource from the function it refers to.

To turn off function versioning, set the provider-level option `versionFunctions`.

```yml
provider:
  versionFunctions: false
```

## Dead Letter Queue (DLQ)

When AWS lambda functions fail, they are [retried](http://docs.aws.amazon.com/lambda/latest/dg/retries-on-errors.html). If the retries also fail, AWS has a feature to send information about the failed request to a SNS topic or SQS queue, called the [Dead Letter Queue](http://docs.aws.amazon.com/lambda/latest/dg/dlq.html), which you can use to track and diagnose and react to lambda failures.

You can setup a dead letter queue for your serverless functions with the help of a SNS topic and the `onError` config parameter.

**Note:** You can only provide one `onError` config per function.

### DLQ with SNS

The SNS topic needs to be created beforehand and provided as an `arn` on the function level.

```yml
service: service

provider:
  name: aws
  runtime: nodejs12.x

functions:
  hello:
    handler: handler.hello
    onError: arn:aws:sns:us-east-1:XXXXXX:test # Ref, Fn::GetAtt and Fn::ImportValue are supported as well
```

### DLQ with SQS

Although Dead Letter Queues support both SNS topics and SQS queues, the `onError` config currently only supports SNS topic arns due to a race condition when using SQS queue arns and updating the IAM role.

We're working on a fix so that SQS queue arns will be supported in the future.

## KMS Keys

[AWS Lambda](https://serverless.com/aws-lambda/) uses [AWS Key Management Service (KMS)](https://aws.amazon.com/kms/) to encrypt your environment variables at rest.

The `awsKmsKeyArn` config variable enables you a way to define your own KMS key which should be used for encryption.

```yml
service:
  name: service-name
  awsKmsKeyArn: arn:aws:kms:us-east-1:XXXXXX:key/some-hash

provider:
  name: aws
  environment:
    TABLE_NAME: tableName1

functions:
  hello: # this function will OVERWRITE the service level environment config above
    handler: handler.hello
    awsKmsKeyArn: arn:aws:kms:us-east-1:XXXXXX:key/some-hash
    environment:
      TABLE_NAME: tableName2
  goodbye: # this function will INHERIT the service level environment config above
    handler: handler.goodbye
```

### Secrets using environment variables and KMS

When storing secrets in environment variables, AWS [strongly suggests](http://docs.aws.amazon.com/lambda/latest/dg/env_variables.html#env-storing-sensitive-data) encrypting sensitive information. AWS provides a [tutorial](http://docs.aws.amazon.com/lambda/latest/dg/tutorial-env_console.html) on using KMS for this purpose.

## AWS X-Ray Tracing

You can enable [AWS X-Ray Tracing](https://docs.aws.amazon.com/xray/latest/devguide/aws-xray.html) on your Lambda functions through the optional `tracing` config variable:

```yml
service: myService

provider:
  name: aws
  runtime: nodejs12.x
  tracing:
    lambda: true
```

You can also set this variable on a per-function basis. This will override the provider level setting if present:

```yml
functions:
  hello:
    handler: handler.hello
    tracing: Active
  goodbye:
    handler: handler.goodbye
    tracing: PassThrough
```

## Asynchronous invocation

When intention is to invoke function asynchronously you may want to configure following additional settings:

### Destinations

[destination targets](https://docs.aws.amazon.com/lambda/latest/dg/invocation-async.html#invocation-async-destinations)

Target can be the other lambdas you also deploy with a service or other qualified target (externally managed lambda, EventBridge event bus, SQS queue or SNS topic) which you can address via its ARN

```yml
functions:
  asyncHello:
    handler: handler.asyncHello
    destinations:
      onSuccess: otherFunctionInService
      onFailure: arn:aws:sns:us-east-1:xxxx:some-topic-name
```

### Maximum Event Age and Maximum Retry Attempts

`maximumEventAge` accepts values between 60 seconds and 6 hours, provided in seconds.
`maximumRetryAttempts` accepts values between 0 and 2.

```yml
functions:
  asyncHello:
    handler: handler.asyncHello
    maximumEventAge: 7200
    maximumRetryAttempts: 1
```

## EFS Configuration

You can use [Amazon EFS with Lambda](https://docs.aws.amazon.com/lambda/latest/dg/services-efs.html) by adding a `fileSystemConfig` property in the function configuration in `serverless.yml`. `fileSystemConfig` should be an object that contains the `arn` and `localMountPath` properties. The `arn` property should reference an existing EFS Access Point, where the `localMountPath` should specify the absolute path under which the file system will be mounted. Here's an example configuration:

```yml
# serverless.yml
service: service-name
provider: aws

functions:
  hello:
    handler: handler.hello
    fileSystemConfig:
      localMountPath: /mnt/example
      arn: arn:aws:elasticfilesystem:us-east-1:111111111111:access-point/fsap-0d0d0d0d0d0d0d0d0
    vpc:
      securityGroupIds:
        - securityGroupId1
      subnetIds:
        - subnetId1
```
