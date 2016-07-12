# Compile Alexa Skills Kit Events

This plugins compiles the Alexa Skills Kit event to a CloudFormation resource.

## How it works

`Compile Alexa Skills Kit Events` hooks into the [`deploy:compileEvents`](/lib/plugins/deploy) lifecycle.

It loops over all functions which are defined in `serverless.yaml`. For each function that has an `ask`
event defined, a lambda permission for the current function is created which makes is possible to invoke the
function when the skill is spoken.

Take a look at the [Event syntax examples](#event-syntax-examples) below to see how you can setup an Alexa Skills Kit event.

The resource is then merged into the `serverless.service.resources.Resources` section.

## Event syntax examples

```yaml
# serverless.yaml
functions:
    greet:
        handler: handler.hello
        events:
            - ask
```
