// S3 -> SQS -> SNS chain. onUpload reacts to an S3 object-created event and
// enqueues work; worker consumes the queue and publishes a completion to SNS.
// The SDK clients need no endpoint — offline injects AWS_ENDPOINT_URL.
import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs'
import { SNSClient, PublishCommand } from '@aws-sdk/client-sns'

const sqs = new SQSClient({})
const sns = new SNSClient({})

export const onUpload = async (event) => {
  for (const record of event.Records || []) {
    const key = record.s3?.object?.key
    await sqs.send(
      new SendMessageCommand({
        QueueUrl: process.env.WORK_QUEUE_URL,
        MessageBody: JSON.stringify({ key }),
      }),
    )
    console.log(`onUpload: enqueued ${key}`)
  }
  return { ok: true }
}

export const worker = async (event) => {
  for (const record of event.Records || []) {
    const { key } = JSON.parse(record.body)
    await sns.send(
      new PublishCommand({
        TopicArn: process.env.DONE_TOPIC_ARN,
        Message: JSON.stringify({ processed: key }),
      }),
    )
    console.log(`worker: published done for ${key}`)
  }
  return { batchItemFailures: [] }
}
