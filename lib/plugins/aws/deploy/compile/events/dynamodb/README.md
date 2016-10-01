# Compile DynamoDB Events

This plugins compiles the function dynamodb event to a CloudFormation resource.

## How it works

`Compile DynamoDB Events` hooks into the [`deploy:compileEvents`](/lib/plugins/deploy) lifecycle.

It loops over all functions which are defined in `serverless.yml`. For each function that has a dynamodb event defined,
an event source mapping will be created.

You have two options to define the dynamodb event:

The first one is to use a simple string which represents the streams arn.

The second option is to define the dynamodb event more granular (e.g. the batch size or the staring position) with the help of
key value pairs.

Take a look at the [Event syntax examples](#event-syntax-examples) below to see how you can setup a dynamodb event.

The necessary lambda execution policies are created alongside the dynamodb event.

Those two resources are then merged into the compiled CloudFormation template.

## Event syntax examples

### Simple dynamodb setup

This setup specifies that the `compute` function should be triggered whenever the corresponding dynamodb table is modified (e.g. a new entry is added).

```yml
# serverless.yml
functions:
  compute:
    handler: handler.compute
    events:
      - dynamodb: some:dynamodb:stream:arn
```

### Dynamodb setup with extended event options

This configuration sets up dynamodb event for the `preprocess` function which has a batch size of `100`. The staring position is
`LATEST`.

```yml
# serverless.yml
functions:
  preprocess:
    handler: handler.preprocess
    events:
      - dynamodb:
          streamArn: some:dynamodb:stream:arn
          bathSize: 100
          startingPosition: LATEST
```
