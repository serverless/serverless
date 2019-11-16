<!--
title: Serverless Framework - Knative Events - CronJob
menuText: CronJob
menuOrder: 5
description: Setting up a CronJob event source with Knative via the Serverless Framework
layout: Doc
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/knative/events/cron/)

<!-- DOCS-SITE-LINK:END -->

# CronJob

Functions can used as sinks for [Knative Eventing](https://knative.dev/docs/eventing) event sources such as CronJob.

Here's how to setup a function as an event sink for the CronJob event source:

```yaml
functions:
  myFunction:
    handler: gcr.io/knative-releases/github.com/knative/eventing-contrib/cmd/event_display:latest
    events:
      - cron:
          schedule: '* * * * *'
          data: '{"message": "Hello world from a Cron event source!"}'
```
