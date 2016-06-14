# awsCompileScheduledEvents

This plugins compiles the function schedule event to to a CloudFormation resource.

## How it works

`awsCompileScheduledEvents` hooks into the [`deploy:compileEvents`](/docs/plugins/core/deploy.md) hook.

It loops over all functions which are defined in `serverless.yaml`. For each function that has a schedule event defined,
a CloudWatch schedule event rule will be created with a status of "enabled" and targeting the lambda function the event
is defined within.

Furthermore a lambda permission for the current function is created which makes is possible to invoke the function at
the specified schedule.

Those two resources are then merged into the `serverless.service.resources.aws.Resources` section.

## Event syntax

To schedule a function you can add the `schedule` event source to the `events` section of the `serverless.yaml` file:

```yaml
functions:
  greet:
    handler: handler.hello
    events:
      aws:
        schedule: rate(10 minutes)
```

