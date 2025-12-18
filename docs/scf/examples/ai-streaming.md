---
title: Serverless AI Streaming Chat App
short_title: Serverless AI Streaming Chat App
description: >-
  Deploy an Express-based AI streaming chat application with Serverless Container Framework.
  This example demonstrates how to build a fullstack application that can be deployed to
  AWS Lambda or AWS ECS Fargate without rearchitecting.
keywords:
  - Serverless Container Framework
  - OpenAI
  - Claude Sonnet 3.7
  - AI Streaming
  - Server-Sent Events
  - OpenAI Integration
  - Anthropic Integration
  - AWS Lambda Deployment
  - AWS ECS Fargate Deployment
  - Serverless AI Application
  - Container Deployment
  - Serverless Deployment
  - AWS Application Load Balancer
  - Local Development
  - Hot Reloading
  - Cloud Infrastructure
---

# Serverless AI Streaming Chat App

This example demonstrates how to build and deploy an Express-based AI fullstack streaming application that uses Server-Sent Events (SSE) to stream live AI responses from multiple providers (OpenAI and Anthropic). It includes both a front-end and a back-end. The Serverless Container Framework (SCF) enables this application to be deployed to either AWS Lambda or AWS ECS Fargate without rearchitecting, while providing local development, flexible compute configurations, and smooth AWS deployments.

## Features

- **Express & SSE Streaming:**
  Leverages Express as the HTTP server and streams AI responses using Server-Sent Events.
- **Multi-Provider Support:**
  Integrates with both OpenAI and Anthropic APIs to provide AI completions.
- **Node.js Application:**
  Built with Node.js and modern JavaScript using lightweight frameworks.
- **Compute Flexibility:**
  Easily switch between AWS Lambda and AWS Fargate ECS deployments via the SCF configuration.
- **Local Development Experience:**
  SCF provides a rich local development mode that emulates the cloud environment, including AWS Application Load Balancer emulation, complete with hot reloading and AWS-like routing.

## Prerequisites

Before getting started, make sure you have:

- **Docker:** Install and start Docker Desktop. ([Get Docker](https://www.docker.com))
- **Serverless Framework:** Install the Serverless Framework globally:
  ```bash
  npm i -g serverless
  ```
- **Node.js & npm:** Ensure you have a recent Node.js LTS version installed.
- **AWS Credentials:** Properly configure your AWS credentials (via environment variables or AWS profiles) to allow SCF to provision and update AWS resources.

For more information on setting up AWS credentials, see the [SCF Getting Started guide](../getting-started.md).

## Configuration

At the project root, the `serverless.containers.yml` file defines the SCF configuration:

```yaml
name: ai-streaming

deployment:
  type: aws@1.0

containers:
  service:
    src: ./service
    routing:
      pathPattern: /*
      pathHealthCheck: /health
    environment:
      OPENAI_API_KEY: ${env:OPENAI_API_KEY}
      ANTHROPIC_API_KEY: ${env:ANTHROPIC_API_KEY}
    compute:
      type: awsLambda # or awsFargateEcs
```

This file specifies:

- **Project Name:** Used as a namespace in your AWS account.
- **Deployment Settings:** Configures networking (ALB, VPC) via the AWS API deployment type.
- **Container Details:**
  - The source code is located in the `./service` directory.
  - A catch-all routing rule (`/*`) is used with a dedicated health check endpoint (`/health`).
  - API keys for OpenAI and Anthropic are injected as environment variables.
  - The compute type is set to `awsLambda` by default (switchable to `awsFargateEcs` as needed).

For more details on SCF configuration options, see the [SCF Configuration documentation](../configuration.md).

## Project Structure

A typical project structure looks like this:

```
example-ai-streaming/
├── serverless.containers.yml      # SCF project configuration file
└── service/
    ├── Dockerfile                 # Multi-stage Dockerfile for Lambda and Fargate
    ├── package.json               # Node.js project configuration and dependencies
    ├── .env                       # Environment variables (not committed)
    └── src/
        ├── index.js               # Main Express application entrypoint
        ├── routes/                # API route definitions (including AI streaming endpoint)
        ├── middleware/            # Custom middleware (error handling, etc.)
        └── public/                # Static assets (HTML, CSS, JS, images)
```

## Development

Serverless Container Framework provides a local development mode that emulates AWS routing, Lambda, and ECS Fargate environments, including AWS Application Load Balancer emulation. To start the development mode (with hot reloading on file changes), run:

```bash
serverless dev
```

Additionally, you can run the application directly using:

```bash
npm start
```

For more information on local development with SCF, see the [SCF Development documentation](../development.md).

## Deployment

Deploy your AI streaming application to AWS with:

```bash
serverless deploy
```

During deployment, SCF builds the container image (using the provided Dockerfile) and provisions AWS resources (ALB, VPC, Lambda function or ECS service) automatically.

For more details on deployment options and processes, see the [SCF Deployment documentation](../deployment.md).

## Integrating with other resources

Serverless Container Framework supports the Serverless Framework Variables system to reference infrastructure details, secrets, and more from various sources:

```yaml
containers:
  service:
    environment:
      # Simple static value
      SERVICE_NAME: ai-streaming-service

      # Environment variable reference
      OPENAI_API_KEY: ${env:OPENAI_API_KEY}

      # AWS Systems Manager Parameter Store reference
      DATABASE_URL: ${aws:ssm:/path/to/database/url}

      # AWS Secrets Manager reference
      DATABASE_PASSWORD: ${aws:secretsmanager:MyDatabaseSecret.password}

      # HashiCorp Vault reference
      API_SECRET: ${vault:secret/data/api/credentials.secret}

      # HashiCorp Terraform state reference
      REDIS_ENDPOINT: ${terraform:outputs:redis_endpoint}

      # S3 bucket value reference
      CONFIG_JSON: ${aws:s3:config-bucket/config.json}

      # CloudFormation stack output reference
      VPC_ID: ${aws:cf:networking-stack.VpcIdOutput}
```

For more details on using variables, see the [Serverless Framework Variables documentation](https://www.serverless.com/framework/docs/guides/variables).

## Cleanup

To remove deployed AWS resources when they are no longer needed:

```bash
serverless remove
```

For complete cleanup (including shared infrastructure):

```bash
serverless remove --force --all
```

## Additional Resources

- [Serverless Container Framework Documentation](../README.md)
- [Express Documentation](https://expressjs.com)
- [OpenAI API Documentation](https://platform.openai.com/docs)
- [Anthropic API Documentation](https://docs.anthropic.com)

## Supported AI Models

This example supports multiple AI models from both OpenAI and Anthropic:

### OpenAI Models

**GPT-4o Series**

- GPT-4o Latest
- GPT-4o (2024-11-20)
- GPT-4o (2024-08-06)
- GPT-4o (2024-05-13)
- GPT-4o Mini (2024-07-18)

**GPT-4 Series**

- GPT-4 Turbo (2024-04-09)
- GPT-4 (0613)
- GPT-4 (0314)

**GPT-3.5 Series**

- GPT-3.5 Turbo

**O-Series Models**

- o3 Mini (2025-01-31)
- o1 (2024-12-17)

### Anthropic Models

**Claude 3.7 Series**

- Claude 3.7 Sonnet (20250219)

**Claude 3.5 Series**

- Claude 3.5 Sonnet (20241022)
- Claude 3.5 Haiku (20241022)

**Claude 3 Series**

- Claude 3 Haiku (20240307)
- Claude 3 Sonnet (20240229)
- Claude 3 Opus (20240229)
