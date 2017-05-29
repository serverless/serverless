<!--
title: Serverless Framework - Apache OpenWhisk Events - Triggers
menuText: Triggers
menuOrder: 2
description:  Setting up Apache OpenWhisk Triggers and Rules for Function Events
layout: Doc
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->
### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/openwhisk/events/streams)
<!-- DOCS-SITE-LINK:END -->

# Triggers

Functions are connected to event sources in OpenWhisk [using triggers and rules](https://github.com/apache/incubator-openwhisk/blob/master/docs/triggers_rules.md).
Triggers create a named event stream within the system. Triggers can be fired
manually or connected to external data sources, like databases or message
queues. 

Rules set up a binding between triggers and serverless functions. With an active
rule, each time a trigger is fired, the function will be executed with the
trigger payload.

Event binding using triggers and rules for functions can be configured through the `serverless.yaml` file.

```yaml
functions:
  my_function:
    handler: index.main
    events:
      - trigger: my_trigger
```
This configuration will create a trigger called `servicename-my_trigger` with an active rule binding `my_function` to this event stream. 

## Customising Rules

Rule names default to the following format `servicename-trigger-to-action`. These names can be explicitly set through configuration.

```yaml
functions:
  my_function:
    handler: index.main
    events:
      - trigger:
        name: "my_trigger"
        rule: "rule_name"
```

## Customising Triggers

Triggers can be defined as separate resources in the `serverless.yaml` file. This allows you to set up trigger properties like default parameters.

```yaml
functions:
  my_function:
    handler: index.main
    events:
      - trigger: my_trigger
      
resources:
  triggers:
    my_trigger:
      parameters: 
        hello: world            
```

## Trigger Feeds

Triggers can be bound to external event sources using the `feed` property. OpenWhisk [provides a catalogue](https://github.com/openwhisk/openwhisk/blob/master/docs/catalog.md) of third-party event sources bundled as [packages](https://github.com/openwhisk/openwhisk/blob/master/docs/packages.md#creating-and-using-trigger-feeds).

This example demonstrates setting up a trigger which uses the `/whisk.system/alarms/alarm` feed. The `alarm` feed will fire a trigger according to a user-supplied cron schedule.

```yaml
resources:
  triggers:
    alarm_trigger:
      parameters: 
        hello: world
      feed: /whisk.system/alarms/alarm
      feed_parameters: 
        cron: '*/8 * * * * *'
```
