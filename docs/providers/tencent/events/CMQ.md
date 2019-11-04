
# CMQ (Cloud Message Queue)

## Using a pre-existing topic

In the following example we choose a pre-existing CMQ topic with name `cmq_trigger`. The function will be called every time a message is sent to the `test-topic` topic.

```yml
functions:
  function_one:
    handler: index.main_handler
    runtime: Nodejs8.9
    events:
     - cmq:
         name: cmq_trigger
         parameters:
           name: test-topic
           enable: true
```

**Note:** CMQ triggers are enabled by default.

## Event Structure for CMQ Topic Trigger

When receiving a message, the specified CMQ Topic sends the following event data in JSON format to the bound SCF.

```json
{
  "Records": [
    {
      "CMQ": {
        "type": "topic",
        "topicOwner":120xxxxx,
        "topicName": "testtopic",
        "subscriptionName":"xxxxxx",
        "publishTime": "1970-01-01T00:00:00.000Z",
        "msgId": "123345346",
        "requestId":"123345346",
        "msgBody": "Hello from CMQ!",
        "msgTag": ["tag1","tag2"]
      }
    }
  ]
}
```