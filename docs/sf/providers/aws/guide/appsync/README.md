<!--
title: Serverless Framework - AppSync
description: How to configure AWS AppSync with the Serverless Framework.
short_title: AppSync
keywords:
  [
    'Serverless Framework',
    'AppSync',
    'GraphQL',
    'AWS',
    'API',
    'resolvers',
    'data sources',
  ]
-->

# AppSync

Built-in support for AWS AppSync in the Serverless Framework. Deploy GraphQL APIs with resolvers, data sources, authentication, and more.

Huge thanks to the community contributors of the original [`serverless-appsync-plugin`](https://github.com/sid88in/serverless-appsync-plugin) - these capabilities now ship in the Framework by default.

## Migration from the community plugin

Migrating from the community plugin? This feature is included by default in the Framework. There is nothing to install.

Remove it from the `plugins` section of `serverless.yml` and from your dependencies. Keep your existing `appSync` configuration; the built-in integration continues to honor it.

## Quick start

```yaml
service: my-app

provider:
  name: aws

appSync:
  name: my-api

  authentication:
    type: API_KEY

  apiKeys:
    - name: myKey
      expiresAfter: 1M

  dataSources:
    my-table:
      type: AMAZON_DYNAMODB
      description: 'My table'
      config:
        tableName: my-table

  resolvers:
    Query.user:
      dataSource: my-table
```

## Configuration

- [General Configuration](general-config.md)
- [DataSources](dataSources.md)
- [Resolvers](resolvers.md)
- [Pipeline Functions](pipeline-functions.md)
- [Authentication](authentication.md)
- [API Keys](API-keys.md)
- [Custom Domain](custom-domain.md)
- [Caching](caching.md)
- [Delta Sync](syncConfig.md)
- [Web Application Firewall (WAF)](WAF.md)

## CLI

This integration adds CLI commands. See [CLI Commands](commands.md).

## Variables

Access AppSync values in your configuration:

- `${appsync:id}`: The id of the AppSync API
- `${appsync:url}`: The URL of the AppSync API
- `${appsync:arn}`: The ARN of the AppSync API
- `${appsync:apiKey.[NAME]}`: An API key

Example:

```yaml
provider:
  environment:
    APPSYNC_ID: ${appsync:id}
    APPSYNC_ARN: ${appsync:arn}
    APPSYNC_URL: ${appsync:url}
    APPSYNC_API_KEY: ${appsync:apiKey.myKey}

appSync:
  name: my-api

  authentication:
    type: API_KEY

  apiKeys:
    - name: myKey
```
