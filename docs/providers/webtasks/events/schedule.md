<!--
title: Serverless Framework - Auth0 Webtasks Events - Scheduled & Recurring
menuText: schedule
menuOrder: 4
description: Setting up Scheduled, Recurring, CRON Task Events with Auth0 Webtasks via the Serverless Framework
layout: Doc
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->
### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/webtasks/events/schedule)
<!-- DOCS-SITE-LINK:END -->

# Schedule

The following config will attach a schedule event and causes the function `crawl` to be called every 2 hours. Auth0 Webtasks only support a single schedule per Function.

You can either use the `rate` or `cron` syntax.

```yml
functions:
  crawl:
    handler: crawl
    events:
      - schedule: rate(2 hours)
```

or with default cron syntax

```yml
functions:
  crawl:
    handler: crawl
    events:
      - schedule: cron(0 0/2 * * *)
```

**Note:** Auth0 Webtasks supports the 5 field crontab format. [CronTab.guru](http://crontab.guru/) is a useful site for calculating cron schedules. 