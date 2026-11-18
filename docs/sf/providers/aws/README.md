<!--
title: AWS Provider
description: 'AWS is the provider the Serverless Framework deploys to: where the AWS guide, events, CLI reference and examples live in the docs.'
short_title: AWS Provider
keywords:
  ['Serverless Framework', 'AWS provider', 'provider.name aws', 'AWS Lambda']
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/aws)

<!-- DOCS-SITE-LINK:END -->

# AWS provider

Serverless Framework v4 deploys to Amazon Web Services only, so every page in these docs applies to AWS. In `serverless.yml`, the `provider` block sets `name: aws` and settings for the whole service, such as the Region, plus function defaults, such as the runtime, that a function can override:

```yaml
# serverless.yml
service: my-service

provider:
  name: aws
  runtime: nodejs24.x
  region: us-east-1
```

When `serverless.yml` has no `provider` block, or `provider` isn't an object (such as `provider: aws`), the Framework uses `aws`. A `provider` block without `name`, or with any other value, stops the command with `Serverless Framework V.4 only supports "aws" as a Provider.`; a `provider.name` that starts with a variable, such as `${env:PROVIDER}`, stops it with `Serverless Framework Variables are not supported for "provider.name".`

## AWS documentation sections

- [AWS guide](./guide/README.md): services, functions, deploying, credentials, IAM and every feature, as guides.
- [AWS Lambda events](./guide/events.md): how events trigger functions. Each event source has its own page, such as [HTTP API](./events/http-api.md), [SQS](./events/sqs.md), [S3](./events/s3.md) and [Schedule](./events/schedule.md).
- [CLI reference](./cli-reference/README.md): every `serverless` command and its options.
- [serverless.yml reference](./guide/serverless.yml.md): every `provider` property and the rest of the file, annotated.
- [AWS examples](./examples/README.md): example services to start from.
