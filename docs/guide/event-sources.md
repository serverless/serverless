# Event sources

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

---

# Event sources

With Serverless you write event driven architectures. An event can be e.g. a HTTP request, a schedule event or even
an event when someone uploads a file to a cloud storage.

The `serverless.yaml` file makes it easy to add events to your functions.

Events are provider specific. Your functions can have as many events as you want it to support.
Serverless will take care and translates the events into provider specific resources when you deploy your service.

## How to use event sources

Events are defined inside the function of the `serverless.yaml` file.
Here's an example of a `users` function which implements three different events (an S3 event, a http event and a
schedule event):

```yaml
functions:
    users:
        handler: users.handler
        events:
            - s3: photos
            - http:
                path: users/create
                method: post
            - schedule:
                rate: rate(10 minutes)
                enabled: false
```

Let's pretend that our provider is AWS and we deploy the service this function belongs to.

Serverless will create or link the `photos` S3 bucket with the `users` function so the function get's triggered each time
a new file is uploaded or modified in the S3 bucket.

Additionally a new API Gateway endpoint is created we can access via `POST` at the `users/create` endpoint.

A disabled schedule event is also created which will trigger the function every 10 minutes if we enable it.

---

## Available event sources

Here's a list of all currently supported event sources.

### AWS

Event sources for Amazon Web Services.

#### S3

##### Simple event definition

This will create a `photos` bucket which fires the `resize` when an object is added or modified inside the bucket.

```yaml
functions:
    resize:
        handler: resize
        events:
            - s3: photos
```

##### Extended event definition

This will create a bucket `photos`. The `users` function is called whenever an object is removed from the bucket.

```yaml
functions:
    users:
        handler: users.handler
        events:
            - s3:
                bucket: photos
                event: s3:ObjectRemoved:*
```

#### Schedule

##### Simple event definition

This will attach a schedule event and causes the function `crawl` to be called every 2 hours.

```yaml
functions:
    crawl:
        handler: crawl
        events:
            - schedule: rate(2 hours)
```

##### Extended event definition

This will create and attach a schedule event for the `aggregate` function which is disabled. If enabled it will call
the `aggregate` function every 10 minutes.

```yaml
functions:
    aggregate:
        handler: statistics.handler
        events:
            - schedule:
                rate: rate(10 minutes)
                enabled: false
```

#### HTTP endpoint

##### Simple event definition

*Work in progress!*

##### Extended event definition

This will create a new HTTP endpoint which is accessible at `posts/create` with the help of the HTTP `POST` method.
The function `create` is called every time someone visits this endpoint.

```yaml
functions:
    create:
        handler: posts.create
        events:
            - http:
                path: posts/create
                method: POST
```
