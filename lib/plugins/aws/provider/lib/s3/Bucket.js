'use strict';

module.exports = {
  type: 'object',
  properties: {
    accelerateConfiguration: require('./AccelerateConfiguration'),
    accessControl: {
      type: 'string',
    },
    analyticsConfigurations: {
      type: 'array',
      items: require('./AnalyticsConfiguration'),
    },
    bucketEncryption: require('./BucketEncryption'),
    bucketName: { $ref: '#/definitions/awsS3BucketName' },
    corsConfiguration: require('./CorsConfiguration'),
    inventoryConfigurations: {
      type: 'array',
      items: require('./InventoryConfiguration'),
    },
    lifecycleConfiguration: require('./LifecycleConfiguration'),
    loggingConfiguration: require('./LoggingConfiguration'),
    metricsConfigurations: {
      type: 'array',
      items: require('./MetricsConfiguration'),
    },
    name: { $ref: '#/definitions/awsS3BucketName' },
    notificationConfiguration: require('./NotificationConfiguration'),
    objectLockConfiguration: require('./ObjectLockConfiguration'),
    objectLockEnabled: {
      type: 'boolean',
    },
    publicAccessBlockConfiguration: require('./PublicAccessBlockConfiguration'),
    replicationConfiguration: require('./ReplicationConfiguration'),
    Tags: {
      type: 'array',
      items: require('./Tag'),
    },
    versioningConfiguration: require('./VersioningConfiguration'),
    websiteConfiguration: require('./WebsiteConfiguration'),
  },
  required: [],
  additionalProperties: false,
};
