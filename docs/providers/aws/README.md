<!--
title: Serverless AWS Documentation
layout: Page
-->

# Serverless AWS Documentation

Check out the [Getting started guide](../../getting-started) and the [CLI reference](../../cli-reference) for an introduction to Serverless.

## [Setup and configuration](./01-setup.md)

Please follow these [setup instructions](./01-setup.md) to start using AWS Lambda and serverless together

## Provider configuration

Following are examples and descriptions of all available AWS specific provider configuration settings.

```yaml
provider:
  name: aws # Set the provider you want to use, in this case AWS
  runtime: nodejs4.3 # Runtime used for all functions in this provider
  stage: dev # Set the default stage used. Default is dev
  region: us-east-1 # Overwrite the default region used. Default is us-east-1
  variableSyntax: '\${{([\s\S]+?)}}' # Overwrite the default "${}" variable syntax to be "${{}}" instead. This can be helpful if you want to use "${}" as a string without using it as a variable.
```

## Additional function configuration

```yaml
functions:
  hello:
    name: ${self:provider.stage}-lambdaName # Deployed Lambda name
    handler: handler.hello # handler set in AWS Lambda
    memorySize: 512 # optional, default is 1024
    timeout: 10 # optional, default is 6
```

## General Configuration
* [Configuring IAM resources](02-iam.md)
* [VPC configuration](03-vpc.md)
* [Cloudformation Resource naming reference](./04-resource-names-reference.md)

## AWS events

* [API Gateway](./events/01-api-gateway.md)
* [S3](./events/02-s3.md)
* [Schedule](./events/03-schedule.md)
* [SNS](./events/04-sns.md)
* [Kinesis Streams](./events/05-kinesis-streams.md)
* [Dynamodb Streams](./events/06-dynamodb-streams.md)

## [Examples](./examples)

See the examples folder for all AWS serverless examples

- [hello-world](./examples/hello-world)
- [using-external-libraries](./examples/using-external-libraries)
- [web-api](./examples/web-api)

To add examples, fork this repo and submit a pull request
