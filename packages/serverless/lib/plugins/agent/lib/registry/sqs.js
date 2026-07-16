// Registry entry for the `sqs` AWS service (a popular USER resource type,
// not framework-generated, but deliberately included in v1).

const sqsQueueEntry = {
  cfnType: 'AWS::SQS::Queue',
  awsService: 'sqs',
  category: 'events',
  engineClient: 'sqs',
  // PhysicalResourceId IS the queue URL (CloudFormation's `Ref` for an
  // SQS::Queue returns the URL, not a name) -- pass through as-is.
  identifier: (stackResource) => stackResource.PhysicalResourceId,
  calls: [
    {
      key: 'attributes',
      method: 'GetQueueAttributes',
      params: (identifier) => ({
        QueueUrl: identifier,
        AttributeNames: ['All'],
      }),
    },
  ],
}

export const sqsRegistryEntries = [sqsQueueEntry]
