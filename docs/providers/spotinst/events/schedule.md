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

You can trigger the functions by using a scheduled event. This will execute the function according to the cron expressions you specify.

You can use `cron` syntax.

The following example is a function configuration in the serverless.yml file that are scheduled to trigger the function crawl every day at 6:30 PM.

```yml
functions:
  crawl:
    handler: handler.crawl
    cron: # Setup scheduled trigger with cron expression
      active: true
      value: '30 18 * * *'
```

## Active Status

You also have the option to set your functions active status as either true or false

**Note** `schedule` events active status are set to true by default

This example will create and attach a schedule event for the function `crawl` which is active status is set to `false`. If the status is changed to true the `crawl` function will be called every Monday at 6:00 PM.

```yml
functions:
  crawl:
    handler: handler.crawl
    cron: # Setup scheduled trigger with cron expression
      active: false
      value: '* 18 * * 1'
```

**Note** When creating a `cron` trigger the `value` is the crontab expression. For help on crontab check out the [documentation](http://www.adminschoice.com/crontab-quick-reference)
