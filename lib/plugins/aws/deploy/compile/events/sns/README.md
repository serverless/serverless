# Compile SNS Events

This plugins compiles the function SNS event to a CloudFormation resource.

## How it works

`Compile SNS Events` hooks into the [`deploy:compileEvents`](/lib/plugins/deploy) lifecycle.

It loops over all functions which are defined in `serverless.yaml`. For each function that has a SNS event defined,
a corresponding SNS topic will be created.

You have two options to define the SNS event:

The first one is to use a simple string which defines the "Topic name" for SNS. The lambda function will be triggered
every time a message is sent to this topic.

The second option is to define the SNS event more granular (e.g. the "Topic name" and the "Display name") with the help of
key value pairs.

Take a look at the [Event syntax examples](#event-syntax-examples) below to see how you can setup a SNS event.

A corresponding lambda permission resource is created for the SNS event.

Those two resources are then merged into the `serverless.service.resources.Resources` section.

## Event syntax examples

### Simple SNS setup

This setup specifies that the `forward` function should be run every time a message is sent to the "messages" SNS topic.

```yaml
# serverless.yaml
functions:
    forward:
        handler: message.forward
        events:
            - sns: messages
```

### SNS setup with extended event options

This configuration sets up a SNS topic with the name "lambda-caller". The "Display name" of the topic is "Used to chain
lambda functions".  The `run` function is executed every time a message is sent to the "lambda-caller" SNS topic.

```yaml
# serverless.yaml
functions:
    run:
        handler: event.run
        events:
            - sns:
                topic_name: lambda-caller
                display_name: Used to chain lambda functions
```
