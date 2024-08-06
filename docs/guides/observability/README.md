<!--
title: Serverless Framework - Observability
description: How to configure observability for your Serverless Framework services
short_title: Observability
keywords: ['Serverless Framework', 'Observability', 'Monitoring']
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/guides/observability)

<!-- DOCS-SITE-LINK:END -->

# Observability

Observability is a crucial aspect of managing and maintaining your serverless applications. It provides insights into the behavior, performance, and health of your services. The Serverless Framework allows you to automatically configure observability for your services.

## Enabling Observability

The Serverless Framework supports multiple observability providers. You can configure it to work with your preferred provider using the `observability` property within the `stages` block in your `serverless.yml` file.
Below is an example of how to enable the Serverless Dashboard observability feature for the `prod` stage:

```yaml
stages:
  prod:
    observability: dashboard
```

## Configuring Observability

For more granular control, you can specify the observability key as an object and include additional properties. In this configuration, the `provider` key is required, and you must specify the desired provider.

```yaml
stages:
  prod:
    observability:
      provider: dashboard
      # additional configuration options for the chosen provider
      exampleSetting: customValue
```

## Next Steps

Learn more about configuring and using our supported observability providers:

- [Serverless Dashboard](./dashboard)
- [Axiom](./axiom)
