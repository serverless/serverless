<!--
title: Tencent Cloud - Serverless Cloud Function (SCF) Guide - Events | Serverless Framework
menuText: Events
menuOrder: 6
description: Configuring Tencent Cloud's Serverless Cloud Function events in the Serverless Framework
layout: Doc
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/tencent/guide/events/)

<!-- DOCS-SITE-LINK:END -->

# Tencent-SCF - Events

Simply put, events are the things that trigger your functions to run.

If you are using Tencent as your provider, all `events` in the service are anything in Tencent Cloud that can trigger an Serverless Cloud Function, like an COS bucket upload, an Cloud Kafka topic, and HTTP endpoints created via API Gateway.

[View the events section for a list of supported events](../events)

## Configuration

Events belong to each Function and can be found in the `events` property in `serverless.yml`.

```yml
# 'functions' in serverless.yml
functions:
  createUser: # Function name
    handler: handler.createUser # Reference to file handler.js & exported function 'createUser'
    events: # All events associated with this function
      - timer:
          name: timer
          parameters:
            cronExpression: '*/5 * * * *'
            enable: true
```

Events are objects, which can contain event-specific information.

The `events` property is an array, because it's possible for functions to be triggered by multiple events, as shown.

You can set multiple Events per Function, as long as that is supported by Tencnet Cloud and doesn't reach the limit.

```yml
# 'functions' in serverless.yml
functions:
  createUser: # Function name
    handler: handler.users # Reference to file handler.js & exported function 'users'
    events: # All events associated with this function
      - apigw:
          name: hello_world_apigw1
          parameters:
            stageName: release
            serviceId:
            httpMethod: ANY
      - apigw:
          name: hello_world_apigw2
          parameters:
            stageName: test
            serviceId:
            httpMethod: PUT
```

## Types

The Serverless Framework supports all of the Serverless Cloud Function events. Instead of listing them here, we've put them in a separate section, since they have a lot of configurations and functionality. [Check out the events section for more information.](../events)

## Deploying

To deploy or update your Functions, Events and Infrastructure, run `serverless deploy`.
