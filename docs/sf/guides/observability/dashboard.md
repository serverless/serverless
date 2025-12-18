<!--
title: Serverless Framework - Serverless Dashboard Observability
description: How to configure observability for your Serverless Framework services using the Serverless Dashboard.
short_title: Dashboard Observability
keywords: ['Serverless Framework', 'Observability', 'Monitoring', 'Serverless Dashboard']
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/guides/observability/dashboard)

<!-- DOCS-SITE-LINK:END -->

# Serverless Dashboard

The Serverless Dashboard is a powerful tool that provides insights into the behavior, performance, and health of your serverless applications. It allows you to monitor and troubleshoot your services, set up alerts, and view logs.

## Enabling Serverless Dashboard

To enable the Serverless Dashboard for your service:

1. If you don't already have a Serverless Framework account, create a new account at https://app.serverless.com.
2. Add the `app` and `org` top-level properties in your `serverless.yml` file if they are not already specified.
3. Add the `observability` property to the `stages` block in your `serverless.yml` file and use `dashboard` or `true` value as the provider.

```yaml
# Ensure these properties are present to connect to the Dashboard
org: my-org
app: my-app

# Control observability instrumentation settings under stages
stages:
  prod:
    observability: true # or observability: dashboard
```

To learn more about the Serverless Dashboard, visit the [Serverless Dashboard Monitoring & Observability documentation](../dashboard/monitoring/README.md).
