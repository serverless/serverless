---
title: Serverless Container Framework - Upgrading Guide
short_title: Upgrading Guide
description: >-
  Complete guide to upgrading from Serverless Container Framework v1 to v2.
  Learn about breaking changes, new features, and step-by-step migration
  instructions including deployment type updates and new integrations.
keywords:
  - Serverless Container Framework
  - SCF Upgrade
  - Migration Guide
  - Breaking Changes
  - Deployment Type
  - Integrations
  - AWS Configuration
  - Version Migration
  - SCF v2
  - Configuration Changes
---

# Upgrading from SCF v1 to v2

This guide will help you upgrade your Serverless Container Framework (SCF) projects from v1 to v2. SCF v2 introduces several new features and some breaking changes that require configuration updates and a specific migration process.

## Overview of Changes

### A Single, Powerful Architecture

In SCF v1, we introduced `deploymentType` to specify both the target cloud and the container architecture (e.g., an API on AWS or an event handler). Since then, we've found that a single architecture can support a wide range of use cases—such as synchronous request/response workflows and asynchronous event handling. As a result, we're simplifying `deploymentType` to only specify the target cloud with a new simplified deployment type `aws@1.0`. This change streamlines the deployment process and better positions us for future multi-cloud support.

However, this is a breaking change. `awsApi1.0` will still be supported, but all new features listed here and going forward will be in `aws1.0`. Follow the steps below to learn how to upgrade.

### Caching & Routing At The Edge

We've introduced routing via AWS CloudFront Functions for faster performance and greater flexibility in directing traffic to AWS ECS, Lambda, and more. This approach resolves key limitations of AWS Application Load Balancer—like lack of streaming support and the 1MB request/response header cap—by routing directly to Lambda via function URLs.

Further, switching workloads between compute services is now instantaneous, unlike the slower reconfiguration required with ALB. Additionally, with CloudFront as a first-class component, caching is built-in by default—making your deployments more production-ready out of the box.

### New Use Cases & Integrations

We've added a new `integrations` property to make it easier to connect your app with external services.

For complete integration configuration examples and options, see the [Container Integrations Configuration](./configuration.md#container-integrations-configuration) section.

#### AWS EventBridge Integration

You can now receive events from AWS EventBridge and define routing logic for them. SCF handles all the setup for subscriptions automatically.

```yaml
integrations:
  event-processor:
    type: awsEventBridge
    webhookPath: '/integrations/event-processor/eventbridge' # Optional; defaults to /integrations/<name>/eventbridge
    pattern: # Required: Event filtering criteria
      source: ['myapp.orders', 'myapp.users'] # Required
      detail-type: ['Order Created', 'User Registered'] # Optional
      detail: # Optional: Match specific fields in the event payload
        status: ['pending', 'processing']
```

#### Scheduled Tasks

Run scheduled jobs using the `schedule` integration. Ideal for periodic tasks like cleanups or data syncs.

```yaml
integrations:
  daily-cleanup:
    type: schedule
    webhookPath: '/integrations/daily-cleanup/schedule' # Optional; defaults to /integrations/<name>/schedule
    schedule: 'rate(1 day)' # Required: Schedule expression
```

#### Slack Integration

You can now connect SCF to Slack—useful for internal tools and AI agents. SCF supports both standard and socket mode.

```yaml
integrations:
  slack-notifications:
    type: slack
    name: 'API Notifications' # Required: Display name for the Slack app
    socketMode: false # Optional; defaults to false
    webhookPath: '/integrations/slack-notifications/slack' # Optional; defaults to /integrations/<name>/slack
    credentials: # Optional: Slack app credentials
      signingSecret: ${env:SLACK_SIGNING_SECRET} # Required
      botToken: ${env:SLACK_BOT_TOKEN} # Required
      appToken: ${env:SLACK_APP_TOKEN} # Required if socketMode is true
```

#### Enhanced IAM Configuration

SCF v2 provides improved AWS IAM role management with more flexible policy definitions. For details, see the [AWS IAM Configuration](./configuration.md#aws-iam-configuration) section.

### Breaking Changes

The `deploymentType` of `awsApi@1.0` has been replaced with `aws@1.0`. All new features listed here and going forward will be in the new `aws1.0` deployment type. Unfortunately, this will require decommissioning your current infrastructure using the `awsApi@1.0` deployment type and re-deploying a new stack with the new deployment type.

Follow the steps below to learn how to safely upgrade.

## Migration

We recommend deploying the new SCF deployment type (`aws@1.0`) **in parallel** with your existing `awsApi@1.0` setup. This allows for testing before decommissioning your current infrastructure.

### Backup Your Current Configuration

```bash
cp serverless.containers.yml serverless.containers.yml.backup
```

### Update Your Configuration

In your `serverless.containers.yml`, change the `name` property to create an entirely seperate stack of new infrastructure that does not have names that collide with existing infrastructure (in the case of testing on the same AWS account).

Next, change the deployment type:

```yaml
deployment:
  type: awsApi@1.0
```

to:

```yaml
deployment:
  type: aws@1.0
```

Be sure to remove any custom domains in the new config to avoid traffic redirection. SCF will give you a CloudFront domain by default for safe testing. You can reintroduce custom domains once you're confident in the new setup.

Refer to the [Configuration Guide](./configuration.md) for changes or new features you may want to adopt. You can always add new features in future deployments, after you've tested and migrated.

### Note on Architecture Changes

The new deployment routes all traffic through a CloudFront Function. This introduces:

* Better flexibility across compute types and clouds.
* Performance and cost implications. Test accordingly.
* Future support for editing the routing function.

### Deploy the New Stack

```bash
serverless deploy
```

### Final Cutover

Once verified, clean up:

1. Swap filenames.
2. Remove the old stack:

**Warning:** This will delete all associated AWS resources.

```bash
serverless remove --all --force
```

## Additional Resources

- [SCF Configuration Guide](./configuration.md)
- [SCF Development Guide](./development.md)
- [SCF Deployment Guide](./deployment.md)
- [SCF Examples](./examples/)

## Support

If you encounter issues during migration create a new [Github Issue](https://github.com/serverless/containers/issues).
