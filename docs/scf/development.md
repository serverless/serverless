---
title: Serverless Container Framework - Development Guide
short_title: Development
description: >-
  Master local development with Serverless Container Framework. Learn about
  emulating AWS Lambda and ECS Fargate locally with hot-reloading,  AWS IAM role
  testing, AWS Application Load Balancer (ALB) routing, and more.
keywords:
  - Serverless Container Framework
  - Serverless Container Framework Development
  - Serverless Container Framework Local Development
  - Serverless Container Framework Hot Reloading
  - Serverless Container Framework Container Development
  - Serverless Container Framework AWS IAM Testing
  - Serverless Container Framework Development Mode
  - Serverless Container Framework Node.js Development
  - Python Development
  - Docker Development
  - Development Tools
  - Local Testing
  - Container Testing
  - DevOps Tools
  - Development Workflow
  - Local Containers
  - Development Environment
---

# Development

When developing applications with the Serverless Container Framework (SCF), you can take advantage of the Dev Mode feature which provides a local development environment that closely mirrors your production setup. It provides the following benefits:

- Develop AWS Lambda and AWS Fargate containers rapidly with true local emulation
- Route and simulate AWS ALB requests via `localhost`
- Accelerate development with instant hot reloading
- Inject live AWS IAM roles into your containers
- Enjoy an elegant logging and debugging experience

## Command

To start Dev Mode for your SCF project:

```bash
serverless dev
```

### `--stage`

By default, the project will deploy all containers in the `dev` stage. You can target a different stage by using the `--stage` flag: `serverless dev --stage prod`.

### `--debug`

This flag will enable debug logging. If you encounter an issue, please enable debug logging and provide the logs to the Serverless team.

### `--port-proxy`

This option will set up the local proxy that emulates the AWS Application Load Balancer (ALB) routing to use a specific port. Otherwise, the default port is `3000`.

### `--port-control`

This option will set up the control plan that runs your containers locally to use a specific port. Otherwise, the default port is `3001`.

## Container Hot-Reloading

Dev Mode supports hot-reloading for:

- Node.js applications
- Python applications

When you make code changes, the containers automatically rebuild and restart while maintaining your application state.

### Node.js Hot-Reloading

For Node.js applications, Hot Module Reloading (HMR) is enabled by default. Your application will automatically restart when files change.

By default, SCF uses a file-watching tool (chokidar) to monitor changes in the source code.

However, the container's entrypoint script first checks for a "dev" command in the project's package.json and, when found, runs it to start the development process instead of the default HMR. If you want to customize your HMR or you are working with a framework that offers its own HMR, you can do so by adding a "dev" command to your project's package.json.

### Python Hot-Reloading

Python applications use watchdog to monitor file changes and trigger rebuilds automatically.

### Custom Dockerfiles

When using custom Dockerfiles, Dev Mode will still watch for file changes and trigger rebuilds.

## AWS IAM Role Testing

When developing locally, SCF enables testing with live AWS IAM roles, if they are configured for a container in `containers` and the architecture has been deployed to AWS in that stage.

For clarity, if you have deployed into a `dev` stage, and you run Dev Mode locally within that `dev` stage, the AWS IAM Roles for your project within that stage will be located in the live AWS account, temporary credentials for them will be created, and those credentials will be injected into your containers, allowing you to test exact IAM permissions that will be used in production.

If you have not deployed your stage to AWS, no AWS IAM Roles will be available and therefore no temporary credentials will be created.

This provides several key benefits:

- Test exact IAM permissions that will be used in production
- Catch permission issues before deployment
- Use and validate AWS service integrations locally

For example, if your container needs to access AWS S3 buckets or AWS DynamoDB tables, you can test these permissions locally using the actual IAM role that will be used in production.

**IMPORTANT:** Local development requires a specific AWS IAM trust policy to be injected into IAM roles. This trust policy allows the local development environment to assume the role. If you have already deployed your architecture to AWS, the `dev` command will automatically inject the trust policy into the IAM roles for your containers. **You'll want to ensure that you do not do this in your production environment.**
