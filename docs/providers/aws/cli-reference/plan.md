<!--
title: Serverless Framework Commands - AWS Lambda - Plan
menuText: plan
menuOrder: 23
description: Display local changes compared to your deployed service and the AWS Lambda Functions, Events and AWS Resources it contains.
layout: Doc
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/aws/cli-reference/plan)

<!-- DOCS-SITE-LINK:END -->

# AWS - Plan

Display local changes compared to the deployed CloudFormation stack.

```bash
serverless plan
```

## Options

- `--stage` or `-s` The stage in your service you want to display information about.
- `--region` or `-r` The region in your stage that you want to display information about.
- `--verbose` or `-v` Shows displays any Stack Output.

## Examples

### AWS

On AWS the plan plugin uses the `ChangeSet` feature of the CloudFormation stack and the AWS SDK to gather the necessary information.
See the example below for an example output.

**Example:**

```bash
$ serverless plan

Serverless: Resource Changes
[+] ApiGatewayDeployment123456789 (AWS::ApiGateway::Deployment)
[+] ApiGatewayMethodHelloDashworldGet (AWS::ApiGateway::Method)
[+] ApiGatewayMethodHelloDashworldOptions (AWS::ApiGateway::Method)
[+] ApiGatewayResourceHelloDashworld (AWS::ApiGateway::Resource)
[+] ApiGatewayRestApi (AWS::ApiGateway::RestApi)
[+] HelloWorldLambdaFunction (AWS::Lambda::Function)
[+] HelloWorldLambdaPermissionApiGateway (AWS::Lambda::Permission)
[+] HelloWorldLambdaVersiongEpdahBTvlhd7JMpuxPOshvfZYKD4wX7CKg (AWS::Lambda::Version)
[+] HelloWorldLogGroup (AWS::Logs::LogGroup)
[+] IamRoleLambdaExecution (AWS::IAM::Role)
```
