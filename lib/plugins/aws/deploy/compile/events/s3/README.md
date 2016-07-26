# Compile S3 Events

This plugins compiles the function related S3 events in `serverless.yaml` to CloudFormation resources.

## How it works

`Compile S3 Events` hooks into the [`deploy:compileEvents`](/lib/plugins/deploy) lifecycle.

It loops over all functions which are defined in `serverless.yaml`.

Inside the function loop it loops over all the defined `S3` events in the `events` section.

You have two options to define the S3 bucket events:

The first one is to use a simple string as the bucket name. This will create a S3 bucket CloudFormation resource with
the bucket name you've defined and an additional lambda notification configuration resources for the current
function and the `s3:objectCreated:*` events.

The second possibility is to configure your S3 event more granular (like the bucket name or the event which this bucket
should listen to) with the help of key value pairs.

Take a look at the [Event syntax examples](#event-syntax-examples) below to see how you can setup S3 bucket events.

A corresponding lambda permission resource is created for each S3 event.

The created CloudFormation resources are merged into the `serverless.service.resources.Resources` section after looping
over all functions has finished.

## Event syntax examples

### Simple bucket setup

In this example we've defined a bucket with the name `profile-pictures` which will cause the function `user` to be run
whenever something is uploaded or updated in the bucket.

```yaml
# serverless.yaml
functions:
  user:
    handler: user.update
    events:
      - s3: profile-pictures
```

### Bucket setup with extended event options

Here we've used the extended event options which makes it possible to configure the S3 event in more detail.
Our bucket is called `confidential-information` and the `mail` function is run every time a user removes something from
the bucket.

```yaml
# serverless.yaml
functions:
  mail:
    handler: mail.removal
    events:
      - s3:
          bucket: confidential-information
          event: s3:ObjectRemoved:*
```
