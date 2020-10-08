'use strict';

module.exports = {
  type: 'object',
  properties: {
    AccelerateConfiguration: require('./AccelerateConfiguration'),
    AccessControl: {
      type: 'string',
    },
    AnalyticsConfigurations: {
      type: 'array',
      items: require('./AnalyticsConfiguration'),
    },
    BucketEncryption: require('./BucketEncryption'),
    BucketName: { $ref: '#/definitions/awsS3BucketName' },
    CorsConfiguration: require('./CorsConfiguration'),
    InventoryConfigurations: {
      type: 'array',
      items: require('./InventoryConfiguration'),
    },
    LifecycleConfiguration: require('./LifecycleConfiguration'),
    LoggingConfiguration: require('./LoggingConfiguration'),
    MetricsConfigurations: {
      type: 'array',
      items: require('./MetricsConfiguration'),
    },
    NotificationConfiguration: require('./NotificationConfiguration'),
    ObjectLockConfiguration: require('./ObjectLockConfiguration'),
    ObjectLockEnabled: {
      type: 'boolean',
    },
    PublicAccessBlockConfiguration: require('./PublicAccessBlockConfiguration'),
    ReplicationConfiguration: require('./ReplicationConfiguration'),
    Tags: {
      type: 'array',
      items: require('./Tag'),
    },
    VersioningConfiguration: require('./VersioningConfiguration'),
    WebsiteConfiguration: require('./WebsiteConfiguration'),
  },
  required: [],
  additionalProperties: false,
};
