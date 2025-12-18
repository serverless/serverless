---
title: Serverless Apollo GraphQL API
short_title: Serverless Apollo GraphQL API
description: >-
  Deploy a GraphQL API using Apollo Server with Serverless Container Framework.
  This example demonstrates how to build a modern Apollo Server setup that can be deployed to
  AWS Lambda or AWS ECS Fargate without rearchitecting.
keywords:
  - Serverless Container Framework
  - Apollo Server
  - GraphQL API
  - Express Integration
  - AWS Lambda Deployment
  - AWS ECS Fargate Deployment
  - Serverless GraphQL
  - Container Deployment
  - Serverless Deployment
  - AWS Application Load Balancer
  - Local Development
  - Hot Reloading
  - Cloud Infrastructure
  - Node.js Application
---

# Serverless Apollo GraphQL API

This example demonstrates building a GraphQL API using Apollo Server with Express integration. It showcases a modern Apollo Server setup complete with a GraphQL schema, resolvers, and a health check endpoint. The Serverless Container Framework (SCF) enables this application to be deployed to either AWS Lambda or AWS ECS Fargate without rearchitecting.

## Features

- **Apollo Server & GraphQL:**  
  Leverages Apollo Server 4 to provide a robust GraphQL API.
- **Express Integration:**  
  Uses Express middleware for seamless HTTP handling and CORS support.
- **Node.js Application:**  
  Developed with Node.js using ES module syntax.
- **Flexible Compute Options:**  
  Easily deployable as an AWS Lambda function or on AWS Fargate ECS with a simple configuration change.
- **Local Development:**  
  Utilize SCF's development mode for near-production emulation on your local machine, including AWS Application Load Balancer emulation.

## Prerequisites

Before getting started, make sure you have:

- **Docker:** Docker Desktop is required for container builds and local development.  
  [Get Docker](https://www.docker.com)
- **Serverless Framework:** Install globally:
  ```bash
  npm i -g serverless
  ```
- **Node.js & npm:** Ensure a recent Node.js LTS version is installed.
- **AWS Credentials:** Properly configure your AWS credentials (using environment variables or AWS profiles) to enable resource provisioning via SCF.

For more information on setting up AWS credentials, see the [SCF Getting Started guide](../getting-started.md).

## Configuration

The SCF configuration is defined in the `serverless.containers.yml` file at the project root:

```yaml
name: apollo-graphql

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
    compute:
      type: awsLambda # Can be switched to awsFargateEcs
```

This file sets the project name, deployment type, and container settings (including routing, environment variables, and compute type).

For more details on SCF configuration options, see the [SCF Configuration documentation](../configuration.md).

## Project Structure

A typical project structure is as follows:

```
example-apollo-graphql/
├── serverless.containers.yml      # SCF project configuration file
└── service/
    ├── Dockerfile                 # Multi-stage Dockerfile for Lambda and Fargate
    ├── package.json               # Node.js project configuration and dependencies
    └── src/
        ├── index.js               # Main Apollo Server and Express entrypoint
        └── (additional files)     # GraphQL schema, resolvers, and middleware
```

## Development

Serverless Container Framework provides a development mode that mimics the AWS environment, including AWS Application Load Balancer emulation:

```bash
serverless dev
```

This mode supports hot reloading and simulates API Gateway routing, enabling thorough local testing.

For more information on local development with SCF, see the [SCF Development documentation](../development.md).

## Deployment

Deploy your GraphQL API to AWS using:

```bash
serverless deploy
```

SCF will build the container image, push it to AWS ECR, and provision the necessary AWS resources (ALB, VPC, Lambda or ECS Fargate service).

For more details on deployment options and processes, see the [SCF Deployment documentation](../deployment.md).

## Integrating with other resources

Serverless Container Framework supports the Serverless Framework Variables system to reference infrastructure details, secrets, and more from various sources:

```yaml
containers:
  service:
    environment:
      # Simple static value
      SERVICE_NAME: apollo-graphql-api

      # Environment variable reference
      NODE_ENV: ${env:NODE_ENV}

      # AWS Systems Manager Parameter Store reference
      DATABASE_URL: ${aws:ssm:/path/to/database/url}

      # AWS Secrets Manager reference
      DATABASE_PASSWORD: ${aws:secretsmanager:GraphQLDatabaseSecret.password}

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

For complete infrastructure removal, including shared networking resources:

```bash
serverless remove --force --all
```

## Example Queries

```graphql
# Health Check
query {
  health
}

# Server Info
query {
  info {
    namespace
    containerName
    stage
    computeType
    local
  }
}
```

## Additional Resources

- [Serverless Container Framework Documentation](../README.md)
- [Apollo Server Documentation](https://www.apollographql.com/docs/apollo-server/)
- [GraphQL Documentation](https://graphql.org)
- [Express Documentation](https://expressjs.com)
