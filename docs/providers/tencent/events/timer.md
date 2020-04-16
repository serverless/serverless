<!--
title: Serverless Framework - Tencent-SCF Events - Timer
menuText: Timer
menuOrder: 9
description:  Setting up Timer Events with Tencent-SCF via the Serverless Framework
layout: Doc
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/tencent/events/timer/)

<!-- DOCS-SITE-LINK:END -->

# Timer

The following config will attach a timer trigger and causes the function `hello_world` to be called every 5 seconds. The configuration allows you to attach multiple timer triggers to the same function. You can use the `cron` syntax. Take a look at the [Timer documentation](https://intl.cloud.tencent.com/document/product/583/9708) for more details.

```yaml
functions:
  hello_world:
    handler: index.main_handler
    runtime: Nodejs8.9

    events:
      - timer:
          name: timer
          parameters:
            cronExpression: '*/5 * * * *'
            enable: true
```

## Enabling / Disabling

**Note:** timer triggers are enabled by default.

This will create and attach a timer for the `function_two` function which is disabled. If enabled it will call the `function_two` function every 1 minutes.

```yaml
functions:
  function_two:
    handler: index.main_handler
    runtime: Nodejs8.9

    events:
      - timer:
          name: timer
          parameters:
            cronExpression: '0 */1 * * *'
            enable: false
```

## Specify Name of Timer

Name can be specified for a timer.

```yaml
events:
  - timer:
      name: your-timer-name
```

## Input Parameters of Timer

When a timer trigger triggers a function, the following data structures are encapsulated in "event" and passed to the function. In addition, you can specify to pass the "message" for a timer trigger, which is null by default.

```json
{
  "Type": "timer",
  "TriggerName": "EveryDay",
  "Time": "2019-02-21T11:49:00Z",
  "Message": "user define msg body"
}
```
