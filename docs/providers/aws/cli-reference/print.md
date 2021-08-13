<!--
title: Serverless Framework Commands - AWS Lambda - Print
menuText: print
menuOrder: 22
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

- `format` Print configuration in given format ("yaml", "json", "text"). Default: yaml
- `path` Period-separated path to print a sub-value (eg: "provider.name")
- `transform` Transform-function to apply to the value (currently only "keys" is supported)

## Examples:

Assuming you have the following config file:

```yml
service: my-service

custom:
  bucketName: test

provider:
  name: aws
  runtime: nodejs12.x

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
  runtime: nodejs12.x
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

This prints the provider name:

```bash
sls print --path provider.name --format text
```

And this prints all function names:

```bash
sls print --path functions --transform keys --format text
```
