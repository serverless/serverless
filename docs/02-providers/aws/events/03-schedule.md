<!--
title: AWS S3 Event configuration
layout: Doc
-->

# Schedule

The following config will attach a schedule event and causes the function `crawl` to be called every 2 hours. The configuration allows you to attach multiple schedules to the same function. You can either use the `rate` or `cron` syntax. Take a look at the [AWS schedule syntax documentation](http://docs.aws.amazon.com/AmazonCloudWatch/latest/events/ScheduledEvents.html) for more details.

```yml
functions:
  crawl:
    handler: crawl
    events:
      - schedule: rate(2 hours)
      - schedule: cron(0 12 * * ? *)
```

## Enabling/Disabling functions

This will create and attach a schedule event for the `aggregate` function which is disabled. If enabled it will call
the `aggregate` function every 10 minutes.

```yml
functions:
  aggregate:
    handler: statistics.handler
    events:
      - schedule:
          rate: rate(10 minutes)
          enabled: false
```
