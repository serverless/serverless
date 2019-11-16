<!--
title: Serverless Framework - Azure Functions Guide - Events
menuText: Events
menuOrder: 6
description: Configuring Azure Functions Events in the Serverless Framework
layout: Doc
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/azure/guide/events)

<!-- DOCS-SITE-LINK:END -->

# Azure - Events

Simply put, events are the things that trigger your functions to run.

If you are using Azure Functions as your provider, all `events` in the service are anything in Azure Functions that can trigger your Functions, like HTTP endpoints, message queues, blob updates, and cron-scheduled events. In Azure Functions, events are called "Triggers" and are defined as a binding. You can also set additional input and output bindings which make it easy to get data from table storage or send message to queue services, for example.

[View the Azure Functions events section for a list of supported events](../events)

Upon deployment, the framework will set up the Triggers and Rules that correspond to that event and configure your `function` to listen to it.

## Configuration

Events belong to each Function and can be found in the `events` property in `serverless.yml`.

```yml
# 'functions' in serverless.yml
functions:
  createUser: # Function name
    handler: handler.createUser # Reference to file handler.js & exported function 'createUser'
    events: # All events associated with this function
      - http: true
```

The events property is an array, in this case, because I can also use it do define my input and output bindings.

```yml
queuejs:
  handler: templates/handler.helloQueue
  events:
    - queue: YourQueueName
      x-azure-settings:
        connection: StorageAppSettingName
    - blob:
      x-azure-settings:
        name: bindingName
        direction: in
```

## Types

The Serverless Framework supports all of the Azure Functions events and more. Instead of listing them here, we've put them in a separate section, since they have a lot of configurations and functionality. [Check out the events section for more information.](../events)

## Deploying

To deploy or update your Functions, Events and Routes, run `serverless deploy`.
