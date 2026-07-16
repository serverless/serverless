// Registry entry for the `dynamodb` AWS service (a popular USER resource
// type, not framework-generated, but deliberately included in v1).

const dynamodbTableEntry = {
  cfnType: 'AWS::DynamoDB::Table',
  awsService: 'dynamodb',
  category: 'storage',
  engineClient: 'dynamodb',
  // PhysicalResourceId is the table name as-is.
  identifier: (stackResource) => stackResource.PhysicalResourceId,
  calls: [
    { key: 'table', method: 'DescribeTable', input: 'TableName' },
    { key: 'timeToLive', method: 'DescribeTimeToLive', input: 'TableName' },
    {
      key: 'continuousBackups',
      method: 'DescribeContinuousBackups',
      input: 'TableName',
    },
  ],
}

export const dynamodbRegistryEntries = [dynamodbTableEntry]
