# Compile Triggers

This plugins compiles the triggers in `serverless.yaml` to corresponding [OpenWhisk Triggers](https://github.com/openwhisk/openwhisk/blob/master/docs/actions.md)
definitions.

## How it works

`Compile Triggers` hooks into the [`deploy:compileEvents`](/lib/plugins/deploy) lifecycle.

It loops over all triggers which are defined in `serverless.yaml`.

Inside the resources loop it creates corresponding OpenWhisk Triggers definition based on the settings
(e.g. trigger properties or service provider defaults) which are provided in the `serverless.yaml` file.

The trigger will be identified by the `triggers` property identifier, using the
namespace from service provider defaults (unless set manually using the
`namespace` property).

Default parameters for each trigger can be set using the `parameters` property.

Connecting triggers to event feeds is supported through the `feed` and
`feed_parameters` properties, as shown in the example below.

```yaml
# serverless.yaml
resources:
    triggers:
        myTrigger:
            parameters: 
                hello: world
            feed: /whisk.system/alarms/alarm
            feed_parameters: 
                cron: '*/8 * * * * *'
```

At the end all OpenWhisk Trigger definitions are merged inside the `serverless.service.triggers` section.
