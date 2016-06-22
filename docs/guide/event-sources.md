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
            - schedule
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

***Will be implemented soon!***

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
