'use strict';

module.exports = {
  type: 'object',
  properties: {
    AccelerateConfiguration: require('./AWS::S3::Bucket.AccelerateConfiguration'),
    AccessControl: {
      enum: ['Private, PublicRead', 'PublicReadWrite', 'AuthenticatedRead', 'LogDeliveryWrite', 'BucketOwnerRead', 'BucketOwnerFullControl', 'AwsExecRead'],
    },
    AnalyticsConfigurations: {
      type: 'array',
      items: require('./AWS::S3::Bucket.AnalyticsConfiguration'),
    },
    BucketEncryption: require('./AWS::S3::Bucket.BucketEncryption'),
    BucketName: { $ref: '#/definitions/awsS3BucketName' },
    CorsConfiguration: require('./AWS::S3::Bucket.CorsConfiguration'),
    InventoryConfigurations: {
      type: 'array',
      items: require('./AWS::S3::Bucket.InventoryConfiguration'),
    },
    LifecycleConfiguration: require('./AWS::S3::Bucket.LifecycleConfiguration'),
    LoggingConfiguration: require('./AWS::S3::Bucket.LoggingConfiguration'),
    MetricsConfigurations: {
      type: 'array',
      items: require('./AWS::S3::Bucket.MetricsConfiguration'),
    },
    name: { $ref: '#/definitions/awsS3BucketName' },
    NotificationConfiguration: require('./AWS::S3::Bucket.NotificationConfiguration'),
    ObjectLockConfiguration: require('./AWS::S3::Bucket.ObjectLockConfiguration'),
    ObjectLockEnabled: {
      type: 'boolean',
    },
    PublicAccessBlockConfiguration: require('./AWS::S3::Bucket.PublicAccessBlockConfiguration'),
    ReplicationConfiguration: require('./AWS::S3::Bucket.ReplicationConfiguration'),
    Tags: {
      type: 'array',
      items: require('./Tag'),
    },
    VersioningConfiguration: {
      type: require('./AWS::S3::Bucket.VersioningConfiguration'),
    },
    WebsiteConfiguration: {
      type: require('AWS::S3::Bucket.WebsiteConfiguration'),
    },
  },
  required: [],
  additionalProperties: false,
};
