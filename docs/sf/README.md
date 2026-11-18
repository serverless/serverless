<!--
title: 'Serverless Framework Documentation'
short_title: 'Introduction'
description: 'Docs for the Serverless Framework: deploy AWS Lambda functions, their events and AWS infrastructure from serverless.yml with one CLI.'
keywords:
  [
    'Serverless Framework',
    'Serverless Framework documentation',
    'AWS Lambda',
    'serverless.yml',
    'Serverless CLI',
  ]
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/)

<!-- DOCS-SITE-LINK:END -->

# Serverless Framework documentation

The Serverless Framework is a command-line tool that deploys applications to AWS from one configuration file, `serverless.yml`: your AWS Lambda functions' code, the events that trigger them (HTTP requests, queues, schedules and more), and the AWS resources they use. It deploys to AWS only: `aws` is the one supported `provider.name`. The optional Serverless Framework Dashboard adds a deployment history, observability, secrets and AWS credential Providers for teams.

A service with one function behind an HTTP endpoint:

```yaml
# serverless.yml
service: my-service

provider:
  name: aws
  runtime: nodejs24.x

functions:
  hello:
    handler: handler.hello
    events:
      - httpApi:
          path: /
          method: get
```

```bash
serverless deploy
```

Functions run on any runtime AWS Lambda offers: the managed Node.js, Python, Java, .NET and Ruby runtimes, or the OS-only `provided.al2023` runtime for languages such as Go and Rust ([Lambda runtimes](https://docs.aws.amazon.com/lambda/latest/dg/lambda-runtimes.html)).

## Philosophy

**_Build applications that demand attention, not maintenance._**

In 2014, AWS introduced AWS Lambda, a more efficient compute service in the cloud. With auto-scaling and no cost when idle, Lambda offers a compute experience that demands so little maintenance it feels _"serverless"_.

Months later, the Serverless Framework was created to streamline deploying all kinds of use cases on AWS Lambda. It introduced the concept of _"serverless architectures"_: a transformative approach to building applications in the cloud that combines AWS Lambda with cloud infrastructure of the same "serverless" qualities, so developers can create entire applications that scale massively with minimal maintenance.

Today, the Serverless Framework continues to be the original, leading and most trusted tool for enterprises and startups building serverless architectures. Renowned Fortune 500 companies such as the _New York Times_, _Nike_ and _EA Games_ use it, and many startups have reached unicorn valuations and notable exits with it. They achieved this with relatively small engineering teams, by leveraging the power of serverless architectures.

The mission of the Serverless Framework is to empower all developers to build more and manage less.

## Highlights

- **Empowerment:** innovate faster by spending less time on infrastructure management.
- **Versatility:** tackle diverse serverless use cases, from HTTP APIs and scheduled tasks to WebSockets, queues, data pipelines, web apps, MCP servers and AI agents ([AWS Lambda events](./providers/aws/guide/events.md)).
- **Infra & Code:** streamline development with code and infrastructure deployed together, as one CloudFormation stack ([Deploying to AWS](./providers/aws/guide/deploying.md)).
- **Ease of Use:** deploy complex applications without deep cloud infrastructure expertise, thanks to approachable YAML configuration, with raw CloudFormation under `resources` when you need it ([AWS infrastructure resources](./providers/aws/guide/resources.md)).
- **Language Agnostic:** develop in your preferred language: Node.js, Python, Java, Kotlin, Scala, C#, F#, Ruby, Go, Rust, PHP, Swift and more. Lambda's managed runtimes run most of them directly, and the OS-only runtime runs the rest.
- **Built-in Builds:** ship TypeScript without extra plugins: the Framework builds TypeScript handlers with esbuild automatically, and JavaScript handlers when you turn on `build.esbuild` ([Build configuration](./providers/aws/guide/building.md)).
- **Full Lifecycle:** build, deploy, develop locally against live events with Dev Mode, invoke, monitor with logs and metrics, update and troubleshoot serverless applications from one CLI ([CLI reference](./providers/aws/cli-reference/README.md)).
- **Scalable Organization:** structure large projects and teams with built-in support for stages, per-stage parameters and service composition ([Composing services](./guides/compose.md)).
- **Team Dashboard:** add the optional Serverless Framework Dashboard for deployment history, observability, secrets and shared AWS credentials across your team ([Dashboard](./guides/dashboard/README.md)).
- **Plugin Ecosystem:** extend and modify the Framework's functionality with community plugins or your own ([Plugins](./guides/plugins/README.md)).
- **AI-Ready:** the CLI runs without prompts in CI and agent sessions, and Agent Skills and the Serverless MCP Server teach AI agents to use it ([Agent Skills](./guides/agent-skills.md)).
- **Vibrant Community:** get support and connect with a passionate community of Serverless developers on the [Serverless Framework forum](https://forum.serverless.com/) and [GitHub](https://github.com/serverless/serverless).

## Get started

- [Setting up the Serverless Framework](./getting-started.md): install the CLI, sign in, set up AWS credentials and deploy a service.
- [Tutorial: Build an HTTP API with Lambda and DynamoDB](./tutorial.md): create, deploy, test and remove a first service, step by step.
- [AWS credentials](./providers/aws/guide/credentials.md): give the Framework access to your AWS account.
- [License keys](./guides/license-keys.md): use the CLI with an org License Key instead of signing in.
- [Upgrading to v4](./guides/upgrading-v4.md): move a v3 service to v4.

## Learn the concepts

- [Serverless Framework concepts](./providers/aws/guide/intro.md): services, functions, events and resources, and how they fit together.
- [Services](./providers/aws/guide/services.md): the `serverless.yml` file and how to organise services.
- [AWS Lambda functions](./providers/aws/guide/functions.md): configure functions, runtimes, memory, timeouts, environment variables and function URLs.
- [AWS Lambda events](./providers/aws/guide/events.md): how events trigger functions. Each event source has its own page, such as [HTTP API](./providers/aws/events/http-api.md), [REST API](./providers/aws/events/apigateway.md), [SQS](./providers/aws/events/sqs.md), [S3](./providers/aws/events/s3.md), [Schedule](./providers/aws/events/schedule.md), [SNS](./providers/aws/events/sns.md), [EventBridge](./providers/aws/events/event-bridge.md) and [Kinesis and DynamoDB streams](./providers/aws/events/streams.md).
- [AWS infrastructure resources](./providers/aws/guide/resources.md): add DynamoDB tables, S3 buckets and other resources with CloudFormation.

## Build and deploy

- [Deploying to AWS](./providers/aws/guide/deploying.md): what `serverless deploy` does, stages and Regions.
- [Dev Mode](./providers/aws/guide/dev-mode.md): run functions locally against live AWS events.
- [Packaging](./providers/aws/guide/packaging.md) and [build configuration](./providers/aws/guide/building.md): what goes into each deployment package, and bundling with esbuild.
- [Variables](./guides/variables/README.md) and [parameters](./guides/parameters.md): reference environment variables, SSM parameters, stack outputs and per-stage values in `serverless.yml`.
- [IAM permissions for functions](./providers/aws/guide/iam.md): the role your functions run with.
- [Custom domains](./providers/aws/guide/domains.md): serve APIs and web apps from your own domain.
- [Composing services](./guides/compose.md): deploy several services together and share outputs between them.
- [Deploy in your own CI/CD](./guides/dashboard/cicd/running-in-your-own-cicd.md): run the CLI in GitHub Actions, GitLab CI and other pipelines, with keys instead of a browser sign-in. [Non-interactive use: CI and AI agents](./providers/aws/cli-reference/README.md#non-interactive-use-ci-and-ai-agents) explains how the CLI behaves without a terminal.
- [Plugins](./guides/plugins/README.md): extend the Framework with community and custom plugins.

## Features

- [Web Apps (Lambda Web Functions)](./providers/aws/guide/web-apps.md): deploy web applications and frameworks to Lambda.
- [Sandboxes (Lambda MicroVMs)](./providers/aws/guide/sandboxes.md): run container workloads in isolated MicroVMs managed by Lambda.
- [MCP Servers](./providers/aws/guide/mcp.md): deploy Model Context Protocol servers.
- [AI Agents](./providers/aws/guide/agents/README.md): deploy agents on Amazon Bedrock AgentCore.
- [AWS Lambda Managed Instances](./providers/aws/guide/managed-instances.md): run functions on AWS-managed EC2 instances.

## Reference

- [serverless.yml reference](./providers/aws/guide/serverless.yml.md): every property, in one annotated file.
- [CLI reference](./providers/aws/cli-reference/README.md): every `serverless` command and its options.
- [Configuration validation](./configuration-validation.md): how `serverless.yml` is checked, and `configValidationMode`.

## Tools for teams and AI agents

- [Serverless Framework Dashboard](./guides/dashboard/README.md): deployments, observability, secrets and AWS credential Providers.
- [Serverless MCP Server](./guides/mcp/README.md): give AI assistants tools to inspect your services' resources, metrics and logs.
- [Agent Skills](./guides/agent-skills.md): teach AI coding agents to work with the Framework.

## Examples and help

- [Examples and tutorials](./examples-and-tutorials.md): templates and example services to start from.
- [Serverless Framework forum](https://forum.serverless.com/): ask questions and search earlier answers.
- [Serverless Framework issues](https://github.com/serverless/serverless/issues): report a bug in the Framework.
