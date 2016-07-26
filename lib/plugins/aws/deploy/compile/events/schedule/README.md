# Compile Scheduled Events

This plugins compiles the function schedule event to a CloudFormation resource.

## How it works

`Compile Scheduled Events` hooks into the [`deploy:compileEvents`](/lib/plugins/deploy) lifecycle.

It loops over all functions which are defined in `serverless.yaml`. For each function that has a schedule event defined,
a CloudWatch schedule event rule will be created.

You have two options to define the schedule event:

The first one is to use a simple string which defines the rate the function will be executed.

The second option is to define the schedule event more granular (e.g. the rate or if it's enabled) with the help of
key value pairs.

Take a look at the [Event syntax examples](#event-syntax-examples) below to see how you can setup a schedule event.

A corresponding lambda permission resource is create for the schedule event.

Those two resources are then merged into the `serverless.service.resources.Resources` section.

## Event syntax examples

### Simple schedule setup

This setup specifies that the `greet` function should be run every 10 minutes.

```yaml
# serverless.yaml
functions:
  greet:
    handler: handler.hello
    events:
      - schedule: rate(10 minutes)
```

### Schedule setup with extended event options

This configuration sets up a disabled schedule event for the `report` function which will run every 2 minutes once
enabled.

```yaml
# serverless.yaml
functions:
  report:
    handler: handler.error
    events:
      - schedule:
          rate: rate(2 minutes)
          enabled: false
```
