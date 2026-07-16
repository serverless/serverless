// Registry entry for the `kinesis` AWS service.

const kinesisStreamConsumerEntry = {
  cfnType: 'AWS::Kinesis::StreamConsumer',
  awsService: 'kinesis',
  category: 'events',
  engineClient: 'kinesis',
  // PhysicalResourceId is the consumer ARN as-is.
  identifier: (stackResource) => stackResource.PhysicalResourceId,
  calls: [
    {
      key: 'consumer',
      method: 'DescribeStreamConsumer',
      input: 'ConsumerARN',
    },
  ],
}

export const kinesisRegistryEntries = [kinesisStreamConsumerEntry]
