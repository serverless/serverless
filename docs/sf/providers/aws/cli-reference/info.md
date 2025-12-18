<!--
title: Serverless Framework Commands - AWS Lambda - Info
description: Display information about your deployed service and AWS Lambda functions, events, and resources it contains.
short_title: Commands - Info
keywords:
  [
    'Serverless',
    'Framework',
    'AWS',
    'Lambda',
    'Info',
    'Service Information',
    'CloudFormation',
    'Stack Outputs',
  ]
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/aws/cli-reference/info)

<!-- DOCS-SITE-LINK:END -->

# AWS - Info

Displays information about the deployed service.

```bash
serverless info
```

## Options

- `--stage` or `-s` The stage in your service you want to display information about.
- `--region` or `-r` The region in your stage that you want to display information about.
- `--aws-profile` The AWS profile you want to use.
- `--json` Output the information in JSON format.
- `--verbose` Shows displays any Stack Output.

## Provided lifecycle events

- `info:info`

## Examples

### AWS

On AWS the info plugin uses the `Outputs` section of the CloudFormation stack and the AWS SDK to gather the necessary information.
See the example below for an example output.

**Example:**

```bash
$ serverless info

Service Information
service: my-serverless-service
stage: dev
region: us-east-1
api keys:
  myKey: some123valid456api789key1011for1213api1415gateway
endpoints:
  GET - https://dxaynpuzd4.execute-api.us-east-1.amazonaws.com/dev/users
functions:
  my-serverless-service-dev-hello
```

#### Verbose

When using the `--verbose` flag, the `info` command will also append all Stack Outputs to the output:

```bash
$ serverless info --verbose

Service Information
service: my-serverless-service
stage: dev
region: us-east-1
api keys:
  myKey: some123valid456api789key1011for1213api1415gateway
endpoints:
  GET - https://dxaynpuzd4.execute-api.us-east-1.amazonaws.com/dev/users
functions:
  my-serverless-service-dev-hello

Stack Outputs
CloudFrontUrl: d2d10e2tyk1pei.cloudfront.net
ScreenshotBucket: dev-svdgraaf-screenshots
ServiceEndpoint: https://12341jc801.execute-api.us-east-1.amazonaws.com/dev
ServerlessDeploymentBucketName: lambda-screenshots-dev-serverlessdeploymentbucket-15b7pkc04f98a
```

#### JSON

When using the `--json` flag, the `info` command will output the information in JSON format:

```bash
$ serverless info --json

{
  "info": {
    "functions": [
      {
        "name": "hello",
        "deployedName": "my-serverless-service-dev-hello"
      }
    ],
    "layers": [],
    "endpoints": [
      "httpApi: https://mnpgyjhfqj.execute-api.us-east-1.amazonaws.com"
    ],
    "service": "my-serverless-service",
    "stage": "dev",
    "region": "us-east-1",
    "stack": "my-serverless-service-dev",
    "resourceCount": 4,
    "apiKeys": []
  },
  "outputs": [
    {
      "OutputKey": "HelloLambdaFunctionQualifiedArn",
      "OutputValue": "arn:aws:lambda:us-east-1:012345678901:function:my-serverless-service-dev-hello:26",
      "Description": "Current Lambda function version",
      "ExportName": "sls-my-serverless-service-dev-hello-HelloLambdaFunctionQualifiedArn"
    },
    {
      "OutputKey": "ServerlessDeploymentBucketName",
      "OutputValue": "serverless-framework-deployments-us-east-1-d7b2bf38-2784",
      "ExportName": "sls-my-serverless-service-dev-ServerlessDeploymentBucketName"
    },
    {
      "OutputKey": "HttpApiId",
      "OutputValue": "mnpgyjhfqj",
      "Description": "Id of the HTTP API",
      "ExportName": "sls-my-serverless-service-dev-HttpApiId"
    },
    {
      "OutputKey": "HttpApiUrl",
      "OutputValue": "https://mnpgyjhfqj.execute-api.us-east-1.amazonaws.com",
      "Description": "URL of the HTTP API",
      "ExportName": "sls-my-serverless-service-dev-HttpApiUrl"
    }
  ]
}
```
