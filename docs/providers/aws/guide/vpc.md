<!--
title: Serverless Framework - AWS Lambda Guide - VPC
menuText: VPC
menuOrder: 8
description: How to use the native Serverless Framework VPC feature
layout: Doc
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/aws/guide/vpc)

<!-- DOCS-SITE-LINK:END -->

# AWS - VPC

Sometimes it's useful to setup a custom VPC in order for AWS Lambda functions to interact with other AWS services which require to be run inside a VPC (e.g. relational databases such as AWS RDS).

The Serverless Framework has built-in support for VPC configurations to help developers setup VPC environments which follow best practices.

**NOTE:** If you need great flexibility and control over your VPC resources we suggest to take a look at our [VPC Guide](./functions.md#vpc-configuration) which shows you how to setup a custom VPC for your functions / service.

**NOTE:** This VPC functionality can only be used with services which have functions defined.

## Configuration

Configuring the Serverless Framerwork to setup a basic VPC is as easy as adding the `vpc: true` configuration to the `serverless.yml` file:

```yaml
#serverless.yml
service: myService

provider:
  name: aws

vpc: true

functions:
  func1:
    handler: index.handler
```

## VPC Resources

Using the `vpc: true` configuration will instruct the Serverless Framework to setup the following resources in your AWS account:

- 1 VPC
- 2 Subnets (1 private, 1 public) in the `a` and `b` availability zones of your deployment region
- 1 InternetGateway to enable internet access for public subnets
- 1 SecurityGroup for your Lambda functions

## Outputs and Exports

The Serverless Framework will automatically create CloudFormation Outputs, CloudFormation Exports and [Dashboard](../../dashboard) outputs. Those outputs / exports can be re-imported and used across stacks / services.

Make sure to run the `deploy` / `info` command in `--verbose` mode to see the outputs.
