<!--
title: Serverless Framework - Google Cloud Functions Events - Event
menuText: Event
menuOrder: 2
description: Setting up Event events with Google Cloud Functions via the Serverless Framework
layout: Doc
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/google/events/event)

<!-- DOCS-SITE-LINK:END -->

## Event

Your Google Cloud Function can be triggered by different `event` sources. Those event sources can be defined and configured with the help of the `event` event.

## Event events

This example sets up a `pubSub` event which will trigger the `first` function whenever a message is published to the `my-topic` topic.

```yml
# serverless.yml

functions:
  first:
    handler: pubSub
    events:
      - event:
          eventType: providers/cloud.pubsub/eventTypes/topic.publish
          resource: 'projects/${self:provider.project, ""}/topics/my-topic'
```

```javascript
// index.js

exports.pubSub = (event, callback) => {
  console.log('Hello World!');
  callback();
};
```

**Note:** See the documentation about the [function handlers](../guide/functions.md) to learn how your handler signature should look like to work this type of event.
