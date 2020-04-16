<!--
title: Serverless Framework - Knative Events - Custom
menuText: Custom
menuOrder: 1
description: Setting up a Custom event source with Knative via the Serverless Framework
layout: Doc
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/knative/events/custom/)

<!-- DOCS-SITE-LINK:END -->

# Kafka

Functions can use as sinks for [Knative Eventing](https://knative.dev/docs/eventing) event sources such as custom Triggers. Such Triggers will listen to events originating from your `default` Broker of your Knative installation.

Here's how to setup a function as an event sink for a custom Trigger event source:

```yaml
functions:
  myFunction:
    handler: gcr.io/knative-releases/github.com/knative/eventing-contrib/cmd/event_display:latest
    events:
      - custom:
          filter: # this attribute is used to filter events based on CloudEvents attributes
            attributes:
              type: greeting
```
