---
title: Serverless Container Framework - CLI Reference
short_title: CLI Reference
description: >-
  Comprehensive guide to Serverless Container Framework CLI commands. Learn how to deploy, 
  develop, and manage containerized applications using SCF's powerful command line interface 
  with detailed examples and options.
keywords:
  - Serverless Container Framework
  - Serverless Container Framework CLI
  - Container Deployment Commands
  - Serverless Container Development Commands
  - AWS Container Management
  - AWS Lambda
  - AWS ECS
  - AWS Fargate
  - Serverless Development Tools
  - Container CLI Tools
  - DevOps Commands
  - Infrastructure Management
  - AWS Deployment Tools
  - Container Orchestration CLI
  - Serverless Framework Commands
  - Development Workflow
  - Container Management Tools
---

# CLI Reference

The Serverless Container Framework (SCF) provides several CLI commands to manage your containerized applications. Here's a comprehensive guide to all available commands.

## Commands

### `deploy`

Deploy your containers and foundational infrastructure:

```bash
serverless deploy
```

#### `--force`

Disregard config/code change detection and deploy all containers and infrastructure. By default, SCF uses intelligent change detection to perform incremental deployments.

### `dev`

Start a local development environment with hot-reloading and local AWS emulation:

```bash
serverless dev
```

### `info`

Display information about your deployed container services:

```bash
serverless info
```

### `remove`

Remove deployed container services:

```bash
serverless remove
```

#### `--all`

Remove all resources including shared infrastructure (e.g. VPC, ALB, ECS Cluster, etc.). Be careful when using this if some resources were created by other projects.

#### `--force`

Force removal of all resources including shared infrastructure without confirmation. Useful for CI/CD pipelines.

## Global Options

These options can be used with any command:

### `--stage`

Specify the stage to target (e.g., dev, staging, prod). Defaults to `dev` if not specified.

### `--debug`

Enable detailed debug logging. Useful for troubleshooting issues.

### `--aws-profile`

Specify which AWS credentials profile to use. This overrides the default AWS profile.
