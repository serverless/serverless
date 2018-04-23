<!--
title: Serverless Framework - Fn Events - Schedule
menuText: Schedule
menuOrder: 3
description:  Scheduled Events in Fn
layout: Doc
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->
### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/fn/events/schedule)
<!-- DOCS-SITE-LINK:END -->

# Fn Scheduled Events

Fn functions can be triggered following a certain schedule. The schedule can be specified events section of the `serverless.yml` following the Cron notation:

```
service: clock

provider:
  name: Fn
  runtime: nodejs6

plugins:
  - serverless-Fn

functions:
  clock:
    handler: handler.printClock
    events:
      - schedule: "* * * * *"
```

When deploying this `serverless.yml` file, Fn will create a Kubernetes cron job that will trigger the function `printClock` every minute.
