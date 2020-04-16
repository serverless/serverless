<!--
title: Serverless Framework - Knative Events - Google Cloud PubSub
menuText: Google Cloud PubSub
menuOrder: 3
description: Setting up a Google Cloud PubSub event source with Knative via the Serverless Framework
layout: Doc
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/knative/events/gcp-pub-sub/)

<!-- DOCS-SITE-LINK:END -->

# Google Cloud PubSub

Functions can be used as sinks for [Knative Eventing](https://knative.dev/docs/eventing) event sources such as Google Cloud PubSub.

Here's how to setup a function as an event sink for the Google Cloud PubSub event source:

```yaml
functions:
  myFunction:
    handler: gcr.io/knative-releases/github.com/knative/eventing-contrib/cmd/event_display:latest
    events:
      - gcpPubSub:
          project: my-project
          topic: my-topic
```
