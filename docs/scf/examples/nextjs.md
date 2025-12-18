---
title: Serverless Next.js Application
short_title: Serverless Next.js Application
description: >-
  Deploy a Next.js web application with Serverless Container Framework.
  This example demonstrates how to build a server-side rendered application that can be deployed to
  AWS Lambda or AWS ECS Fargate without rearchitecting.
keywords:
  - Serverless Container Framework
  - Next.js Framework
  - Server-Side Rendering
  - Dynamic Routing
  - Static Site Generation
  - AWS Lambda Deployment
  - AWS ECS Fargate Deployment
  - Serverless Next.js
  - Container Deployment
  - Serverless Deployment
  - AWS Application Load Balancer
  - Local Development
  - Hot Reloading
  - Cloud Infrastructure
  - Docker Multi-stage Builds
---

# Serverless Next.js Application

This example demonstrates how to build and deploy a Next.js web application using the Serverless Container Framework (SCF). Due to the potential for large SSR outputs, this project is configured for deployment on AWS Fargate ECS, though the Serverless Container Framework enables this application to be deployed to either AWS Lambda or AWS ECS Fargate without rearchitecting.

## Features

- **Next.js Framework:**  
  Leverages Next.js for server-side rendering (SSR) and static site generation.
- **Dynamic Routing & SSR:**  
  Provides robust routing and dynamic page generation.
- **Optimized Production Builds:**  
  Docker multi-stage builds ensure efficient deployments.
- **Flexible Compute Options:**  
  Configured for AWS Fargate ECS to handle large HTML responses, but can be switched to AWS Lambda if response sizes are manageable.

## Prerequisites

Before getting started, make sure you have:

- **Docker:** Install and start Docker Desktop. ([Get Docker](https://www.docker.com))
- **Serverless Framework:** Install globally:
  ```bash
  npm i -g serverless
  ```
- **Node.js & npm:** Ensure you have a recent Node.js LTS version installed.
- **AWS Credentials:** Configure your AWS credentials (via environment variables or profiles) for SCF deployments.

For more information on setting up AWS credentials, see the [SCF Getting Started guide](../getting-started.md).

## Configuration

At the project root, the `serverless.containers.yml` file defines the SCF configuration:

```yaml
name: nextjs

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
      # awsLambda is not recommended for this Next.js app.
      # SSR can generate large HTML responses, which may exceed
      # the req/res size limits for AWS Lambda.
      type: awsFargateEcs
```

For more details on SCF configuration options, see the [SCF Configuration documentation](../configuration.md).

## Project Structure

A typical project structure for this Next.js example:

```
example-nextjs/
├── serverless.containers.yml      # SCF configuration file
└── service/
    ├── next.config.ts              # Next.js configuration file
    ├── package.json                # Project configuration and dependencies
    ├── public/                     # Static assets (images, CSS, etc.)
    └── src/
        ├── app/                   # Next.js app folder (pages, components, etc.)
        └── (other directories)     # Additional assets and logic
```

## Development

Serverless Container Framework provides a local development mode that emulates AWS routing and compute environments, including AWS Application Load Balancer emulation:

```bash
serverless dev
```

This will automatically start the Next.js development server with hot reloading and AWS emulation. It detects the dev npm script and uses that for hot reloading.

For more information on local development with SCF, see the [SCF Development documentation](../development.md).

## Deployment

Deploy your Next.js application to AWS by running:

```bash
serverless deploy
```

SCF builds the container image (using the provided multi-stage Dockerfile) and provisions the necessary AWS resources.

For more details on deployment options and processes, see the [SCF Deployment documentation](../deployment.md).

## Integrating with other resources

Serverless Container Framework supports the Serverless Framework Variables system to reference infrastructure details, secrets, and more from various sources:

```yaml
containers:
  service:
    environment:
      # Simple static value
      SERVICE_NAME: nextjs-application

      # Environment variable reference
      NODE_ENV: ${env:NODE_ENV}

      # AWS Systems Manager Parameter Store reference
      API_ENDPOINT: ${aws:ssm:/path/to/api/endpoint}

      # AWS Secrets Manager reference
      DATABASE_PASSWORD: ${aws:secretsmanager:NextjsDbSecret.password}

      # HashiCorp Vault reference
      AUTH_SECRET: ${vault:secret/data/auth/credentials.secret}

      # HashiCorp Terraform state reference
      REDIS_ENDPOINT: ${terraform:outputs:redis_endpoint}

      # S3 bucket value reference
      CONFIG_JSON: ${aws:s3:config-bucket/nextjs-config.json}

      # CloudFormation stack output reference
      VPC_ID: ${aws:cf:networking-stack.VpcIdOutput}
```

For more details on using variables, see the [Serverless Framework Variables documentation](https://www.serverless.com/framework/docs/guides/variables).

## Cleanup

To remove the deployed AWS resources, run:

```bash
serverless remove --force --all
```

## Additional Resources

- [Serverless Container Framework Documentation](../README.md)
- [Next.js Documentation](https://nextjs.org/docs)
- [Docker Documentation](https://docs.docker.com)
- [AWS Fargate Documentation](https://aws.amazon.com/fargate)
