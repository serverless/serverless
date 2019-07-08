<!--
title: Serverless Framework - Kubeless Events - Schedule
menuText: Schedule
menuOrder: 3
description:  Scheduled Events in Kubeless
layout: Doc
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/kubeless/events/schedule)

<!-- DOCS-SITE-LINK:END -->

# Kubeless Scheduled Events

Kubeless functions can be triggered following a certain schedule. The schedule can be specified events section of the `serverless.yml` following the Cron notation:

```
service: clock

provider:
  name: kubeless
  runtime: nodejs6

plugins:
  - serverless-kubeless

functions:
  clock:
    handler: handler.printClock
    events:
      - schedule: "* * * * *"
```

When deploying this `serverless.yml` file, Kubeless will create a Kubernetes cron job that will trigger the function `printClock` every minute.
