---
title: Serverless React Application
short_title: Serverless React Application
description: >-
  Deploy a React application with Serverless Container Framework.
  This example demonstrates how to build a client-side React application that can be deployed to
  AWS Lambda or AWS ECS Fargate without rearchitecting.
keywords:
  - Serverless Container Framework
  - React Framework
  - Client-Side Application
  - esbuild Bundling
  - Static Asset Serving
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

# Serverless React Application

This example demonstrates how to build and deploy a React application using the Serverless Container Framework (SCF). The application is bundled using esbuild and optimized for production deployments. The Serverless Container Framework enables this application to be deployed to either AWS Lambda or AWS ECS Fargate without rearchitecting, though it is configured for AWS Fargate ECS to accommodate larger bundle sizes.

## Features

- **React Framework:**  
  Builds a client-side React application with a component-based architecture.
- **Fast Bundling with esbuild:**  
  Uses esbuild for rapid development builds and efficient bundling.
- **Static Asset Serving:**  
  Supports serving static assets and client-side routing.
- **Flexible Compute Options:**  
  Configured for AWS Fargate ECS to accommodate larger bundle sizes that might exceed AWS Lambda request/response limits, but can be switched to AWS Lambda for smaller applications.

## Prerequisites

Before getting started, make sure you have:

- **Docker:** Install and start Docker Desktop. ([Get Docker](https://www.docker.com))
- **Serverless Framework:** Install globally:
  ```bash
  npm i -g serverless
  ```
- **Node.js & npm:** Ensure you have a recent Node.js LTS version installed.
- **AWS Credentials:** Set up your AWS credentials (via environment variables or profiles) for SCF deployment.

For more information on setting up AWS credentials, see the [SCF Getting Started guide](../getting-started.md).

## Configuration

The SCF configuration is defined in the `serverless.containers.yml` file at the project root:

```yaml
name: react

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
      # awsLambda is not recommended for this React app.
      # The bundled app may exceed AWS Lambda's request/response size limits.
      type: awsFargateEcs
```

For more details on SCF configuration options, see the [SCF Configuration documentation](../configuration.md).

## Project Structure

A typical project structure for this React example:

```
example-react/
├── serverless.containers.yml      # SCF configuration file
└── service/
    ├── package.json                # Project configuration and dependencies
    ├── public/                     # Static assets (HTML, CSS, images, etc.)
    ├── server.js                   # Server entrypoint for serving the React app
    └── src/
        ├── index.jsx              # React application entrypoint
        └── (other components)      # React components and logic
```

## Development

Serverless Container Framework provides a local development mode that emulates AWS routing and compute environments, including AWS Application Load Balancer emulation:

```bash
serverless dev
```

This will automatically start the development environment with hot reloading and AWS-like routing.

For more information on local development with SCF, see the [SCF Development documentation](../development.md).

## Deployment

Deploy your React application to AWS by running:

```bash
serverless deploy
```

SCF takes care of building the container image (using the provided Dockerfile) and provisioning the necessary resources.

For more details on deployment options and processes, see the [SCF Deployment documentation](../deployment.md).

## Integrating with other resources

Serverless Container Framework supports the Serverless Framework Variables system to reference infrastructure details, secrets, and more from various sources:

```yaml
containers:
  service:
    environment:
      # Simple static value
      SERVICE_NAME: react-application

      # Environment variable reference
      NODE_ENV: ${env:NODE_ENV}

      # AWS Systems Manager Parameter Store reference
      API_ENDPOINT: ${aws:ssm:/path/to/api/endpoint}

      # AWS Secrets Manager reference
      API_KEY: ${aws:secretsmanager:ReactApiSecret.key}

      # HashiCorp Vault reference
      AUTH_SECRET: ${vault:secret/data/auth/credentials.secret}

      # HashiCorp Terraform state reference
      REDIS_ENDPOINT: ${terraform:outputs:redis_endpoint}

      # S3 bucket value reference
      CONFIG_JSON: ${aws:s3:config-bucket/react-config.json}

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
- [React Documentation](https://reactjs.org/docs/getting-started.html)
- [esbuild Documentation](https://esbuild.github.io)
- [Docker Documentation](https://docs.docker.com)
- [AWS Fargate Documentation](https://aws.amazon.com/fargate)
