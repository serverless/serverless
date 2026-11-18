<!--
title: Serverless Framework Guides
description: Guides for configuring, deploying and operating Serverless Framework services, from variables and Compose to License Keys, Agent Skills and SAM templates.
short_title: Guides
keywords:
  [
    'Serverless Framework',
    'guides',
    'variables',
    'Serverless Compose',
    'License Keys',
  ]
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/guides/)

<!-- DOCS-SITE-LINK:END -->

# Serverless Framework Guides

The guides cover what a Serverless Framework service needs beyond its functions and events: configuration values, multi-service projects, where deployments are stored, authentication, AI agent support, and the Serverless Framework Dashboard. New to the Framework? Start with [Getting Started](../getting-started.md).

## Configure a service

- [Variables](./variables/README.md): insert values from the environment, CLI options, files, AWS, HashiCorp Vault and other sources into `serverless.yml`.
- [Parameters](./parameters.md): define values per stage with `stages.<stage>.params`, CLI options or the Dashboard, and read them with `${param:…}`.
- [Plugins](./plugins/README.md): install plugins that extend the Framework, and write your own.

## Deploy and organize services

- [Serverless Compose](./compose.md): deploy several services together, in dependency order, and pass outputs between them.
- [Compose State Storage](./state.md): where Compose stores each service's outputs, and how to use your own S3 bucket.
- [Deployment Bucket](./deployment-bucket.md): the S3 bucket that holds deployment artifacts, how the Framework picks it, and Lambda self-managed code storage.
- [AWS SAM and CloudFormation Templates](./sam.md): deploy an existing SAM or CloudFormation template with the Framework CLI.
- [Development Workflow](./workflow.md): a day-to-day workflow with personal stages, Dev Mode, CI/CD, and a command cheat sheet.
- [Upgrading to v4](./upgrading-v4.md): move a service from Serverless Framework v3 or earlier to v4.

## Authenticate and work with AI agents

- [License Keys](./license-keys.md): authenticate the CLI with an org-level key from an environment variable, `serverless.yml` or AWS SSM.
- [Agent Skills](./agent-skills.md): install the skills that teach AI coding agents to work with your service, and keep them updated.
- [Serverless MCP Server](./mcp/README.md): connect AI assistants in your IDE to your deployed infrastructure through the Model Context Protocol.

## Monitor and manage services

- [Observability](./observability/README.md): send metrics, traces and logs of your functions to the Dashboard or Axiom.
- [Serverless Framework Dashboard](./dashboard/README.md): see deployments, manage AWS access with providers, store parameters, and run CI/CD across your org.

If you have questions, [post on the Serverless Forums](https://forum.serverless.com/).
