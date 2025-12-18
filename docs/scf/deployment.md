---
title: Serverless Container Framework - Deployment Guide
short_title: Deployment Guide
description: >-
  Learn how to deploy containerized applications using Serverless Container
  Framework.  Comprehensive guide to deployment and zero-downtime compute
  switching for AWS Lambda and ECS Fargate.
keywords:
  - Serverless Container Framework
  - Serverless Container Framework Deployment
  - Serverless Container Framework Compute Switching
  - Serverless Container Framework Zero-Downtime Deployments
  - AWS Lambda Deployment
  - AWS ECS Fargate Deployment
  - Container Deployment
  - Serverless Deployment
  - AWS Lambda Deployment
  - Fargate Deployment
  - Zero Downtime Deploy
  - Container Management
  - AWS Container Services
  - Deployment Process
  - Infrastructure Deployment
  - Cloud Deployment
  - DevOps Automation
  - Container Orchestration
  - AWS Resource Management
  - Deployment Strategy
  - Cloud Infrastructure
---

# Deployment

When you deploy with the Serverless Container Framework (SCF), an entire architecture is deployed, including your containers, to deliver a fully-fledged, production-ready API.

You can mix compute types within your architecture - for example, using Lambda for lightweight API endpoints and Fargate for data-intensive operations.

SCF also makes it easy to switch containers between compute types with zero-downtime.

By default, SCF will detect what changed since your last deployment, and only redeploy the containers that have changed.

Here is everything you need to know about deploying with SCF.

## Command

To deploy all of your containers, run the following command:

```bash
serverless deploy
```

### `--stage`

By default, the project will deploy all containers in the `dev` stage. You can target a different stage by using the `--stage` flag: `serverless deploy --stage prod`.

### `--force`

SCF checks for changes in your config or code. If only one container changed, for instance, it will only redeploy that container. This can significantly speed up deployments. However, you can also force a full deployment by using this flag.

### `--debug`

This flag will enable debug logging. If you encounter an issue, please enable debug logging and provide the logs to the Serverless team.

## Prerequisites

### AWS Credentials

SCF requires AWS credentials to deploy your containerized architecture. Configure your AWS credentials using one of these methods:

```bash
# Option 1: AWS CLI (recommended)
aws configure

# Option 2: Environment variables
export AWS_ACCESS_KEY_ID=your-key-id
export AWS_SECRET_ACCESS_KEY=your-access-key
export AWS_SESSION_TOKEN=your-session-token
```

### Docker

SCF requires Docker to build your container images.

### Essential Configuration

Before deploying, ensure you have the relevant configuration in your `serverless.containers.yml` file. Key fields typically include:

- `namespace`: The "namespace" and "stage" → used to generate unique resource names, track state, and separate multiple environments. All resources will be prefixed with the namespace and stage.

- `provider`: This project is designed to work with multiple cloud providers. The `provider` field is used to specify the cloud provider and region. Initially, the project supports AWS.

- `containers`: At minimum, each container should specify its `src` code directory and compute type.

## AWS Resources Provisioned

When you deploy with SCF using the `aws@1.0` deployment type, the following AWS resources are automatically provisioned to create a production-ready API architecture:

### Core Infrastructure

- **VPC (Virtual Private Cloud)**: Isolated network environment for your containers
- **Public Subnets**: Subnets across multiple Availability Zones for load balancer and container access
- **Security Groups**: Network access controls for containers and load balancer
- **Internet Gateway**: Enables internet access for public subnets

### Content Delivery & Routing

- **CloudFront Distribution**: Global content delivery network for improved performance and caching.
- **CloudFront Function**: A single Cloudfront function handles dynamic routing across compute types (AWS Lambda, AWS ECS Fargate), and clouds (coming soon). When routing to AWS ECS Fargate, requests will be routed to AWS Application Load Balancer, which will do any additional routing for paths, etc. When routing to AWS Lambda, requests will be routed to the respective AWS Lambda function URL. This function also handles routing across multiple, different domains.

### Load Balancing

- **Application Load Balancer (ALB)**: Routes incoming requests to your container Services and Tasks on AWS ECS Fargate.
- **Listener Rules**: Configures routing based on path patterns and domains

### Compute Resources

- **AWS Lambda Functions**: For containers configured with `awsLambda` compute type. Deployed with an AWS Lambda function URL.
- **ECS Cluster**: Container orchestration platform
- **ECS Services**: Manages running containers on Fargate
- **ECS Task Definitions**: Container specifications and resource requirements

### Container Registry

- **ECR Repositories**: Stores your container images securely

### DNS & SSL (when custom domains are used)

- **Route53 Records**: DNS routing for custom domains
- **ACM Certificates**: SSL/TLS certificates for HTTPS

### IAM & Security

- **IAM Roles**: Execution and task roles for containers
- **IAM Policies**: Permissions for accessing AWS services

### Monitoring & Logging

- **CloudWatch Log Groups**: Centralized logging for containers
- **CloudWatch Metrics**: Performance and health monitoring

All resources are automatically configured with security best practices and are optimized for the specific compute types you choose for your containers.

## Deployment Process

When you run the `deploy` command, SCF orchestrates several steps. This includes:

### Resolve AWS Credentials

SCF will fetch and resolve AWS credentials automatically if properly configured. AWS credentials are required to use SCF. It resolves AWS credentials through AWS profiles or AWS environment variables.

### Resolve Variables

Any Serverless Framework Variables within your configuration are resolved (e.g., environment variables or references to secrets on AWS SSM, Hashicorp Terraform state outputs, Vault, etc.). This can include stage-specific overrides or dynamic references.

### Ensure Docker is Running

SCF requires Docker to build your container images.

### Validate Config

The system checks that all required fields (e.g., `namespace`, `stage`, AWS `region`, etc.) are in place and have valid values.

### Check for Code & Configuration Changes

By default, SCF attempts to detect what needs updating. If only one container changed, for instance, it will only redeploy that container. This can significantly speed up deployments. You can also force a full deployment by using the `--force` flag. Code and configuration changes are detected by comparing the current state of your project with the last deployed state.

### Containerization

#### Auto-Containerization

If you do not have a Dockerfile within your container's `src` directory, SCF will attempt to auto-containerize your code using Cloud Native Buildpacks. Buildpacks, originally developed by Heroku and now maintained by Google and other CNCF members, automatically detect your application's language and dependencies to create optimized container images. They work by:

1. Detecting your application's runtime requirements (e.g., Node.js, Python, Java)
2. Installing necessary dependencies and compiling code if needed
3. Configuring appropriate environment variables and startup commands
4. Creating a secure, production-ready container image

When deploying to AWS Lambda, SCF automatically includes essential Lambda components:

- AWS Lambda Runtime Interface Emulator (RIE)
- AWS Lambda Web Adapter as a Lambda extension
- Lambda-compatible base images from AWS ECR
- Required Lambda environment variables and configurations

These Lambda-specific components are only included when deploying to AWS Lambda compute type. When deploying to AWS Fargate, SCF creates standard container images without the Lambda layers, as they are not needed and would only add unnecessary overhead. The same application code can run on either compute type, as SCF handles the appropriate containerization for each target platform.

#### Dockerfile Containerization

When using a custom Dockerfile, SCF will use it as-is without modification.

For AWS Fargate ECS deployments, SCF will use the Dockerfile as-is. No additional components are required. However, AWS Lambda requires a custom Dockerfile to be compatible. In this initial release of SCF, SCF does not automatically add essential AWS Lambda components to your container (coming soon).

In this case, your Dockerfile must include specific components to be Lambda-compatible:

1. Use an AWS Lambda base image:

```dockerfile
FROM public.ecr.aws/lambda/nodejs:20
```

AWS provides official base images for all supported Lambda runtimes in their public ECR repository. You can browse all available images at: https://gallery.ecr.aws/lambda

2. Or if using a custom base image, include these essential components:

```dockerfile
# Add Lambda Runtime Interface Emulator (RIE)
COPY --from=public.ecr.aws/lambda/nodejs:20 /usr/local/bin/aws-lambda-rie /aws-lambda-rie

# Add Lambda Web Adapter as an extension
COPY --from=public.ecr.aws/awsguru/aws-lambda-adapter:0.9.0 /lambda-adapter /opt/extensions/lambda-adapter

# Configure proper entrypoint for Lambda
ENTRYPOINT [ "/aws-lambda-rie" ]
CMD [ "app.handler" ]
```

For examples of Lambda-compatible Dockerfiles, see the AWS documentation: https://docs.aws.amazon.com/lambda/latest/dg/images-create.html

#### Build Containers

SCF will build the container images.

A build error on any container will halt the deployment. Build logs are shown only if there is an error or if the `--debug` flag is used.

You are able to pass build arguments to the build using the `args` configuration in the container's `build` configuration. Check out the configuration documentation for specifics.

#### Provision or Update AWS Resources

The deployment process uses AWS APIs (Cloudfront, ECS, Lambda, ALB, VPC, etc.) to do the following, depending on your configuration. CloudFormation or other infrastructure-as-code tools are not used. Given SCF seeks to only deploy a specific architecture, rather than deploy every architecture like other IaC tools, SCF can better optimize the deployment process for speed and safety. For example, solutions to common pitfalls of cloud services are built into SCF, and advanced deployment patterns like compute type switching are supported.

This includes but is not limited to:

- Configure and integrate networking resources: VPC subnets, security groups, an ALB for routing requests.
- Register or update DNS aliases with Route53 if you specified custom domains.
- If a custom domain is used, set-up the ALB to redirect incoming HTTP requests to HTTPS.

##### AWS Fargate ECS

When deploying to AWS Fargate ECS, our strategy uses a rolling deployment model. During an update, new tasks are launched alongside the existing ones by registering an updated task definition. The service continuously runs both old and new revisions until the new tasks pass all health checks before the old tasks are terminated.

We explicitly configure ECS with a deployment circuit breaker where both enable and rollback are set to true. This configuration actively monitors the deployment by tracking task health via AWS ALB health checks. If the system detects any failures (for example, if tasks do not return a 200 status on the designated health check path), the deployment is automatically rolled back to the previous stable version. These health checks target the ALB health check path specified in the container's `routing` configuration.

ALB listener rules are adjusted during the deployment to control traffic routing. By dynamically managing these rules based on the health check results, the system ensures that only tasks passing the health checks receive production traffic.

#### Store Deployment State

After provisioning, the project saves state data that helps with incremental deployments and resource tracking.

#### Completion & Output

Finally, you'll see logs or notices about the resources created or updated, along with any relevant URLs (ALB endpoints, etc.).

## Switching Compute Types

SCF enables seamless, zero-downtime transitions between compute types for live applications through a sophisticated orchestration process:

1. **Parallel Deployment**

   - New compute environment is provisioned alongside the existing one
   - Both Lambda and Fargate configurations can run simultaneously
   - Original environment continues serving traffic during transition

2. **Traffic Management**

   - An AWS Cloudfront Function instantly redirects requests once deployment of the new compute is complete and healthy.

3. **Safety Mechanisms**

   - Connection draining prevents request interruption
   - Continuous health monitoring throughout transition
   - State consistency verification at each step

4. **Completion**
   - Old compute resources are drained of connections
   - Resources are deprovisioned only after successful transition
   - Zero impact on application availability during the entire process
