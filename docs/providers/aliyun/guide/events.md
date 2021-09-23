<!--
title: Serverless Framework - Alibaba Cloud Function Compute Guide - Events
menuText: Events
menuOrder: 6
description: Configuring Alibaba Cloud Function Compute Events in the Serverless Framework
layout: Doc
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/aliyun/guide/events)

<!-- DOCS-SITE-LINK:END -->

# Alibaba Cloud - Events

Simply put, events are the things that trigger your functions to run.

If you are using Alibaba Cloud as your provider, `events` in the service are limited to the Alibaba Cloud triggers HTTP and OSS.

[View the Alibaba Cloud Function Compute events section for a list of supported events](../events)

Upon deployment, the framework will set up the corresponding event configuration your `function` should listen to.

## Configuration

Events belong to each Function and can be found in the `events` property in `serverless.yml`.

```yml
# serverless.yml
functions:
  first: # Function name
    handler: index.http # Reference to file index.js & exported function 'http'
    events: # All events associated with this function
      path: /foo
      method: get
```

**Note:** Currently only one event definition per function is supported.

## Types

The Serverless Framework supports the Alibaba Cloud Function Compute events `oss` and `http`. Instead of listing them here, we've put them in a separate section. [Check out the events section for more information.](../events)

## Deploying

To deploy or update your Functions and Events run `serverless deploy`.
