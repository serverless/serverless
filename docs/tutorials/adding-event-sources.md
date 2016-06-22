# Adding event sources

Serverless is used to build event driven architecture. Basically everything a function can trigger is an event.
Events could be HTTP requests, events fired from a cloud storage, scheduled events, etc.

This tutorial will show you how you can add event sources to your Serverless service.

We'll assume that you have Serverless v1.0 or greater installed on your machine.

Our provider we use throughout the tutorial will be Amazon web services (AWS).

**Note:** This tutorial will implement a schedule event for a function which is deployed to Amazon web services.
You can re-use this tutorial to add [other event sources](/docs/guide/event-sources.md)
(even from other providers) to your functions.

## Scheduling a function

Let's pretend we want to re-run our function every 10 minutes. One solution would be to open up the cloud provider dashboard
and run the function by hand but this is of course not the best way to solve our problem.

You might be familiar with so called "Cron jobs" if you're a UNIX user. Cron jobs are a way to define reoccurring
tasks the operating system will trigger automatically (e.g. some sort of scripts that automates something for you).

AWS has introduced a similar way we can automate the way our lambda function get's called.

## Adding the schedule event source

Let's add a schedule event source to a function in our Serverless service.

Go to the Serverless service directory and open up the `serverless.yaml` file. Navigate to the function of your choice
where you want to add an event source. Add a new entry `events` inside the function. It should be on the same level as
the `handler` entry.

After that add a `- schedule: rate(10 minutes)` entry inside the `events` definition.

Not the content of your `serverless.yaml` file might look like this:

```yaml
functions:
    greet:
        handler: handler.greet
        events:
            - schedule: rate(10 minutes)
```

That's it for the event addition. Next up we need to (re)deploy our service to enable our scheduled event.

## (Re)deploying the Serverless service

Run `serverless deploy` to (re)deploy the whole service.
Your function will be scheduled to run every 10 minutes once the deployment has finished.

## Conclusion

Event sources are a great way to extend the functionality of your functions.
They are pretty easy to setup. You simply need to add them to the corresponding function in your services `serverless.yaml`
file and (re)deploy the service.

Serverless has implementations for different provider independent and provider specific event sources you can use.

Curious what events are available? Here's a list with [all available events](/docs/guide/event-sources.md).
