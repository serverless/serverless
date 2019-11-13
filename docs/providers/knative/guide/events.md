<!--
title: Knative - Knative Guide - Events | Serverless Framework
menuText: Events
menuOrder: 7
description: Configuring Knative Eventing events sources in the Serverless Framework
layout: Doc
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/knative/guide/events/)

<!-- DOCS-SITE-LINK:END -->

# Knative - Events

Simply put, events are the things that trigger your functions to run.

If you are using Knative as your provider, all `events` in the service are anything [Knative Eventing](https://knative.dev/docs/eventing) supports as an [event source](https://knative.dev/docs/eventing/sources/). Such event sources can be e.g. AWS SQS, Kafka, CronJob or Custom events.

[View the events section for a list of supported events](../events)

## Configuration

Events belong to each Function and can be found in the `events` property in `serverless.yml`.

```yaml
functions:
  createUser:
    handler: create-user.dockerfile
    events:
      - cron:
          schedule: '* * * * *'
          data: '{ "message": "Hello world from a Cron event source!" }'
```

Events are objects, which can contain event-specific information.

The `events` property is an array, because it's possible for functions to be triggered by multiple events, as shown.

You can set multiple events per Function, as long as you're using the event type once and it's supported by [Knative Eventing](https://knative.dev/docs/eventing).

```yaml
functions:
  createUser:
    handler: create-user.dockerfile
    events:
      - cron:
          schedule: '* * * * *'
          data: '{ "message": "Hello world from a Cron event source!" }'
      - custom:
          filter:
            attributes:
              type: greeting
```

## Types

The Serverless Framework supports several [Knative Evening](https://knative.dev/docs/eventing) event sources. Instead of listing them here, we've put them in a separate section, since they have a lot of configurations and functionality. [Check out the events section for more information.](../events)

## Deploying

To deploy or update your functions and events, run `serverless deploy`.
