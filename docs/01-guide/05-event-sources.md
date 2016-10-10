<!--
title: Setting up Events for your functions
menuText: Setting up Events
description: How to set up events triggering your functions
layout: Doc
-->

# Event sources

Serverless is used to build event driven architectures. Basically everything which can trigger a function is an event. Events could be HTTP requests, events fired from a cloud storage (like a S3 bucket), scheduled events, etc.

Events are provider specific, so not every event syntax is available for every provider. We're documenting every event in-depth in the provider specific documentation. Before we deep dive, lets look at how to add a simple HTTP Event to our function.

## Adding a HTTP event

Go to the Serverless service directory and open up the `serverless.yml`
file in your editor. First, we need to add an `events` property to the function to tell Serverless that this
function will have events attached:

```yml
functions:
  hello:
    handler: handler.hello
    events:
```

This `events` property is used to store all the event definitions for the function.
Each event will be added inside this `events` section. Events are added as an array as you can have multiple events of the same type associated with a function.

Let's add a `http` event with a path of `greet` and a method of `get`:

```yml
functions:
  hello:
    handler: handler.hello
    events:
      - http: GET greet
```

That's it. There's nothing more to do to setup a `http` event. Let's (re)deploy our service so that Serverless will
translate this event definition to provider specific syntax and sets it up for us.

## Updating our code

The `http` event we just added uses the [`LAMBDA-PROXY` integration type](../02-providers/aws/events/01-apigateway.md)
which means that we need to define the `response` we want to send in our functions code.

Serverless has you covered here and ships with a (yet commented out) callback you can use to send this required response
back to the client.

Open up the `handler.js` file and remove the callback at the top. Next up comment out the code for response sending.

Your `handler.js` file should now look like this:

```javascript
// Your first function handler
module.exports.hello = (event, context, callback) => {
  const body = {
    message: 'Go Serverless v1.0! Your function executed successfully!',
    input: event,
  };

  const response = {
    statusCode: 200,
    headers: {
      'custom-header': 'Custom header value',
    },
    body: JSON.stringify(body),
  };

  callback(null, response);
};
```

Great we're all set for a (re)deployment to update our service.

## (Re)deploying

We can redeploy our updated service by simply running `serverless deploy` again.
Serverless will show the progress on the terminal and tell you once the service is updated.

## Calling our HTTP endpoint

Let's test our deployed HTTP endpoint.

After deploying your service you should see the URL for your http endpoint in the terminal:

```bash
endpoints:
  GET - https://dxaynpuzd4.execute-api.us-east-1.amazonaws.com/dev/greet
```

We can now simply call it:

```bash
$ curl https://dxaynpuzd4.execute-api.us-east-1.amazonaws.com/dev/greet
```

You've successfully executed the function through the HTTP endpoint!

Serverless provides more than just a HTTP event source. You can find the full list of all available event sources with
corresponding examples in the provider specific docs:

* [AWS event documentation](../02-providers/aws/events/).

## Conclusion

Event sources are a great way to extend the functionality of your functions.
They are pretty easy to setup. You simply need to add them to the corresponding function in your services `serverless.yml` file and (re)deploy the service.

But what if you want to add custom provider specific resources to your service which are not yet available as event sources or through plugins?

Let's take a look at this now.

[Next step > Managing custom provider resources](./06-custom-provider-resources.md)
