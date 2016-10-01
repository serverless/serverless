# Compile Stream Events

This plugins compiles the function stream event to a CloudFormation resource.

## How it works

`Compile Stream Events` hooks into the [`deploy:compileEvents`](/lib/plugins/deploy) lifecycle.

It loops over all functions which are defined in `serverless.yml`. For each function that has a stream event defined,
an event source mapping will be created.

You have two options to define the stream event:

The first one is to use a simple string which represents the streams arn.

The second option is to define the stream event more granular (e.g. the batch size, starting position or if it's enabled / disabled) with the help of
key value pairs.

Take a look at the [Event syntax examples](#event-syntax-examples) below to see how you can setup a stream event.

The necessary lambda execution policies are created alongside the stream event.

Those two resources are then merged into the compiled CloudFormation template.

## Event syntax examples

### Simple stream setup

This setup specifies that the `compute` function should be triggered whenever the corresponding DynamoDB table is modified (e.g. a new entry is added).

```yml
# serverless.yml
functions:
  compute:
    handler: handler.compute
    events:
      - stream: some:dynamodb:stream:arn
```

### Stream setup with extended event options

This configuration sets up a disabled Kinesis stream event for the `preprocess` function which has a batch size of `100`. The starting position is
`LATEST`.

```yml
# serverless.yml
functions:
  preprocess:
    handler: handler.preprocess
    events:
      - stream:
          arn: some:kinesis:stream:arn
          bathSize: 100
          startingPosition: LATEST
          enabled: false
```
