// Registry entry for the `s3` AWS service.

const s3BucketEntry = {
  cfnType: 'AWS::S3::Bucket',
  awsService: 's3',
  category: 'storage',
  engineClient: 's3',
  // PhysicalResourceId is the bucket name as-is.
  identifier: (stackResource) => stackResource.PhysicalResourceId,
  calls: [
    { key: 'location', method: 'GetBucketLocation', input: 'Bucket' },
    {
      key: 'policy',
      method: 'GetBucketPolicy',
      input: 'Bucket',
      optional: true,
    },
    { key: 'versioning', method: 'GetBucketVersioning', input: 'Bucket' },
    {
      key: 'encryption',
      method: 'GetBucketEncryption',
      input: 'Bucket',
      optional: true,
    },
    { key: 'acl', method: 'GetBucketAcl', input: 'Bucket' },
    {
      key: 'publicAccessBlock',
      method: 'GetPublicAccessBlock',
      input: 'Bucket',
      optional: true,
    },
    {
      key: 'cors',
      method: 'GetBucketCors',
      input: 'Bucket',
      optional: true,
    },
    {
      key: 'lifecycleConfiguration',
      method: 'GetBucketLifecycleConfiguration',
      input: 'Bucket',
      optional: true,
    },
    {
      key: 'tagging',
      method: 'GetBucketTagging',
      input: 'Bucket',
      optional: true,
    },
    {
      key: 'notificationConfiguration',
      method: 'GetBucketNotificationConfiguration',
      input: 'Bucket',
    },
  ],
}

export const s3RegistryEntries = [s3BucketEntry]
