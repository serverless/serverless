<!--
title: Serverless Framework - Apache OpenWhisk Guide - Events
menuText: Events
menuOrder: 6
description: Configuring Apache OpenWhisk Events in the Serverless Framework
layout: Doc
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/openwhisk/guide/events)

<!-- DOCS-SITE-LINK:END -->

# OpenWhisk - Events

Simply put, events are the things that trigger your functions to run.

If you are using Apache OpenWhisk as your provider, all `events` in the service are anything in Apache OpenWhisk that can trigger your Actions, like HTTP endpoints, message queues, database updates and cron-scheduled events.

[View the Apache OpenWhisk events section for a list of supported events](../events)

Upon deployment, the framework will set up the Triggers and Rules that correspond to that event and configure your `function` to listen to it.

## Configuration

Events belong to each Function and can be found in the `events` property in `serverless.yml`.

```yml
# 'functions' in serverless.yml
functions:
  createUser: # Function name
    handler: handler.createUser # Reference to file handler.js & exported function 'createUser'
    events: # All events associated with this function
      - http: GET /users/create
```

The `events` property is an array, because it is possible for functions to be triggered by multiple events, as shown

You can set multiple Events per Function, as long as that is supported by Apache OpenWhisk.

```yml
# 'functions' in serverless.yml
functions:
  createUser: # Function name
    handler: handler.users # Reference to file handler.js & exported function 'users'
    events: # All events associated with this function
      - http: GET /users/create
      - http: POST /users/update
      - trigger: 'custom trigger'
```

## Types

The Serverless Framework supports all of the Apache OpenWhisk events and more. Instead of listing them here, we've put them in a separate section, since they have a lot of configurations and functionality. [Check out the events section for more information.](../events)

## Deploying

To deploy or update your Functions, Events and Routes, run `serverless deploy`.
