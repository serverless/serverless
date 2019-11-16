<!--
title: Serverless Framework - Apache OpenWhisk Events - IBM Message Hub
menuText: Message Hub
menuOrder: 4
description: Follow Apache Kafka queue messages from IBM's Message Hub service with Apache OpenWhisk via the Serverless Framework
layout: Doc
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/openwhisk/events/messagehub)

<!-- DOCS-SITE-LINK:END -->

# Message Hub

This event allows you to connect functions to [IBM Message Hub](https://developer.ibm.com/messaging/message-hub/), a scalable message bus in the cloud, based upon [Apache Kafka](https://kafka.apache.org/). Functions are invoked with messages that are added to a Kafka topic.

This event utilise the trigger feed provided by the [Message Hub package](https://github.com/openwhisk/openwhisk-package-kafka).

## Setup

[IBM Message Hub](https://developer.ibm.com/messaging/message-hub/) instances can be provisioned through the [IBM Bluemix](https://console.ng.bluemix.net) platform. OpenWhisk on Bluemix will export Message Hub service credentials bound to a package with the following name:

```
/${BLUEMIX_ORG}_${BLUEMIX_SPACE}/Bluemix_${SERVICE_NAME}_Credentials-1
```

## Configuration

Users need to pass the message hub credentials and the kafka topic to listen for messages on when defining the event.

### Using Package Credentials

Rather than having to manually define all authentication properties needed by the Message Hub trigger feed, you can reference a package which provides these properties as default parameters.

Developers only need to add the kafka topic to listen for messages on with each event.

```yaml
# serverless.yaml
functions:
  index:
    handler: users.main
    events:
      - message_hub:
          package: /${BLUEMIX_ORG}_${BLUEMIX_SPACE}/Bluemix_${SERVICE_NAME}_Credentials-1
          topic: my_kafka_topic
```

_Optional parameters `json`, `binary_key`, `binary_value` are also supported._

The configuration will create a trigger called `${serviceName}_${fnName}_messagehub_${db}` and a rule called `${serviceName}_${fnName}_messagehub_${db}_rule` to bind the function to the database update events.

The trigger and rule names created can be set explicitly using the `trigger` and `rule` parameters.

### Using Manual Parameters

Authentication credentials for the Message Hub event source can be defined explicitly, rather than using pulling credentials from a package.

```yaml
# serverless.yaml
functions:
  index:
    handler: users.main
    events:
      - message_hub:
          topic: my_kafka_topic
          brokers: afka01-prod01.messagehub.services.us-south.bluemix.net:9093
          user: USERNAME
          password: PASSWORD
          admin_url: https://kafka-admin-prod01.messagehub.services.us-south.bluemix.net:443
          json: true
          binary_key: true
          binary_value: true
```

`topic`, `brokers`, `user`, `password` and `admin_url` are mandatory parameters.

### Binding Multiple Functions

Other functions can bind to the same database event being fired using the inline `trigger` event and referencing this trigger name.

```yaml
# serverless.yaml
functions:
    index:
        handler: users.main
        events:
            - message_hub:
                package: /${BLUEMIX_ORG}_${BLUEMIX_SPACE}/Bluemix_${SERVICE_NAME}_Credentials-1
                topic: my_kafka_topic
                trigger: log_events
                rule: connect_index_to_kafka
     another:
        handler: users.another
        events:
            - trigger: log_events
```

## Event Details

The payload of that trigger event will contain a `messages` field which is an array of messages that have been posted since the last time your trigger fired.

The JSON representation of a sample event is as follows:

```json
{
  "messages": [
    {
      "partition": 0,
      "key": "U29tZSBrZXk=",
      "offset": 421760,
      "topic": "mytopic",
      "value": "Some value"
    }
  ]
}
```

For more details on the exact semantics of the message properties, please see the [trigger feed documentation](https://github.com/openwhisk/openwhisk-package-kafka).
