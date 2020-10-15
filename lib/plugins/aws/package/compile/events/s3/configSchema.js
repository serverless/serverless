'use strict';

const abortIncompleteMultipartUpload = {
  type: 'object',
  properties: {
    DaysAfterInitiation: {
      type: 'integer',
    },
  },
  required: ['DaysAfterInitiation'],
  additionalProperties: false,
};

const accelerateConfiguration = {
  type: 'object',
  properties: {
    AccelerationStatus: {
      enum: ['Enabled', 'Suspended'],
    },
  },
  required: ['AccelerationStatus'],
  additionalProperties: false,
};

const accessControlTranslation = {
  type: 'object',
  properties: {
    Owner: {
      const: 'Destination',
    },
  },
  required: ['Owner'],
  additionalProperties: false,
};

const destination = {
  type: 'object',
  properties: {
    BucketAccountId: {
      type: 'string',
      pattern: '\\d{12}',
    },
    BucketArn: { $ref: '#/definitions/awsArn' },
    Format: {
      enum: ['CSV', 'ORC', 'Parquet'],
    },
    Prefix: {
      type: 'string',
    },
  },
  required: ['BucketArn', 'Format'],
  additionalProperties: false,
};

const dataExport = {
  type: 'object',
  properties: {
    Destination: {
      type: destination,
    },
    OutputSchemaVersion: {
      const: 'V_1',
    },
  },
  required: ['Destination', 'OutputSchemaVersion'],
  additionalProperties: false,
};

const storageClassAnalysis = {
  type: 'object',
  properties: {
    DataExport: dataExport,
  },
  required: [],
  additionalProperties: false,
};

const tagFilter = {
  type: 'object',
  properties: {
    Key: {
      type: 'string',
    },
    Value: {
      type: 'string',
    },
  },
  required: ['Key', 'Value'],
  additionalProperties: false,
};

const analyticsConfiguration = {
  type: 'object',
  properties: {
    Id: {
      type: 'string',
    },
    Prefix: {
      type: 'string',
    },
    StorageClassAnalysis: storageClassAnalysis,
    TagFilters: {
      type: 'array',
      items: tagFilter,
    },
  },
  required: ['Id', 'StorageClassAnalysis'],
  additionalProperties: false,
};

const serverSideEncryptionByDefault = {
  type: 'object',
  properties: {
    KMSMasterKeyID: {
      oneOf: [{ $ref: '#/definitions/awsArn' }, { type: 'string', pattern: '^[a-f0-9-]+$' }],
    },
    SSEAlgorithm: {
      enum: ['AES256', 'aws:kms'],
    },
  },
  required: ['SSEAlgorithm'],
  additionalProperties: false,
};

const serverSideEncryptionRule = {
  type: 'object',
  properties: {
    ServerSideEncryptionByDefault: serverSideEncryptionByDefault,
  },
  required: [],
  additionalProperties: false,
};

const bucketEncryption = {
  type: 'object',
  properties: {
    ServerSideEncryptionConfiguration: {
      type: 'array',
      items: serverSideEncryptionRule,
    },
  },
  required: ['ServerSideEncryptionConfiguration'],
  additionalProperties: false,
};

const corsRule = {
  type: 'object',
  properties: {
    AllowedHeaders: {
      type: 'array',
      items: { type: 'string' },
    },
    AllowedMethods: {
      type: 'array',
      items: { enum: ['GET', 'PUT', 'HEAD', 'POST', 'DELETE'] },
    },
    AllowedOrigins: {
      type: 'array',
      items: { type: 'string' },
    },
    ExposedHeaders: {
      type: 'array',
      items: { type: 'string' },
    },
    Id: {
      type: 'string',
      maxLength: 255,
    },
    MaxAge: {
      type: 'integer',
    },
  },
  required: ['AllowedMethods', 'AllowedOrigins'],
  additionalProperties: false,
};

const corsConfiguration = {
  type: 'object',
  properties: {
    CorsRules: {
      type: 'array',
      items: corsRule,
      maxItems: 100,
    },
  },
  required: ['CorsRules'],
  additionalProperties: false,
};

const defaultRetention = {
  type: 'object',
  properties: {
    Days: {
      type: 'integer',
    },
    Mode: {
      enum: ['COMPLIANCE', 'GOVERNANCE'],
    },
    Years: {
      type: 'integer',
    },
  },
  required: [],
  additionalProperties: false,
};

const deleteMarkerReplication = {
  type: 'object',
  properties: {
    Status: {
      enum: ['Disabled', 'Enabled'],
    },
  },
  required: [],
  additionalProperties: false,
};

const encryptionConfiguration = {
  type: 'object',
  properties: {
    ReplicaKmsKeyID: {
      type: 'string',
    },
  },
  required: ['ReplicaKmsKeyID'],
  additionalProperties: false,
};

const filterRule = {
  type: 'object',
  properties: {
    Name: {
      enum: ['prefix', 'suffix'],
    },
    Value: {
      type: 'string',
    },
  },
  required: ['Name', 'Value'],
  additionalProperties: false,
};

const inventoryConfiguration = {
  type: 'object',
  properties: {
    Destination: destination,
    Enabled: {
      type: 'boolean',
    },
    Id: {
      type: 'string',
    },
    IncludedObjectVersions: {
      enum: ['All', 'Current'],
    },
    OptionalFields: {
      type: 'array',
      items: { type: 'string' },
    },
    Prefix: {
      type: 'string',
    },
    ScheduleFrequency: {
      enum: ['Daily', 'Weekly'],
    },
  },
  required: ['Destination', 'Enabled', 'Id', 'IncludedObjectVersions', 'ScheduleFrequency'],
  additionalProperties: false,
};

const s3KeyFilter = {
  type: 'object',
  properties: {
    Rules: {
      type: 'array',
      items: filterRule,
    },
  },
  required: ['Rules'],
  additionalProperties: false,
};

const notificationFilter = {
  type: 'object',
  properties: {
    S3Key: s3KeyFilter,
  },
  required: ['S3Key'],
  additionalProperties: false,
};

const lambdaConfiguration = {
  type: 'object',
  properties: {
    Event: {
      type: 'string',
      pattern: '^s3:',
    },
    Filter: notificationFilter,
    Function: { $ref: '#/definitions/awsArn' },
  },
  required: ['Event', 'Function'],
  additionalProperties: false,
};

const transition = {
  type: 'object',
  properties: {
    StorageClass: {
      enum: ['DEEP_ARCHIVE', 'GLACIER', 'INTELLIGENT_TIERING', 'ONEZONE_IA', 'STANDARD_IA'],
    },
    TransitionDate: {
      type: 'date-time',
    },
    TransitionInDays: {
      type: 'integer',
      minimum: 1,
    },
  },
  required: ['StorageClass'],
  additionalProperties: false,
};

const noncurrentVersionTransition = {
  type: 'object',
  properties: {
    StorageClass: {
      enum: ['DEEP_ARCHIVE', 'GLACIER', 'INTELLIGENT_TIERING', 'ONEZONE_IA', 'STANDARD_IA'],
    },
    TransitionInDays: {
      type: 'integer',
    },
  },
  required: ['StorageClass', 'TransitionInDays'],
  additionalProperties: false,
};

const Rule = {
  type: 'object',
  properties: {
    AbortIncompleteMultipartUpload: abortIncompleteMultipartUpload,
    ExpirationDate: {
      type: 'date-time',
    },
    ExpirationInDays: {
      type: 'integer',
    },
    Id: {
      type: 'string',
      maxLength: 255,
    },
    NoncurrentVersionExpirationInDays: {
      type: 'integer',
    },
    NoncurrentVersionTransition: noncurrentVersionTransition,
    NoncurrentVersionTransitions: {
      type: 'array',
      items: noncurrentVersionTransition,
    },
    Prefix: {
      type: 'string',
    },
    Status: {
      enum: ['Disabled', 'Enabled'],
    },
    TagFilters: {
      type: 'array',
      items: tagFilter,
    },
    transition,
    Transitions: {
      type: 'array',
      items: transition,
    },
  },
  required: ['Status'],
  additionalProperties: false,
};

const lifecycleConfiguration = {
  type: 'object',
  properties: {
    Rules: {
      type: 'array',
      items: Rule,
    },
  },
  required: ['Rules'],
  additionalProperties: false,
};

const loggingConfiguration = {
  type: 'object',
  properties: {
    DestinationBucketName: {
      oneOf: [{ $ref: '#/definitions/awsS3BucketName' }, { $ref: '#/definitions/awsCfFunction' }],
    },
    LogFilePrefix: {
      type: 'string',
    },
  },
  required: [],
  additionalProperties: false,
};

const replicationTimeValue = {
  type: 'object',
  properties: {
    Minutes: {
      type: 'integer',
    },
  },
  required: ['Minutes'],
  additionalProperties: false,
};

const metrics = {
  type: 'object',
  properties: {
    EventThreshold: replicationTimeValue,
    Status: {
      enum: ['Disabled', 'Enabled'],
    },
  },
  required: ['EventThreshold', 'Status'],
  additionalProperties: false,
};

const metricsConfiguration = {
  type: 'object',
  properties: {
    Id: {
      type: 'string',
    },
    Prefix: {
      type: 'string',
    },
    TagFilters: {
      type: 'array',
      items: tagFilter,
    },
  },
  required: ['Id'],
  additionalProperties: false,
};

const queueConfiguration = {
  type: 'object',
  properties: {
    Event: {
      type: 'string',
      pattern: '^s3:',
    },
    Filter: notificationFilter,
    Queue: { $ref: '#/definitions/awsArn' },
  },
  required: ['Event', 'Queue'],
  additionalProperties: false,
};

const topicConfiguration = {
  type: 'object',
  properties: {
    Event: {
      type: 'string',
      pattern: '^s3:',
    },
    Filter: notificationFilter,
    Topic: { $ref: '#/definitions/awsArn' },
  },
  required: ['Event', 'Topic'],
  additionalProperties: false,
};

const notificationConfiguration = {
  type: 'object',
  properties: {
    LambdaConfigurations: {
      type: 'array',
      items: lambdaConfiguration,
    },
    QueueConfigurations: {
      type: 'array',
      items: queueConfiguration,
    },
    TopicConfigurations: {
      type: 'array',
      items: topicConfiguration,
    },
  },
  additionalProperties: false,
};

const objectLockRule = {
  type: 'object',
  properties: {
    DefaultRetention: defaultRetention,
  },
  required: [],
  additionalProperties: false,
};

const objectLockConfiguration = {
  type: 'object',
  properties: {
    ObjectLockEnabled: {
      const: 'Enabled',
    },
    Rule: objectLockRule,
  },
  required: [],
  additionalProperties: false,
};

const publicAccessBlockConfiguration = {
  type: 'object',
  properties: {
    BlockPublicAcls: {
      type: 'boolean',
    },
    BlockPublicPolicy: {
      type: 'boolean',
    },
    IgnorePublicAcls: {
      type: 'boolean',
    },
    RestrictPublicBuckets: {
      type: 'boolean',
    },
  },
  required: [],
  additionalProperties: false,
};

const redirectAllRequestsTo = {
  type: 'object',
  properties: {
    HostName: {
      type: 'string',
    },
    Protocol: {
      enum: ['http', 'https'],
    },
  },
  required: ['HostName'],
  additionalProperties: false,
};

const redirectRule = {
  type: 'object',
  properties: {
    HostName: {
      type: 'string',
    },
    HttpRedirectCode: {
      type: 'string',
    },
    Protocol: {
      enum: ['http', 'https'],
    },
    ReplaceKeyPrefixWith: {
      type: 'string',
    },
    ReplaceKeyWith: {
      type: 'string',
    },
  },
  additionalProperties: false,
};

const sseKmsEncryptedObjects = {
  type: 'object',
  properties: {
    Status: {
      enum: ['Disabled', 'Enabled'],
    },
  },
  required: ['Status'],
  additionalProperties: false,
};

const sourceSelectionCriteria = {
  type: 'object',
  properties: {
    SseKmsEncryptedObjects: sseKmsEncryptedObjects,
  },
  required: ['SseKmsEncryptedObjects'],
  additionalProperties: false,
};

const replicationTime = {
  type: 'object',
  properties: {
    Status: {
      enum: ['Disabled', 'Enabled'],
    },
    Time: replicationTimeValue,
  },
  required: ['Status', 'Time'],
  additionalProperties: false,
};

const replicationDestination = {
  type: 'object',
  properties: {
    AccessControlTranslation: accessControlTranslation,
    Account: {
      type: 'string',
      pattern: '^\\d{12}$',
    },
    Bucket: { $ref: '#/definitions/awsArn' },
    EncryptionConfiguration: encryptionConfiguration,
    Metrics: metrics,
    ReplicationTime: replicationTime,
    StorageClass: {
      enum: [
        'DEEP_ARCHIVE',
        'GLACIER',
        'INTELLIGENT_TIERING',
        'ONEZONE_IA',
        'OUTPOSTS',
        'REDUCED_REDUNDANCY',
        'STANDARD',
        'STANDARD_IA',
      ],
    },
  },
  required: ['Bucket'],
  additionalProperties: false,
  dependencies: {
    AccessControlTranslation: ['Account'],
  },
};

const replicationRuleAndOperator = {
  type: 'object',
  properties: {
    Prefix: {
      type: 'string',
    },
    TagFilters: {
      type: 'array',
      items: tagFilter,
    },
  },
  additionalProperties: false,
};

const replicationRuleFilter = {
  type: 'object',
  properties: {
    And: replicationRuleAndOperator,
    Prefix: {
      type: 'string',
    },
    TagFilter: tagFilter,
  },
  required: [],
  additionalProperties: false,
};

const replicationRule = {
  type: 'object',
  properties: {
    DeleteMarkerReplication: deleteMarkerReplication,
    Destination: replicationDestination,
    Filter: replicationRuleFilter,
    Id: {
      type: 'string',
      maxLength: 255,
    },
    Prefix: {
      type: 'string',
    },
    Priority: {
      type: 'integer',
    },
    SourceSelectionCriteria: sourceSelectionCriteria,
    Status: {
      enum: ['Disabled', 'Enabled'],
    },
  },
  required: ['Destination', 'Status'],
  additionalProperties: false,
};

const replicationConfiguration = {
  type: 'object',
  properties: {
    Role: { $ref: '#/definitions/awsArn' },
    Rules: {
      type: 'array',
      items: replicationRule,
      minItems: 1,
      maxItems: 1000,
    },
  },
  required: ['Role', 'Rules'],
  additionalProperties: false,
};

const routingRuleCondition = {
  type: 'object',
  properties: {
    HttpErrorCodeReturnedEquals: {
      type: 'string',
    },
    KeyPrefixEquals: {
      type: 'string',
    },
  },
  additionalProperties: false,
};

const routingRule = {
  type: 'object',
  properties: {
    RedirectRule: redirectRule,
    RoutingRuleCondition: routingRuleCondition,
  },
  required: ['RedirectRule'],
  additionalProperties: false,
};

const tag = {
  type: 'object',
  properties: {
    Key: {
      type: 'string',
    },
    Value: {
      type: 'string',
    },
  },
  required: ['Key', 'Value'],
  additionalProperties: false,
};

const versioningConfiguration = {
  type: 'object',
  properties: {
    Status: {
      enum: ['Enabled', 'Suspended'],
    },
  },
  required: ['Status'],
  additionalProperties: false,
};

const websiteConfiguration = {
  type: 'object',
  properties: {
    ErrorDocument: {
      type: 'string',
    },
    IndexDocument: {
      type: 'string',
    },
    RedirectAllRequestsTo: redirectAllRequestsTo,
    RoutingRules: {
      type: 'array',
      items: routingRule,
    },
  },
  additionalProperties: false,
};

module.exports = {
  type: 'object',
  properties: {
    accelerateConfiguration,
    accessControl: {
      type: 'string',
    },
    analyticsConfigurations: {
      type: 'array',
      items: analyticsConfiguration,
    },
    bucketEncryption,
    bucketName: { $ref: '#/definitions/awsS3BucketName' },
    corsConfiguration,
    inventoryConfigurations: {
      type: 'array',
      items: inventoryConfiguration,
    },
    lifecycleConfiguration,
    loggingConfiguration,
    metricsConfigurations: {
      type: 'array',
      items: metricsConfiguration,
    },
    name: { $ref: '#/definitions/awsS3BucketName' },
    notificationConfiguration,
    objectLockConfiguration,
    objectLockEnabled: {
      type: 'boolean',
    },
    publicAccessBlockConfiguration,
    replicationConfiguration,
    tags: {
      type: 'array',
      items: tag,
    },
    versioningConfiguration,
    websiteConfiguration,
  },
  additionalProperties: false,
};
