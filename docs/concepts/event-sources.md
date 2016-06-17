# Event sources

With Serverless you write event driven architectures. An event can be e.g. a HTTP request, a scheduled event or even
an event when someone uploads a file to your S3 bucket.

The `serverless.yaml` file makes it easy to add events to your functions.

Events are provider specific. Your functions can have as many events as you want it to support (even from different providers).
Serverless will take care and translates the events into provider specific resources when you deploy your service to the
provider of choice.

## How to use event sources

Events are defined inside the function of the `serverless.yaml` file.
Here's an example of a `users` function which implements an `S3` bucket event for AWS and a http endpoint for Azure:

```yaml
functions:
  users:
    handler: users.handler
    events:
      aws:
        s3:
          - photos
      azure:
        http_endpoints:
          direction: in
          name: req
```

Let's pretend we deploy this function to AWS.
Serverless will create or link the `photos` S3 bucket with the `users`function so the function get's triggered each time
a new file is uploaded or modified in the S3 bucket.

However Serverless will create a HTTP endpoint which will trigger the function every time a request comes in if we deploy
this function to Azure.

## Available event sources

Serverless supports the following event sources:

### AWS

Event sources for Amazon Web Services:

#### S3

Triggers the function every time an object is put or modified in a S3 bucket.

Examples:

```yaml
functions:
  resize:
    handler: resize
    events:
      aws:
        s3:
          - photos
```

```yaml
functions:
  users:
    handler: users.handler
    events:
      aws:
        s3:
          - photos
          - personal-files
```

#### Schedule

Schedules the function execution.

Examples:

```yaml
functions:
  crawl:
    handler: crawl
    events:
      aws:
        schedule: rate(2 hours)
```

```yaml
functions:
  aggregate:
    handler: statistics.handler
    events:
      aws:
        schedule: rate(10 minutes)
```

#### HTTP endpoint

Adds HTTP endpoints to the function.

Examples:

```yaml
functions:
  create:
    handler: posts.create
    events:
      aws:
        http_endpoints:
          post: posts/create
```

```yaml
functions:
  index:
    handler: users.index
    events:
      aws:
        http_endpoints:
          get: users
```
