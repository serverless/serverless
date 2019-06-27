<!--
title: Serverless Framework - Apache OpenWhisk Events - Scheduled & Recurring
menuText: Schedule
menuOrder: 4
description: Setting up Scheduled, Recurring, CRON Task Events with Apache OpenWhisk via the Serverless Framework
layout: Doc
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/openwhisk/events/schedule)

<!-- DOCS-SITE-LINK:END -->

# Schedule

This event allows you to set up scheduled invocations of your function.

The plugin automatically configures a trigger and rule to connect your function
to the trigger feed from the [alarm package](http://bit.ly/2xSomC5).

## Configuration

The `schedule` event configuration is controlled by a string, based on the UNIX
crontab syntax, in the format `cron(X X X X X)`. This can either be passed in
as a native string or through the `rate` parameter.

### Simple

The following config will attach a schedule event and causes the function `crawl` to be called every minute.

```yaml
functions:
  crawl:
    handler: crawl
    events:
      - schedule: cron(* * * * *) // run every minute
```

This automatically generates a new trigger (``\${service}\_crawl_schedule_trigger`) and rule (`\${service}\_crawl_schedule_rule`) during deployment.

### Customise Parameters

Other schedule event parameters can be manually configured, e.g trigger or rule names.

```yaml
functions:
  aggregate:
    handler: statistics.handler
    events:
      - schedule:
          rate: cron(0 * * * *) // call once an hour
          trigger: triggerName
          rule: ruleName
          max: 10000 // max invocations, default: 1000, max: 10000
          params: // event params for invocation
            hello: world
```
