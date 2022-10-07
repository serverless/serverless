<!--
title: Serverless Framework - Google Cloud Functions Guide - Events
menuText: Events
menuOrder: 6
description: Configuring Google Cloud Functions Events in the Serverless Framework
layout: Doc
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/google/guide/events)

<!-- DOCS-SITE-LINK:END -->

# Google - Events

Simply put, events are the things that trigger your functions to run.

If you are using Google Cloud Functions as your provider, all `events` in the service are anything in Google Cloud Functions that can trigger your Functions, like HTTP endpoints, pubSub messages, storage events, etc..

[View the Google Cloud Functions events section for a list of supported events](../events)

Upon deployment, the framework will set up the corresponding event configuration your `function` should listen to.

## Configuration

Events belong to each Function and can be found in the `events` property in `serverless.yml`.

```yml
# serverless.yml
functions:
  first: # Function name
    handler: http # Reference to file index.js & exported function 'http'
    events: # All events associated with this function
      - http: true
```

**Note:** Currently only one event definition per function is supported.

## Types

The Serverless Framework supports all of Google Cloud Functions events. Instead of listing them here, we've put them in a separate section. [Check out the events section for more information.](../events)

## Deploying

To deploy or update your Functions and Events run `serverless deploy`.
