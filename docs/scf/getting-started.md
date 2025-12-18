---
title: Serverless Container Framework - Getting Started
short_title: Getting Started
description: >-
  Quick start guide for Serverless Container Framework. Learn how to install,
  configure,  and deploy your first containerized application with step-by-step
  instructions for  AWS Lambda and AWS ECS Fargate.
keywords:
  - Serverless Container Framework
  - Serverless Container Framework Getting Started
  - Serverless Container Framework Quick Start
  - Serverless Container Framework Container Setup
  - Serverless Container Framework AWS Setup
  - Serverless Container Framework Installation Guide
  - Serverless Container Framework First Deployment
  - Serverless Container Framework Container Tutorial
  - Serverless Container Framework AWS Configuration
  - Serverless Container Framework Development Setup
  - Serverless Container Framework Docker Setup
  - Serverless Container Framework Initial Configuration
  - Serverless Setup
  - Container Basics
  - AWS Integration
---

# Getting Started

This guide will help you get started with Serverless Container Framework (SCF) by deploying a simple API.

### Prerequisites

- Node.js 20.x or later
- AWS Account with administrative access
- Docker installed and running

### Installation & Setup

1. SCF resides within the [Serverless Framework](https://github.com/serverless/serverless). Install the Serverless Framework CLI globally:

```bash
npm install -g serverless
```

2. Configure your AWS credentials using one of these methods. [Additional options can be found here.](https://www.serverless.com/framework/docs/providers/aws/guide/credentials)

```bash
# Option 1: AWS CLI (recommended)
aws configure

# Option 2: Environment variables
export AWS_ACCESS_KEY_ID=your-key-id
export AWS_SECRET_ACCESS_KEY=your-access-key
export AWS_SESSION_TOKEN=your-session-token
```

### Getting Started

1. Start with an example project by cloning the repository:

```bash
git clone https://github.com/serverless/containers.git
```

2. Navigate to the example project directory, and install any dependencies:

```bash
cd example-express/service
npm install
```

### Development

Ensure you are within the directory containing the `serverless.containers.yml` file.

```bash
cd example-express
```

Start the local development environment:

```bash
serverless dev
```

This starts a local emulation of AWS Application Load Balancer at `http://localhost:3000`. This will forward requests to your containers. Logs, requests and more from your containers will be available in the terminal. Your containers will auto-reload or rebuild on code changes.

### Deployment

Deploy to AWS:

```bash
serverless deploy
```

The initial deployment creates AWS resources (ALB, VPC, etc.) and takes ~5-10 minutes. Subsequent deploys are faster.

### Cleanup

Remove your deployment:

```bash
# Remove application only
serverless remove

# Remove all AWS resources including VPC
serverless remove --force
```

### Troubleshooting

- Ensure Docker daemon is running for local development
- Check AWS credentials are properly configured using `aws sts get-caller-identity`
- View detailed logs with `serverless dev --debug` or `serverless deploy --debug`
