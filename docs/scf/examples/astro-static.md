---
title: Serverless Astro Static Site
short_title: Serverless Astro Static Site
description: >-
  Deploy an Astro-based static site with Serverless Container Framework.
  This example demonstrates how to build a modern static site with optional SSR that can be deployed to
  AWS Lambda or AWS ECS Fargate without rearchitecting.
keywords:
  - Serverless Container Framework
  - Astro Static Site
  - Static Site Generation
  - Server-Side Rendering
  - Zero-JS by Default
  - AWS Lambda Deployment
  - AWS ECS Fargate Deployment
  - Serverless Static Site
  - Container Deployment
  - Serverless Deployment
  - AWS Application Load Balancer
  - Local Development
  - Hot Reloading
  - Cloud Infrastructure
  - Docker Multi-stage Builds
---

# Serverless Astro Static Site

This example demonstrates how to build and deploy an Astro-based static site that leverages Astro's modern static site generation (with optional SSR) for an optimized production deployment. The Serverless Container Framework (SCF) enables this application to be deployed to either AWS Lambda or AWS ECS Fargate without rearchitecting.

## Features

- **Astro Static Site:**  
  Built with Astro to generate a fast, optimized, and zero-JS default static site.
- **Optional Server-Side Rendering:**  
  Supports SSR mode through Astro when dynamic rendering is needed.
- **Zero-JS by Default:**  
  Delivers pure static content with minimal or no client-side JavaScript.
- **Flexible Compute Options:**  
  Easily switch between AWS Lambda and AWS Fargate ECS deployments via SCF configuration.
- **Optimized Production Builds:**  
  Utilizes Docker multi-stage builds and production optimizations for efficient deployment.

## Prerequisites

Before getting started, make sure you have:

- **Docker:** Install and start Docker Desktop. ([Get Docker](https://www.docker.com))
- **Serverless Framework:** Install globally:
  ```bash
  npm i -g serverless
  ```
- **Node.js & npm:** Ensure you have a recent Node.js LTS version installed.
- **AWS Credentials:** Properly configure your AWS credentials (using environment variables or AWS profiles) to allow SCF to provision and update AWS resources.

For more information on setting up AWS credentials, see the [SCF Getting Started guide](../getting-started.md).

## Configuration

At the project root, the `serverless.containers.yml` file defines the SCF configuration:

```yaml
name: astro-static

deployment:
  type: aws@1.0

containers:
  service:
    src: ./service
    routing:
      pathPattern: /*
      pathHealthCheck: /health
    environment:
      NODE_ENV: production
      ASTRO_TELEMETRY_DISABLED: 1 # Disable Astro telemetry
    compute:
      type: awsLambda # or awsFargateEcs
```

This configuration sets:

- **Project Namespace:** The project name is used as a namespace in your AWS account.
- **Deployment Settings:** Configures networking (ALB, VPC, API Gateway) via the AWS API deployment type.
- **Container Details:**
  - The source code resides in the `./service` directory.
  - A catch-all routing rule (`/*`) is used with a dedicated health check endpoint (`/health`).
  - Environment variables are set for production and to disable Astro telemetry.
  - The default compute type is set to `awsLambda` (switchable to `awsFargateEcs` as needed).

For more details on SCF configuration options, see the [SCF Configuration documentation](../configuration.md).

## Project Structure

A typical project structure for this Astro static site example:

```
example-astro-static/
├── serverless.containers.yml      # SCF configuration file
└── service/
    ├── astro.config.mjs            # Astro configuration file
    ├── package.json                # Node.js project configuration and dependencies
    ├── public/                     # Static assets (images, CSS, etc.)
    └── src/
        ├── pages/                 # Astro pages (including health check and index)
        └── (other directories)    # Additional assets or components
```

## Development

Serverless Container Framework provides a development mode that emulates AWS routing and compute environments, including AWS Application Load Balancer emulation:

```bash
serverless dev
```

For more information on local development with SCF, see the [SCF Development documentation](../development.md).

## Deployment

Deploy your Astro static site to AWS by running:

```bash
serverless deploy
```

During deployment, SCF builds the container image (using the multi-stage Dockerfile) and provisions the necessary AWS resources (ALB, VPC, Lambda function, or ECS Fargate service).

For more details on deployment options and processes, see the [SCF Deployment documentation](../deployment.md).

## Integrating with other resources

Serverless Container Framework supports the Serverless Framework Variables system to reference infrastructure details, secrets, and more from various sources:

```yaml
containers:
  service:
    environment:
      # Simple static value
      SERVICE_NAME: astro-static-site

      # Environment variable reference
      NODE_ENV: ${env:NODE_ENV}

      # AWS Systems Manager Parameter Store reference
      CDN_URL: ${aws:ssm:/path/to/cdn/url}

      # AWS Secrets Manager reference
      API_KEY: ${aws:secretsmanager:AstroApiSecret.key}

      # HashiCorp Vault reference
      ANALYTICS_TOKEN: ${vault:secret/data/analytics/credentials.token}

      # HashiCorp Terraform state reference
      STORAGE_BUCKET: ${terraform:outputs:static_assets_bucket}

      # S3 bucket value reference
      SITE_CONFIG: ${aws:s3:config-bucket/astro-config.json}

      # CloudFormation stack output reference
      DISTRIBUTION_ID: ${aws:cf:cdn-stack.DistributionIdOutput}
```

For more details on using variables, see the [Serverless Framework Variables documentation](https://www.serverless.com/framework/docs/guides/variables).

## Cleanup

To remove deployed AWS resources when they are no longer needed, run:

```bash
serverless remove --force --all
```

## Additional Resources

- [Serverless Container Framework Documentation](../README.md)
- [Astro Documentation](https://docs.astro.build)
- [Docker Documentation](https://docs.docker.com)
- [AWS Lambda Documentation](https://aws.amazon.com/lambda)
- [AWS Fargate Documentation](https://aws.amazon.com/fargate)
