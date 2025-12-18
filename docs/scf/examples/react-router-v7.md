---
title: Serverless React Router V7 Application
short_title: Serverless React Router V7 Application
description: >-
  Deploy a React Router V7 application with Serverless Container Framework.
  This example demonstrates how to build a full-stack React application with server-side rendering that can be deployed to
  AWS Lambda or AWS ECS Fargate without rearchitecting.
keywords:
  - Serverless Container Framework
  - React Router V7
  - Server-Side Rendering
  - Full-Stack React
  - Dynamic Routing
  - AWS Lambda Deployment
  - AWS ECS Fargate Deployment
  - Serverless React
  - Container Deployment
  - Serverless Deployment
  - AWS Application Load Balancer
  - Local Development
  - Hot Reloading
  - Cloud Infrastructure
  - Docker Multi-stage Builds
---

# Serverless React Router V7 Application

This example demonstrates how to build and deploy a full‑stack React application using React Router v7 for dynamic routing and server-side rendering (SSR). The Serverless Container Framework (SCF) enables this application to be deployed to either AWS Lambda or AWS ECS Fargate without rearchitecting, though it is optimized for deployment on AWS Fargate ECS to handle potentially large HTML responses.

## Features

- **React Router v7:**  
  Utilizes React Router v7 for advanced routing and SSR capabilities.
- **Full‑Stack React Application:**  
  Combines client‑side navigation with server‑side rendering for optimal performance.
- **Optimized Bundling:**  
  Built using modern bundling tools (e.g., Vite and React Router dev) for efficient production builds.
- **Flexible Compute Options:**  
  Configured for AWS Fargate ECS to manage larger HTML responses beyond AWS Lambda's limits, but can be switched to AWS Lambda for smaller applications.

## Prerequisites

Before getting started, make sure you have:

- **Docker:** Install and start Docker Desktop. ([Get Docker](https://www.docker.com))
- **Serverless Framework:** Install globally:
  ```bash
  npm i -g serverless
  ```
- **Node.js & npm:** Ensure you have a recent Node.js LTS version installed.
- **AWS Credentials:** Set up your AWS credentials (via environment variables or profiles) for SCF deployments.

For more information on setting up AWS credentials, see the [SCF Getting Started guide](../getting-started.md).

## Configuration

The SCF configuration is defined in the `serverless.containers.yml` file at the project root:

```yaml
name: rrouter-v7

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
      # awsLambda is not recommended for react-router-v7
      # due to potential large HTML responses.
      type: awsFargateEcs
```

For more details on SCF configuration options, see the [SCF Configuration documentation](../configuration.md).

## Project Structure

A typical project structure for this React Router v7 example:

```
example-react-router-v7/
├── serverless.containers.yml      # SCF configuration file
└── service/
    ├── package.json                # Project configuration and dependencies
    ├── Dockerfile                  # Dockerfile for building the application container
    └── app/                        # Application source code
        ├── routes/                # React Router route components
        ├── welcome/               # Welcome components and assets
        ├── app.css                # Main CSS styles (e.g., Tailwind CSS)
        ├── root.tsx               # Root component and layout
        └── (other assets and configuration files)
```

## Development

Serverless Container Framework provides a local development mode that emulates AWS routing and compute environments, including AWS Application Load Balancer emulation:

```bash
serverless dev
```

This will automatically start the development environment with hot reloading and AWS-like routing. It detects the dev npm script and uses that for hot reloading.

For more information on local development with SCF, see the [SCF Development documentation](../development.md).

## Deployment

Deploy your React Router v7 application to AWS by running:

```bash
serverless deploy
```

SCF builds the container image using Docker multi-stage builds and provisions the necessary AWS resources (ALB, VPC, and ECS Fargate service).

For more details on deployment options and processes, see the [SCF Deployment documentation](../deployment.md).

## Integrating with other resources

Serverless Container Framework supports the Serverless Framework Variables system to reference infrastructure details, secrets, and more from various sources:

```yaml
containers:
  service:
    environment:
      # Simple static value
      SERVICE_NAME: react-router-v7-app

      # Environment variable reference
      NODE_ENV: ${env:NODE_ENV}

      # AWS Systems Manager Parameter Store reference
      API_ENDPOINT: ${aws:ssm:/path/to/api/endpoint}

      # AWS Secrets Manager reference
      DATABASE_PASSWORD: ${aws:secretsmanager:ReactRouterDbSecret.password}

      # HashiCorp Vault reference
      AUTH_SECRET: ${vault:secret/data/auth/credentials.secret}

      # HashiCorp Terraform state reference
      REDIS_ENDPOINT: ${terraform:outputs:redis_endpoint}

      # S3 bucket value reference
      CONFIG_JSON: ${aws:s3:config-bucket/router-config.json}

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
- [React Router v7 Documentation](https://reactrouter.com/)
- [React Documentation](https://reactjs.org/docs/getting-started.html)
- [Vite Documentation](https://vitejs.dev)
- [Docker Documentation](https://docs.docker.com)
- [AWS Fargate Documentation](https://aws.amazon.com/fargate)
