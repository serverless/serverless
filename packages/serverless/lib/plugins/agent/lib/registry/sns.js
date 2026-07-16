// Registry entry for the `sns` AWS service.

const snsTopicEntry = {
  cfnType: 'AWS::SNS::Topic',
  awsService: 'sns',
  category: 'events',
  engineClient: 'sns',
  // PhysicalResourceId is the topic ARN as-is (CloudFormation's `Ref` for an
  // SNS::Topic returns the ARN).
  identifier: (stackResource) => stackResource.PhysicalResourceId,
  calls: [
    { key: 'attributes', method: 'GetTopicAttributes', input: 'TopicArn' },
    {
      key: 'subscriptions',
      method: 'ListSubscriptionsByTopic',
      input: 'TopicArn',
      paginate: true,
    },
    {
      key: 'tags',
      method: 'ListTagsForResource',
      // ListTagsForResource's tagging input key is ResourceArn, not TopicArn
      // -- the ARN identifier is the same value, just a differently-named
      // param for this call.
      params: (identifier) => ({ ResourceArn: identifier }),
      optional: true,
    },
  ],
}

export const snsRegistryEntries = [snsTopicEntry]
