<!--
title: Serverless AWS Documentation
menuText: AWS Documentation
layout: Doc
-->

# Serverless AWS Documentation

Check out the [Getting started guide](../../01-guide/README.md) and the [CLI reference](../../03-cli-reference/README.md) for an introduction to Serverless.

## Setup and configuration

Please follow these [setup instructions](./01-setup.md) to start using AWS Lambda and serverless together

## Provider configuration

Following are examples and descriptions of all available AWS specific provider configuration settings.

```yaml
provider:
  name: aws # Set the provider you want to use, in this case AWS
  runtime: nodejs4.3 # Runtime used for all functions in this provider
  stage: dev # Set the default stage used. Default is dev
  region: us-east-1 # Overwrite the default region used. Default is us-east-1
  deploymentBucket: com.serverless.${self:provider.region}.deploys # Overwrite the default deployment bucket
  variableSyntax: '\${{([\s\S]+?)}}' # Overwrite the default "${}" variable syntax to be "${{}}" instead. This can be helpful if you want to use "${}" as a string without using it as a variable.
```

### Deployment S3Bucket
The bucket must exist beforehand and be in the same region as the deploy.

## Additional function configuration

```yaml
functions:
  hello:
    name: ${self:provider.stage}-lambdaName # Deployed Lambda name
    description: Description of what the lambda function does # Description to publish to AWS
    handler: handler.hello # handler set in AWS Lambda
    memorySize: 512 # optional, default is 1024
    timeout: 10 # optional, default is 6
```

## General Configuration
* [Configuring IAM resources](./02-iam.md)
* [VPC configuration](./03-vpc.md)
* [Cloudformation Resource naming reference](./04-resource-names-reference.md)

## AWS events

* [API Gateway](./events/01-apigateway.md)
* [S3](./events/02-s3.md)
* [Schedule](./events/03-schedule.md)
* [SNS](./events/04-sns.md)
* [Kinesis Streams](./events/05-kinesis-streams.md)
* [Dynamodb Streams](./events/06-dynamodb-streams.md)

## Examples

See the [examples folder](./examples) for all AWS serverless examples

- [hello-world](./examples/hello-world)
- [using-external-libraries](./examples/using-external-libraries)
- [web-api](./examples/web-api)

To add examples, fork this repo and submit a pull request
