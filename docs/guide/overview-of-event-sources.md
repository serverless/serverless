# Overview of event sources

Here's a list of all available event sources grouped by provider.

**Note:** This list will be updated constantly as we're adding more and more event sources in the future.
Just open up an [issue](https://github.com/serverless/serverless/issues) if you have any wishes regarding event support.

The examples will show you how you can use the different event definitions.

## Amazon Web Services (AWS)

### S3

#### Simple event definition

This will create a `photos` bucket which fires the `resize` function when an object is added or modified inside the bucket.

```yaml
functions:
    resize:
        handler: resize
        events:
            - s3: photos
```

#### Extended event definition

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

### Schedule

#### Simple event definition

This will attach a schedule event and causes the function `crawl` to be called every 2 hours.

```yaml
functions:
    crawl:
        handler: crawl
        events:
            - schedule: rate(2 hours)
```

#### Extended event definition

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

### HTTP endpoint

#### Simple event definition

This will create a new HTTP endpoint which is accessible at `users/show` via a `GET` request. `show` will be called
whenever the endpoint is accessed.

```yaml
functions:
    show:
        handler: users.show
        events:
            - http: GET users/show
```

#### Extended event definition

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

### SNS

#### Simple event definition

Here we create a new SNS topic with the name `dispatch` which is bound to the `dispatcher` function. The function will be
called every time a message is sent to the `dispatch` topic.

```yaml
functions:
    dispatcher:
        handler: dispatcher.dispatch
        events:
            - sns: dispatch
```

#### Extended event definition

This event definition ensures that the `aggregator` function get's called every time a message is sent to the
`aggregate` topic. `Data aggregation pipeline` will be shown in the AWS console so that the user can understand what the
SNS topic is used for.

```yaml
functions:
    aggregator:
        handler: aggregator.handler
        events:
            - sns:
                topic_name: aggregate
                display_name: Data aggregation pipeline
```
