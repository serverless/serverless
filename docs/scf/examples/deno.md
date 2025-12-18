---
title: Serverless Deno V2 Application
short_title: Serverless Deno V2 Application
description: >-
  Deploy a Deno V2 application with Serverless Container Framework.
  This example demonstrates how to build a performant web application that can be deployed to
  AWS Lambda or AWS ECS Fargate without rearchitecting.
keywords:
  - Serverless Container Framework
  - Deno V2
  - Oak Framework
  - TypeScript
  - AWS Lambda Deployment
  - AWS ECS Fargate Deployment
  - Serverless Deno
  - Container Deployment
  - Serverless Deployment
  - AWS Application Load Balancer
  - Local Development
  - Hot Reloading
  - Cloud Infrastructure
  - Multi-stage Dockerfile
  - Web Application
---

# Serverless Deno V2 Application

This example demonstrates the development and deployment of a simple, performant web application built with Deno V2, the Oak framework, and TypeScript. The Serverless Container Framework (SCF) enables this application to be deployed to either AWS Lambda or AWS ECS Fargate without rearchitecting.

## Features

- **Deno V2 Support:** Utilizes the official Deno V2 image to run your Deno application.
- **Oak Framework:** Utilizes the [Oak framework](https://deno.land/x/oak), a middleware framework for handling HTTP requests.
- **TypeScript:** Uses TypeScript for the application codebase.
- **Compute Flexibility:** Configure the container's compute type to run either as an AWS Lambda function (`awsLambda`) or on AWS Fargate ECS (`awsFargateEcs`). A multi-stage Dockerfile is provided to support these configurations.
- **Local Development:** SCF includes a rich development mode that emulates AWS ALB routing, AWS Lambda, and AWS Fargate ECS locally, allowing you to develop and test your Deno application with near-production parity.

## Prerequisites

Before getting started, make sure you have:

- **Docker:** Install and start Docker Desktop, as it is required. Get it [here](https://www.docker.com).
- **Serverless Framework:** Serverless Container Framework is a feature of the Serverless Framework.
  ```
  npm i -g serverless
  ```
- **AWS Credentials:** Properly configure your AWS credentials (via environment variables or AWS profiles) to allow SCF to provision and update AWS resources. These are required to use the Serverless Container Framework.

For more information on setting up AWS credentials, see the [SCF Getting Started guide](../getting-started.md).

## Configuration

At the root of the example, a `serverless.containers.yml` file defines the project configuration:

```yaml
name: deno

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
      type: awsLambda # Can be switched to awsFargateEcs
    build:
      options:
        - --target=awsLambda # Ensure you match the compute type set above. Sets the target build stage for the Dockerfile.
```

This file specifies:

- **Namespace:** The project name is `deno`, which is used as a prefix to namespace resources in your AWS account.
- **Deployment Type:** Uses the AWS API deployment type to configure networking (ALB, VPC, etc.).
- **Container Details:**
  - The source code is in the `./service` directory.
  - Routing rules specify a catch-all route (`/*`) with a defined health check endpoint (`/health`).
  - An environment variable (`HELLO`) is provided.
  - The default compute type is set to `awsLambda` but can be switched to `awsFargateEcs` as needed.

For more details on SCF configuration options, see the [SCF Configuration documentation](../configuration.md).

## Project Structure

```
example-deno/
├── serverless.containers.yml      # SCF project configuration file
└── service/
    ├── Dockerfile                 # Multi-stage Dockerfile for AWS Lambda and Fargate builds
    ├── deno.json                  # Deno configuration and task definitions
    ├── deno.lock                  # Deno lock file
    └── src/
        ├── index.ts               # Main application entrypoint (uses Oak and oakCors)
        └── public/
            └── css/
                └── styles.css     # Static assets (CSS, images, etc.)
```

## Development

Serverless Container Framework includes a rich development mode that emulates AWS ALB routing, AWS Lambda, and AWS Fargate ECS locally, including AWS Application Load Balancer emulation. This mode allows you to test routing, static asset delivery, and health check endpoints while running your container with Deno, which proxies requests on port `8080`.

Run the following command to start local development mode:

```bash
serverless dev
```

This command watches for changes and rebuilds the container as needed.

For more information on local development with SCF, see the [SCF Development documentation](../development.md).

## Deployment

To deploy this example with SCF, open your terminal in the `example-deno` directory.

Execute the following command to deploy your container to AWS:

```bash
serverless deploy
```

This command builds the Deno container image using the provided Dockerfile and provisions AWS resources (ALB, VPC, Lambda function, or ECS Fargate service).

If you switch compute types, ensure that you set the build `--target` option to the corresponding compute type, since the Dockerfile declares multiple build configurations.

Once deployed, SCF will output the URLs and endpoints (such as the ALB endpoint) for your application.

Access the application via the provided URL to see your Deno app live.

For more details on deployment options and processes, see the [SCF Deployment documentation](../deployment.md).

## Integrating with other resources

Serverless Container Framework supports the Serverless Framework Variables system to reference infrastructure details, secrets, and more from various sources:

```yaml
containers:
  service:
    environment:
      # Simple static value
      SERVICE_NAME: deno-service

      # Environment variable reference
      HELLO: ${env:HELLO_VALUE}

      # AWS Systems Manager Parameter Store reference
      API_ENDPOINT: ${aws:ssm:/path/to/api/endpoint}

      # AWS Secrets Manager reference
      API_KEY: ${aws:secretsmanager:DenoApiSecret.key}

      # HashiCorp Vault reference
      SERVICE_TOKEN: ${vault:secret/data/service/credentials.token}

      # HashiCorp Terraform state reference
      DATABASE_URL: ${terraform:outputs:database_url}

      # S3 bucket value reference
      CONFIG_JSON: ${aws:s3:config-bucket/deno-config.json}

      # CloudFormation stack output reference
      VPC_ID: ${aws:cf:networking-stack.VpcIdOutput}
```

For more details on using variables, see the [Serverless Framework Variables documentation](https://www.serverless.com/framework/docs/guides/variables).

## Cleanup

To remove the deployed containers, run:

```bash
serverless remove
```

To remove all AWS resources, including shared infrastructure, use:

```bash
serverless remove --force --all
```

## Additional Resources

- [Serverless Container Framework Documentation](../README.md)
- [Official Deno Website](https://deno.land/)
