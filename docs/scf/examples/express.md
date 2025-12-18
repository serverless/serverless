---
title: Serverless Express Application
short_title: Serverless Express Application
description: >-
  Deploy an Express-based web application with Serverless Container Framework.
  This example demonstrates how to build a simple Express application that can be deployed to
  AWS Lambda or AWS ECS Fargate without rearchitecting.
keywords:
  - Serverless Container Framework
  - Express Framework
  - Web Application
  - Static File Serving
  - Health Check Endpoint
  - AWS Lambda Deployment
  - AWS ECS Fargate Deployment
  - Serverless Express
  - Container Deployment
  - Serverless Deployment
  - AWS Application Load Balancer
  - Local Development
  - Hot Reloading
  - Cloud Infrastructure
  - Node.js Application
---

# Serverless Express Application

This example demonstrates how to build and deploy a simple Express-based web application using the Serverless Container Framework (SCF). The application sets up basic routes—including a health check, static file delivery, and a fallback 404 page—with minimal configuration. The Serverless Container Framework enables this application to be deployed to either AWS Lambda or AWS ECS Fargate without rearchitecting.

## Features

- **Express Framework:**  
  Leverages Express for routing and middleware handling.
- **Static File Serving:**  
  Serves static assets from a dedicated public directory.
- **Health Check Endpoint:**  
  Provides a simple `/health` route for monitoring application health.
- **Flexible Compute Options:**  
  Easily switch between AWS Lambda and AWS Fargate ECS deployments via SCF configuration.

## Prerequisites

Before getting started, make sure you have:

- **Docker:** Install and start Docker Desktop. ([Get Docker](https://www.docker.com))
- **Serverless Framework:** Install globally:
  ```bash
  npm i -g serverless
  ```
- **Node.js & npm:** Ensure you have a recent Node.js LTS version installed.
- **AWS Credentials:** Properly configure your AWS credentials (via environment variables or AWS profiles) to allow SCF to provision and update AWS resources.

For more information on setting up AWS credentials, see the [SCF Getting Started guide](../getting-started.md).

## Configuration

At the project root, the `serverless.containers.yml` file defines the SCF configuration:

```yaml
name: express

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

- **Project Namespace:** The project name (express) is used as a namespace in your AWS account.
- **Deployment Settings:** Configures networking (ALB, VPC, API Gateway) via the AWS API deployment type.
- **Container Details:**
  - The source code is located in the `./service` directory.
  - A catch-all routing rule (`/*`) is used with a dedicated health check endpoint (`/health`).
  - An environment variable (`HELLO`) is provided.
  - The compute type is set to `awsLambda` by default (switchable to `awsFargateEcs` as needed).

For more details on SCF configuration options, see the [SCF Configuration documentation](../configuration.md).

## Project Structure

A typical project structure for this Express example:

```
example-express/
├── serverless.containers.yml      # SCF configuration file
└── service/
    ├── package.json                # Node.js project configuration and dependencies
    └── src/
        ├── index.js                # Main Express application entrypoint
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

Deploy your Express application to AWS by running:

```bash
serverless deploy
```

During deployment, SCF builds the container image (using the provided multi-stage Dockerfile) and provisions the necessary AWS resources (ALB, VPC, Lambda function or ECS Fargate service).

For more details on deployment options and processes, see the [SCF Deployment documentation](../deployment.md).

## Integrating with other resources

Serverless Container Framework supports the Serverless Framework Variables system to reference infrastructure details, secrets, and more from various sources:

```yaml
containers:
  service:
    environment:
      # Simple static value
      SERVICE_NAME: express-service

      # Environment variable reference
      NODE_ENV: ${env:NODE_ENV}

      # AWS Systems Manager Parameter Store reference
      DATABASE_URL: ${aws:ssm:/path/to/database/url}

      # AWS Secrets Manager reference
      DATABASE_PASSWORD: ${aws:secretsmanager:ExpressDbSecret.password}

      # HashiCorp Vault reference
      API_SECRET: ${vault:secret/data/api/credentials.secret}

      # HashiCorp Terraform state reference
      REDIS_ENDPOINT: ${terraform:outputs:redis_endpoint}

      # S3 bucket value reference
      CONFIG_JSON: ${aws:s3:config-bucket/express-config.json}

      # CloudFormation stack output reference
      VPC_ID: ${aws:cf:networking-stack.VpcIdOutput}
```

For more details on using variables, see the [Serverless Framework Variables documentation](https://www.serverless.com/framework/docs/guides/variables).

## Cleanup

To remove deployed AWS resources when they are no longer needed:

```bash
serverless remove --force --all
```

## Additional Resources

- [Serverless Container Framework Documentation](../README.md)
- [Express Documentation](https://expressjs.com)
- [Docker Documentation](https://docs.docker.com)
- [AWS Lambda Documentation](https://aws.amazon.com/lambda)
- [AWS Fargate Documentation](https://aws.amazon.com/fargate)
