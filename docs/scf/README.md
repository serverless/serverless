---
title: Serverless Container Framework - Documentation
short_title: Serverless Container Framework
description: >-
  Develop and deploy containers seamlessly across AWS Lambda and AWS ECS
  Fargate. Develop containerized applications with hot reloading, local
  emulation, and automated infrastructure setup. The perfect bridge between
  serverless and containers.
keywords:
  - Serverless Container Framework
  - AWS Fargate
  - AWS Lambda
  - AWS ECS
  - Container Deployment
  - Serverless Containers
  - Docker Development
  - Application Load Balancer
  - Container Orchestration
  - Serverless Architecture
  - DevOps Automation
  - Infrastructure as Code
  - Cloud Native Development
  - Microservices Architecture
  - Local Container Development
  - Hot Reloading
---

![Serverless Container Framework](https://assets.serverless-extras.com/website/general/serverless-container-framework-docs-header.png)

# Serverless Container Framework

> **Update:** In June 2025, we launched a new version of SCF with many additional features. Review the [Upgrading Guide](./upgrading.md) to learn more. For documentation of the original SCF, visit the legacy docs [here](https://github.com/serverless/containers/tree/main/docs).

**One solution to deploy serverless workloads everywhere** - Serverless Container Framework (SCF) is a unified development and deployment experience for containers on serverless platforms.

The value of SCF lies in its Heroku-like experience for deploying containers on serverless platforms, without vendor lock-in. Deploy to any container-supporting serverless platform. While PaaS providers charge hefty markups based on compute usage, SCF charges only a fixed cost per each container you deploy. Even better, SCF's license is free for every developer/organization making less than $2 million in revenue per year.

SCF delivers an architecture that capable of massively scalable APIs and event handling. It uses AWS Cloudfront functions for request routing, allowing developers to freely mix and transition between AWS Lambda and AWS ECS Fargate compute options, accompanied by a rich development experience.

- [Examples](https://github.com/serverless/containers)
- [Overview Video (90 seconds)(V1)](https://youtu.be/KXNYemGzda4)
- [Feedback Form](https://form.typeform.com/to/iqaERaLP)

::youtube{id="KXNYemGzda4"}

## Features

### Unified Container Development & Deployment

- Deploy seamlessly to AWS Lambda and ECS Fargate via a single workflow (and more providers soon)
- Mix Lambda and Fargate compute within a single API
- Switch compute platforms instantly without code rewrites or downtime
- Optimize container builds automatically for each compute service
- Write Node.js and Python apps naturally - No Dockerfiles needed
- Get production-ready infrastructure in seconds with automated VPC, networking & ALB setup

### Rich Development Experience

- Develop Lambda and Fargate containers rapidly with true local emulation
- Route and simulate AWS ALB requests via localhost
- Accelerate development with instant hot reloading
- Inject live AWS IAM roles into your containers
- Enjoy an elegant logging and debugging experience

### Production-Ready Features

- Smart code/config change detection for deployments
- Supports one or multiple custom domains on the same API
- Automatic SSL certificate management
- Secure AWS IAM and network defaults
- Load environment variables from .env, AWS Secrets Manager, AWS Systems Manager Parameter Store, HashiCorp Vault, HashiCorp Terraform state, and more via [Serverless Framework Variables](https://www.serverless.com/framework/docs/guides/variables)
- Multi-cloud support coming soon

# Configuration

Serverless Container Framework offers simple YAML to deliver complex architectures via a `serverless.containers.yml` file. Here is a simple example of a full-stack application.

```yaml
name: acmeinc

deployment:
  type: aws@1.0

containers:
  # Web (Frontend)
  service-web:
    src: ./web
    routing:
      domain: acmeinc.com
      pathPattern: /*
    compute:
      type: awsLambda
  # API (Backend)
  service-api:
    src: ./api
    routing:
      domain: api.acmeinc.com
      pathPattern: /api/*
      pathHealthCheck: /health
    compute:
      type: awsFargateEcs
      awsFargateEcs:
        memory: 4096
        cpu: 1024
      environment:
        HELLO: world
      awsIam:
        customPolicy:
          Version: '2012-10-17'
          Statement:
            - Effect: Allow
              Action:
                - dynamodb:GetItem
              Resource:
                - '*'
    integrations:
      # Slack notifications for API errors
      error-alerts:
        type: slack
        name: 'API Error Alerts'
```
