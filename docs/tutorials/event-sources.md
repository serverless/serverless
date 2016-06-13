# Event sources

Serverless is built as an event driven architecture. Basically everything a function can trigger is an event.
Events could be HTTP requests, events fired from cloud storage, scheduled events, etc.

This tutorial will show you how you can add an event source to your Serverless service.

We'll assume that you have Serverless v1.0 or greater installed on your machine.

**Note:** This tutorial will implement a scheduled event for an AWS hosted Serverless service. You can re-use this tutorial
to add different event sources for other providers (although the event source implementation might be AWS specific).

## Scheduling a function

Let's pretend we want to re-run our function every 10 minutes. One solution would be to open up the provider dashboard and run
the function by hand but this is of course not the best way to solve our problem.

You might be familiar with so called "Cron jobs" if you're a UNIX user. Cron jobs are a way to define reoccurring
tasks the operating system will trigger automatically (e.g. some sort of scripts that automates something for you).

AWS has introduced a similar way we can automate the way our Lambda function get's called.

## Adding the schedule event source

Let's add a scheduled event source to a function in our Serverless service.

Go to the Serverless service directory and open up the `serverless.yaml` file. Navigate to the function of choice where you
want to add an event source. Add a new entry `events` one level deeper than the function name (of not yet present). It
should be on the same level as the `handler` entry.

Next up enter the schedule event configuration for AWS:

```
aws:
  schedule: rate(10 minutes)
```

Your overall function definition should look something like this:

```
functions:
  hello:
    handler: handler.hello
    events:
      aws:
        schedule: rate(10 minutes)
```

That's it for the event addition. Next up we need to (re)deploy our service to enable our scheduled event.

## (Re)deploying the Serverless service

Run `serverless deploy --stage <stage> --region <region>` to (re) deploy the whole service.
Your function will be scheduled once the deployment has finished.

## Conclusion

Event sources are a great way to extend the functionality of your functions.
They are pretty easy to setup. You simply need to define them in your services `serverless.yaml`
file and (re)deploy the service.

Serverless has implementations for different provider independent and provider specific event sources you can use.
