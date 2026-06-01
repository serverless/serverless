# S3 to SQS to SNS chain example for `serverless offline`

A small event-driven pipeline runnable entirely locally with `serverless
offline`. Dropping an object into the `uploads` bucket fans through three AWS
services:

1. an `s3:ObjectCreated:*` event on the `incoming/` prefix fires `onUpload`;
2. `onUpload` enqueues the object key on the `WorkQueue` SQS queue;
3. the `worker` function consumes the queue and publishes a completion message
   to the `DoneTopic` SNS topic.

Unlike an in-memory demo, `onUpload` and `worker` are genuinely separate
functions: they communicate only through the real local SQS queue, which is why
two functions (not one) is the right shape here.

The bucket, queue, and topic are declared under `resources:` and provisioned at
boot, so no manual setup is needed. The `!Ref`/`!GetAtt` intrinsics in
`environment:` resolve to local values: `!Ref WorkQueue` becomes the queue's
local URL (`WORK_QUEUE_URL`) and `!Ref DoneTopic` becomes the topic's local ARN
(`DONE_TOPIC_ARN`). The SDK clients in `handler.js` need no endpoint — offline
injects `AWS_ENDPOINT_URL` so they talk to the local AWS API server.

## Requirements

The handlers use the AWS SDK for JavaScript v3, so install the clients they
import in this project first:

```bash
npm install @aws-sdk/client-sqs @aws-sdk/client-sns
```

(On AWS, the Lambda Node.js runtime bundles the SDK; locally you install it.)

## Run

```bash
serverless offline
```

The boot summary lists the provisioned resources, including the `uploads`
bucket, the `WorkQueue` (`work-queue`) queue, and the `DoneTopic` (`done-topic`)
topic.

## Try it

Trigger the chain by dropping a file into the bucket's drop folder. Offline
auto-derives the folder from the bucket name at
`.serverless-offline/buckets/uploads/`, so an object under the `incoming/`
prefix maps to `.serverless-offline/buckets/uploads/incoming/`:

```bash
echo hello > .serverless-offline/buckets/uploads/incoming/a.txt
```

Equivalently, write the object through the S3 API with the AWS CLI (the AWS API
server defaults to port `3002`):

```bash
aws s3api put-object \
  --endpoint-url=http://localhost:3002 \
  --bucket uploads \
  --key incoming/a.txt \
  --body a.txt
```

## What you should see

The two functions log as the event flows through the chain:

```
onUpload: enqueued incoming/a.txt
worker: published done for incoming/a.txt
```

The first line confirms the S3 event reached `onUpload` and it sent to SQS; the
second confirms `worker` polled that message off the queue and published to SNS.
