'use strict';

const AbortIncompleteMultipartUpload = {
  type: 'object',
  properties: {
    DaysAfterInitiation: {
      type: 'integer',
    },
  },
  required: ['DaysAfterInitiation'],
  additionalProperties: false,
};

const AccelerateConfiguration = {
  type: 'object',
  properties: {
    AccelerationStatus: {
      enum: ['Enabled', 'Suspended'],
    },
  },
  required: ['AccelerationStatus'],
  additionalProperties: false,
};

const AccessControlTranslation = {
  type: 'object',
  properties: {
    Owner: {
      const: 'Destination',
    },
  },
  required: ['Owner'],
  additionalProperties: false,
};

const Destination = {
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

const DataExport = {
  type: 'object',
  properties: {
    Destination: {
      type: Destination,
    },
    OutputSchemaVersion: {
      const: 'V_1',
    },
  },
  required: ['Destination', 'OutputSchemaVersion'],
  additionalProperties: false,
};

const StorageClassAnalysis = {
  type: 'object',
  properties: {
    DataExport,
  },
  required: [],
  additionalProperties: false,
};

const TagFilter = {
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

const AnalyticsConfiguration = {
  type: 'object',
  properties: {
    Id: {
      type: 'string',
    },
    Prefix: {
      type: 'string',
    },
    StorageClassAnalysis,
    TagFilters: {
      type: 'array',
      items: TagFilter,
    },
  },
  required: ['Id', 'StorageClassAnalysis'],
  additionalProperties: false,
};

const ServerSideEncryptionByDefault = {
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

const ServerSideEncryptionRule = {
  type: 'object',
  properties: {
    ServerSideEncryptionByDefault,
  },
  required: [],
  additionalProperties: false,
};

const BucketEncryption = {
  type: 'object',
  properties: {
    ServerSideEncryptionConfiguration: {
      type: 'array',
      items: ServerSideEncryptionRule,
    },
  },
  required: ['ServerSideEncryptionConfiguration'],
  additionalProperties: false,
};

const CorsRule = {
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

const CorsConfiguration = {
  type: 'object',
  properties: {
    CorsRules: {
      type: 'array',
      items: CorsRule,
      maxItems: 100,
    },
  },
  required: ['CorsRules'],
  additionalProperties: false,
};

const DefaultRetention = {
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

const DeleteMarkerReplication = {
  type: 'object',
  properties: {
    Status: {
      enum: ['Disabled', 'Enabled'],
    },
  },
  required: [],
  additionalProperties: false,
};

const EncryptionConfiguration = {
  type: 'object',
  properties: {
    ReplicaKmsKeyID: {
      type: 'string',
    },
  },
  required: ['ReplicaKmsKeyID'],
  additionalProperties: false,
};

const FilterRule = {
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

const InventoryConfiguration = {
  type: 'object',
  properties: {
    Destination,
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

const S3KeyFilter = {
  type: 'object',
  properties: {
    Rules: {
      type: 'array',
      items: FilterRule,
    },
  },
  required: ['Rules'],
  additionalProperties: false,
};

const NotificationFilter = {
  type: 'object',
  properties: {
    S3Key: S3KeyFilter,
  },
  required: ['S3Key'],
  additionalProperties: false,
};

const LambdaConfiguration = {
  type: 'object',
  properties: {
    Event: {
      type: 'string',
      pattern: '^s3:',
    },
    Filter: NotificationFilter,
    Function: { $ref: '#/definitions/awsArn' },
  },
  required: ['Event', 'Function'],
  additionalProperties: false,
};

const Transition = {
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

const NoncurrentVersionTransition = {
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
    AbortIncompleteMultipartUpload,
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
    NoncurrentVersionTransition,
    NoncurrentVersionTransitions: {
      type: 'array',
      items: NoncurrentVersionTransition,
    },
    Prefix: {
      type: 'string',
    },
    Status: {
      enum: ['Disabled', 'Enabled'],
    },
    TagFilters: {
      type: 'array',
      items: TagFilter,
    },
    Transition,
    Transitions: {
      type: 'array',
      items: Transition,
    },
  },
  required: ['Status'],
  additionalProperties: false,
};

const LifecycleConfiguration = {
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

const LoggingConfiguration = {
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

const ReplicationTimeValue = {
  type: 'object',
  properties: {
    Minutes: {
      type: 'integer',
    },
  },
  required: ['Minutes'],
  additionalProperties: false,
};

const Metrics = {
  type: 'object',
  properties: {
    EventThreshold: ReplicationTimeValue,
    Status: {
      enum: ['Disabled', 'Enabled'],
    },
  },
  required: ['EventThreshold', 'Status'],
  additionalProperties: false,
};

const MetricsConfiguration = {
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
      items: TagFilter,
    },
  },
  required: ['Id'],
  additionalProperties: false,
};

const QueueConfiguration = {
  type: 'object',
  properties: {
    Event: {
      type: 'string',
      pattern: '^s3:',
    },
    Filter: NotificationFilter,
    Queue: { $ref: '#/definitions/awsArn' },
  },
  required: ['Event', 'Queue'],
  additionalProperties: false,
};

const TopicConfiguration = {
  type: 'object',
  properties: {
    Event: {
      type: 'string',
      pattern: '^s3:',
    },
    Filter: NotificationFilter,
    Topic: { $ref: '#/definitions/awsArn' },
  },
  required: ['Event', 'Topic'],
  additionalProperties: false,
};

const NotificationConfiguration = {
  type: 'object',
  properties: {
    LambdaConfigurations: {
      type: 'array',
      items: LambdaConfiguration,
    },
    QueueConfigurations: {
      type: 'array',
      items: QueueConfiguration,
    },
    TopicConfigurations: {
      type: 'array',
      items: TopicConfiguration,
    },
  },
  required: [],
  additionalProperties: false,
};

const ObjectLockRule = {
  type: 'object',
  properties: {
    DefaultRetention,
  },
  required: [],
  additionalProperties: false,
};

const ObjectLockConfiguration = {
  type: 'object',
  properties: {
    ObjectLockEnabled: {
      const: 'Enabled',
    },
    Rule: ObjectLockRule,
  },
  required: [],
  additionalProperties: false,
};

const PublicAccessBlockConfiguration = {
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

const RedirectAllRequestsTo = {
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

const RedirectRule = {
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
  required: [],
  additionalProperties: false,
};

const SseKmsEncryptedObjects = {
  type: 'object',
  properties: {
    Status: {
      enum: ['Disabled', 'Enabled'],
    },
  },
  required: ['Status'],
  additionalProperties: false,
};

const SourceSelectionCriteria = {
  type: 'object',
  properties: {
    SseKmsEncryptedObjects,
  },
  required: ['SseKmsEncryptedObjects'],
  additionalProperties: false,
};

const ReplicationTime = {
  type: 'object',
  properties: {
    Status: {
      enum: ['Disabled', 'Enabled'],
    },
    Time: ReplicationTimeValue,
  },
  required: ['Status', 'Time'],
  additionalProperties: false,
};

const ReplicationDestination = {
  type: 'object',
  properties: {
    AccessControlTranslation,
    Account: {
      type: 'string',
      pattern: '^\\d{12}$',
    },
    Bucket: { $ref: '#/definitions/awsArn' },
    EncryptionConfiguration,
    Metrics,
    ReplicationTime,
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

const ReplicationRuleAndOperator = {
  type: 'object',
  properties: {
    Prefix: {
      type: 'string',
    },
    TagFilters: {
      type: 'array',
      items: TagFilter,
    },
  },
  required: [],
  additionalProperties: false,
};

const ReplicationRuleFilter = {
  type: 'object',
  properties: {
    And: ReplicationRuleAndOperator,
    Prefix: {
      type: 'string',
    },
    TagFilter,
  },
  required: [],
  additionalProperties: false,
};

const ReplicationRule = {
  type: 'object',
  properties: {
    DeleteMarkerReplication,
    Destination: ReplicationDestination,
    Filter: ReplicationRuleFilter,
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
    SourceSelectionCriteria,
    Status: {
      enum: ['Disabled', 'Enabled'],
    },
  },
  required: ['Destination', 'Status'],
  additionalProperties: false,
};

const ReplicationConfiguration = {
  type: 'object',
  properties: {
    Role: { $ref: '#/definitions/awsArn' },
    Rules: {
      type: 'array',
      items: ReplicationRule,
      minItems: 1,
      maxItems: 1000,
    },
  },
  required: ['Role', 'Rules'],
  additionalProperties: false,
};

const RoutingRuleCondition = {
  type: 'object',
  properties: {
    HttpErrorCodeReturnedEquals: {
      type: 'string',
    },
    KeyPrefixEquals: {
      type: 'string',
    },
  },
  required: [],
  additionalProperties: false,
};

const RoutingRule = {
  type: 'object',
  properties: {
    RedirectRule,
    RoutingRuleCondition,
  },
  required: ['RedirectRule'],
  additionalProperties: false,
};

const Tag = {
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

const VersioningConfiguration = {
  type: 'object',
  properties: {
    Status: {
      enum: ['Enabled', 'Suspended'],
    },
  },
  required: ['Status'],
  additionalProperties: false,
};

const WebsiteConfiguration = {
  type: 'object',
  properties: {
    ErrorDocument: {
      type: 'string',
    },
    IndexDocument: {
      type: 'string',
    },
    RedirectAllRequestsTo,
    RoutingRules: {
      type: 'array',
      items: RoutingRule,
    },
  },
  required: [],
  additionalProperties: false,
};

module.exports = {
  type: 'object',
  properties: {
    accelerateConfiguration: AccelerateConfiguration,
    accessControl: {
      type: 'string',
    },
    analyticsConfigurations: {
      type: 'array',
      items: AnalyticsConfiguration,
    },
    bucketEncryption: BucketEncryption,
    bucketName: { $ref: '#/definitions/awsS3BucketName' },
    corsConfiguration: CorsConfiguration,
    inventoryConfigurations: {
      type: 'array',
      items: InventoryConfiguration,
    },
    lifecycleConfiguration: LifecycleConfiguration,
    loggingConfiguration: LoggingConfiguration,
    metricsConfigurations: {
      type: 'array',
      items: MetricsConfiguration,
    },
    name: { $ref: '#/definitions/awsS3BucketName' },
    notificationConfiguration: NotificationConfiguration,
    objectLockConfiguration: ObjectLockConfiguration,
    objectLockEnabled: {
      type: 'boolean',
    },
    publicAccessBlockConfiguration: PublicAccessBlockConfiguration,
    replicationConfiguration: ReplicationConfiguration,
    Tags: {
      type: 'array',
      items: Tag,
    },
    versioningConfiguration: VersioningConfiguration,
    websiteConfiguration: WebsiteConfiguration,
  },
  required: [],
  additionalProperties: false,
};
