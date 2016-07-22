# Event sources

Serverless is used to build event driven architecture. Basically everything which can trigger a function is an event.
Events could be HTTP requests, events fired from a cloud storage (like a S3 bucket), scheduled events, etc.

Let's add a HTTP event to our services `hello` function so that the function get's called whenever a corresponding HTTP
event will come in.

## Adding a HTTP event

Go to the Serverless service directory and open up the [`serverless.yaml`](../understanding-serverless/serverless-yaml.md)
file in your favorite editor. At first we need to add an `events` property to the function to tell Serverless that this
function will have events attached:

```yaml
functions:
  hello:
    handler: handler.hello
    events:
```

This `events` property is used to store all the event definitions for the function.
Each event will be added inside this `events` section.

Let's add a `http` event with a path of `greet` and a method of `get`:

```yaml
functions:
  hello:
    handler: handler.hello
    events:
      - http:
        path: greet
        method: get
```

That's it. There's nothing more to do to setup a `http` event. Let's (re)deploy our service so that Serverless will
translate this event definition to provider specific syntax and sets it up for us.

## (Re)deploying

We can redeploy our updated service by simply running `serverless deploy` again.
Serverless will show the progress on the terminal and tell you once the service is updated.

## Calling our HTTP endpoint

Let's test our deployed HTTP endpoint.

Open up the AWS console and navigate to the `API Gateway` service section. You should see a deployed API Gateway for
the Serverless service.

Click on the API for the service and navigate to the `resources` section on the left.

You should now see the `greet` resource which is accessible through the `/greet` path and wired up to a `GET` HTTP method.
Click on `GET` to open up the API endpoint. Next up click on the lightning icon with the label `test`.

In the next window click on the blue `test` button and see the result on the right hand side.

You've successfully executed the function through the HTTP endpoint!

## [More event sources](overview-of-event-sources.md)

Serverless provides more than just a HTTP event source. You can find the full list of all available event sources with
corresponding examples [here](overview-of-event-sources.md).

## Conclusion

Event sources are a great way to extend the functionality of your functions.
They are pretty easy to setup. You simply need to add them to the corresponding function in your services
[`serverless.yaml`](../understanding-serverless/serverless-yaml.md) file and (re)deploy the service.

But what if you want to add custom provider specific resources to your service which are not yet available as event
sources or through plugins?

Let's take a look at this now.

[Next step > Managing custom provider resources](custom-provider-resources.md)
