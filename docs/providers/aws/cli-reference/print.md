<!--
title: Serverless Framework Commands - AWS Lambda - Print
menuText: Print
menuOrder: 21
description: Print your config with all variables resolved for debugging
layout: Doc
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->
### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/aws/cli-reference/print)
<!-- DOCS-SITE-LINK:END -->

# Print

Print your `serverless.yml` config file with all variables resolved.

If you're using [Serverless Variables](https://serverless.com/framework/docs/providers/aws/guide/variables/)
in your `serverless.yml`, it can be difficult to know if your syntax is correct
or if the variables are resolving as you expect.

With this command, it will print the fully-resolved config to your console.

```bash
serverless print
```

## Options

- None

## Examples:

Assuming you have the following config file:

```yml
service: my-service

custom:
  bucketName: test

provider:
  name: aws
  runtime: nodejs6.10
  stage: ${opt:stage, "dev"}

functions:
  hello:
    handler: handler.hello

resources:
  Resources:
    MyBucket:
      Type: AWS::S3::Bucket
      Properties:
        BucketName: ${self:custom.bucketName}
```

Using `sls print` will resolve the variables in `provider.stage` and `BucketName`.

```bash
$ sls print
service: my-service
custom:
  bucketName: test
provider:
  name: aws
  runtime: nodejs6.10
  stage: dev # <-- Resolved
functions:
  hello:
    handler: handler.hello
resources:
  Resources:
    MyBucket:
      Type: 'AWS::S3::Bucket'
      Properties:
        BucketName: test # <-- Resolved
```
