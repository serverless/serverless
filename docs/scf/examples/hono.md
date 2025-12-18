---
title: Serverless Hono Application
short_title: Serverless Hono Application
description: >-
  Deploy a Hono-based web application with Serverless Container Framework.
  This example demonstrates how to build a lightweight HTTP service that can be deployed to
  AWS Lambda or AWS ECS Fargate without rearchitecting.
keywords:
  - Serverless Container Framework
  - Hono Framework
  - Web Application
  - Static File Serving
  - Health Check Endpoint
  - AWS Lambda Deployment
  - AWS ECS Fargate Deployment
  - Serverless Hono
  - Container Deployment
  - Serverless Deployment
  - AWS Application Load Balancer
  - Local Development
  - Hot Reloading
  - Cloud Infrastructure
  - Node.js Application
---

# Serverless Hono Application

This example demonstrates how to build and deploy a Hono-based web application using the Serverless Container Framework (SCF). Hono is a lightweight framework for building fast HTTP services. The application sets up basic routes—including static file delivery, a health check, and a fallback 404 page. The Serverless Container Framework enables this application to be deployed to either AWS Lambda or AWS ECS Fargate without rearchitecting.

## Features

- **Hono Framework:**  
  Leverages Hono for a fast and minimalistic HTTP service.
- **Static File Serving:**  
  Serves static content from a dedicated public directory.
- **Health Check Endpoint:**  
  Provides a reliable `/health` route to verify application status.
- **Flexible Compute Options:**  
  Easily deployable as an AWS Lambda function or on AWS Fargate ECS.
- **Lightweight & Efficient:**  
  Designed for minimal overhead and optimal performance in a containerized environment.

## Prerequisites

Before getting started, make sure you have:

- **Docker:** Install and start Docker Desktop. ([Get Docker](https://www.docker.com))
- **Serverless Framework:** Install globally:
  ```bash
  npm i -g serverless
  ```
- **Node.js & npm:** Ensure you have a recent Node.js LTS version installed.
- **AWS Credentials:** Properly configure your AWS credentials (via environment variables or AWS profiles) to enable SCF to provision and update AWS resources.

For more information on setting up AWS credentials, see the [SCF Getting Started guide](../getting-started.md).

## Configuration

At the project root, the `serverless.containers.yml` file defines the SCF configuration:

```yaml
name: hono

deployment:
  type: aws@1.0

containers:
  service:
    src: ./service
    routing:
      pathPattern: /*
      pathHealthCheck: /health
    environment:
      HELLO: world
    compute:
      type: awsLambda # or awsFargateEcs
```

This configuration sets:

- **Project Namespace:** The project name (hono) is used to namespace resources in your AWS account.
- **Deployment Settings:** Configures networking via the AWS API deployment type.
- **Container Details:**
  - The source code is located in the `./service` directory.
  - A catch-all routing rule (`/*`) is used with a designated health check endpoint (`/health`).
  - An environment variable (`HELLO`) is provided.
  - The compute type is set to `awsLambda` by default (or can be switched to `awsFargateEcs`).

For more details on SCF configuration options, see the [SCF Configuration documentation](../configuration.md).

## Project Structure

A typical project structure for this Hono example:

```
example-hono/
├── serverless.containers.yml      # SCF configuration file
└── service/
    ├── package.json                # Node.js project configuration and dependencies
    └── src/
        ├── index.js                # Main Hono application entrypoint
        └── public/                 # Static assets (HTML, CSS, images, etc.)
```

## Development

Serverless Container Framework provides a local development mode that emulates AWS routing and compute environments, including AWS Application Load Balancer emulation:

```bash
serverless dev
```

This will automatically start everything and set up hot reloading.

For more information on local development with SCF, see the [SCF Development documentation](../development.md).

## Deployment

Deploy your Hono application to AWS using:

```bash
serverless deploy
```

During deployment, SCF builds the container image (using the provided multi-stage Dockerfile) and provisions the necessary AWS resources (ALB, VPC, Lambda function, or ECS Fargate service).

For more details on deployment options and processes, see the [SCF Deployment documentation](../deployment.md).

## Integrating with other resources

Serverless Container Framework supports the Serverless Framework Variables system to reference infrastructure details, secrets, and more from various sources:

```yaml
containers:
  service:
    environment:
      # Simple static value
      SERVICE_NAME: hono-service

      # Environment variable reference
      NODE_ENV: ${env:NODE_ENV}

      # AWS Systems Manager Parameter Store reference
      API_ENDPOINT: ${aws:ssm:/path/to/api/endpoint}

      # AWS Secrets Manager reference
      API_KEY: ${aws:secretsmanager:HonoApiSecret.key}

      # HashiCorp Vault reference
      SERVICE_TOKEN: ${vault:secret/data/service/credentials.token}

      # HashiCorp Terraform state reference
      REDIS_ENDPOINT: ${terraform:outputs:redis_endpoint}

      # S3 bucket value reference
      CONFIG_JSON: ${aws:s3:config-bucket/hono-config.json}

      # CloudFormation stack output reference
      VPC_ID: ${aws:cf:networking-stack.VpcIdOutput}
```

For more details on using variables, see the [Serverless Framework Variables documentation](https://www.serverless.com/framework/docs/guides/variables).

## Cleanup

To remove deployed AWS resources when they are no longer needed, run:

```bash
serverless remove --force --all
```

## Additional Resources

- [Serverless Container Framework Documentation](../README.md)
- [Hono Documentation](https://hono.dev)
- [Docker Documentation](https://docs.docker.com)
- [AWS Lambda Documentation](https://aws.amazon.com/lambda)
- [AWS Fargate Documentation](https://aws.amazon.com/fargate)
