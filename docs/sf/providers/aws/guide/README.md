<!--
title: AWS Guide
short_title: AWS Guide
description: 'Index of the AWS guide: concepts, credentials, functions, events, deploying, IAM and every AWS feature the Serverless Framework configures.'
keywords: ['Serverless Framework', 'AWS Lambda', 'AWS guide', 'serverless.yml']
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/aws/guide/)

<!-- DOCS-SITE-LINK:END -->

# AWS guide

The AWS guide explains how to build and deploy services on AWS with the Serverless Framework, one topic per page. New to the Framework? Start with [Serverless Framework concepts](./intro.md), or install it with [Setting up the Serverless Framework](../../../getting-started.md).

## Basics

- [Serverless Framework concepts](./intro.md): services, functions, events and resources, and how they fit together.
- [AWS credentials](./credentials.md): give the Framework access to your AWS account, with profiles, SSO or Dashboard Providers.
- [Services](./services.md): the `serverless.yml` file and how to organise a project into services.
- [AWS Lambda functions](./functions.md): runtimes, memory, timeouts, environment variables, function URLs, architectures and other function settings.
- [AWS Lambda events](./events.md): how events trigger functions. Each event source has its own page, such as [HTTP API](../events/http-api.md), [SQS](../events/sqs.md), [S3](../events/s3.md) and [Schedule](../events/schedule.md).
- [AWS infrastructure resources](./resources.md): add CloudFormation resources such as DynamoDB tables and S3 buckets, and override generated ones.
- [IAM permissions for functions](./iam.md): the IAM role the Framework creates for your functions, a role you supply instead, and per-function roles.

## Build, test and deploy

- [Deploying to AWS](./deploying.md): `serverless deploy` and `serverless deploy function`, stages and Regions.
- [Packaging](./packaging.md): what goes into each deployment package, and packaging functions individually.
- [Build configuration](./building.md): bundle JavaScript and TypeScript with esbuild.
- [Python support](./python.md): bundle Python dependencies from `requirements.txt`, Pipenv, Poetry or uv projects.
- [Dev Mode](./dev-mode.md): run functions locally against live AWS events.
- [Testing](./testing.md): write testable Lambda function code.
- [AWS Lambda layers](./layers.md): publish and use Lambda layers.
- [Lambda version pruning](./prune.md): delete old Lambda function versions, and optionally layer and sandbox image versions.

## AWS features

- [Custom domains](./domains.md): serve APIs and web apps from your own domain, with certificates and DNS records.
- [CloudWatch alerts](./alerts.md): create CloudWatch alarms for your functions.
- [API Gateway AWS service proxy](./api-gateway-aws-proxy.md): connect API Gateway straight to AWS services without a function.
- [AppSync](./appsync/README.md): deploy GraphQL APIs with resolvers, data sources and authentication.
- [Web Apps (Lambda Web Functions)](./web-apps.md): deploy HTTP servers such as Express, Fastify and Next.js to Lambda.
- [Sandboxes (Lambda MicroVMs)](./sandboxes.md): run container workloads in isolated MicroVMs.
- [MCP Servers](./mcp.md): deploy Model Context Protocol servers.
- [AI Agents](./agents/README.md): deploy agents on Amazon Bedrock AgentCore.
- [AWS Lambda Managed Instances](./managed-instances.md): run functions on AWS-managed EC2 instances.

## Reference

- [serverless.yml reference](./serverless.yml.md): every property, in one annotated file.
- [CLI reference](../cli-reference/README.md): every `serverless` command and its options.
