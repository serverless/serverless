<!--
title: Serverless Framework - Spotinst Functions Events - Scheduled & Recurring
menuText: Schedule
menuOrder: 4
description: Setting up Scheduled, Recurring, CRON Task Events with Spotinst Functions via the Serverless Framework
layout: Doc
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->
### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/spotinst/events/schedule)
<!-- DOCS-SITE-LINK:END -->

# Schedule

You can trigger the functions by using a scheduled event. This will execute the function according to the cron expressions you specify

You can either use the `rate` or `cron` syntax.

```yml
functions:
  crawl:
    handler: crawl
    events:
      - schedule: cron(0 12 * * ? *)
```
