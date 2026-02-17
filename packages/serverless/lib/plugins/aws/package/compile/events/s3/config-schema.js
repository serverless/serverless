import { cfValue } from '../../../../../../utils/aws-schema-get-cf-value.js'

const destination = {
  type: 'object',
  properties: {
    BucketAccountId: {
      description: `AWS account ID that owns the destination bucket.`,
      type: 'string',
      pattern: '\\d{12}',
    },
    BucketArn: {
      description: `Destination bucket ARN.`,
      $ref: '#/definitions/awsArn',
    },
    Format: {
      description: `Output format for analytics or inventory data.`,
      enum: ['CSV', 'ORC', 'Parquet'],
    },
    Prefix: {
      description: `S3 key prefix applied to output objects.`,
      type: 'string',
    },
  },
  required: ['BucketArn', 'Format'],
  additionalProperties: false,
}

const tagFilter = {
  type: 'object',
  properties: {
    Key: {
      description: `Tag key name.`,
      type: 'string',
    },
    Value: {
      description: `Tag value.`,
      type: 'string',
    },
  },
  required: ['Key', 'Value'],
  additionalProperties: false,
}

const notificationFilter = {
  type: 'object',
  properties: {
    S3Key: {
      description: `S3 object key filter configuration.`,
      type: 'object',
      properties: {
        Rules: {
          description: `Filter rules for matching S3 object keys.`,
          type: 'array',
          items: {
            type: 'object',
            properties: {
              Name: {
                description: `Filter rule type: prefix or suffix.`,
                enum: ['prefix', 'suffix'],
              },
              Value: {
                description: `Filter rule value to match against the object key.`,
                type: 'string',
              },
            },
            required: ['Name', 'Value'],
            additionalProperties: false,
          },
        },
      },
      required: ['Rules'],
      additionalProperties: false,
    },
  },
  required: ['S3Key'],
  additionalProperties: false,
}

const noncurrentVersionTransition = {
  type: 'object',
  properties: {
    StorageClass: {
      description: `Target storage class for the transition.`,
      enum: [
        'DEEP_ARCHIVE',
        'GLACIER',
        'INTELLIGENT_TIERING',
        'ONEZONE_IA',
        'STANDARD_IA',
      ],
    },
    TransitionInDays: {
      description: `Days after object creation before transition.`,
      type: 'integer',
      minimum: 0,
    },
  },
  required: ['StorageClass', 'TransitionInDays'],
  additionalProperties: false,
}

const replicationTimeValue = {
  type: 'object',
  properties: {
    Minutes: {
      description: `Time threshold in minutes.`,
      type: 'integer',
      minimum: 0,
    },
  },
  required: ['Minutes'],
  additionalProperties: false,
}

export default {
  type: 'object',
  description: `Provider-level S3 bucket definition used by \`provider.s3\`.
@see https://www.serverless.com/framework/docs/providers/aws/events/s3`,
  properties: {
    accelerateConfiguration: {
      description: `S3 Transfer Acceleration configuration.`,
      type: 'object',
      properties: {
        AccelerationStatus: {
          description: `Transfer Acceleration status.`,
          enum: ['Enabled', 'Suspended'],
        },
      },
      required: ['AccelerationStatus'],
      additionalProperties: false,
    },
    accessControl: {
      description: `Canned ACL that grants predefined permissions to the bucket.`,
      type: 'string',
    },
    analyticsConfigurations: {
      description: `S3 Analytics storage class analysis configurations.`,
      type: 'array',
      items: {
        type: 'object',
        properties: {
          Id: {
            description: `Unique identifier for this analytics configuration.`,
            type: 'string',
          },
          Prefix: {
            description: `Object key prefix that filters the analytics scope.`,
            type: 'string',
          },
          StorageClassAnalysis: {
            description: `Storage class analysis configuration for data export.`,
            type: 'object',
            properties: {
              DataExport: {
                description: `Data export destination configuration.`,
                type: 'object',
                properties: {
                  Destination: destination,
                  OutputSchemaVersion: {
                    description: `Schema version of the exported analytics data.`,
                    const: 'V_1',
                  },
                },
                required: ['Destination', 'OutputSchemaVersion'],
                additionalProperties: false,
              },
            },
            additionalProperties: false,
          },
          TagFilters: {
            description: `Tag-based filter conditions.`,
            type: 'array',
            items: tagFilter,
          },
        },
        required: ['Id', 'StorageClassAnalysis'],
        additionalProperties: false,
      },
    },
    bucketEncryption: {
      description: `Default server-side encryption configuration.`,
      type: 'object',
      properties: {
        ServerSideEncryptionConfiguration: {
          description: `Server-side encryption rules.`,
          type: 'array',
          items: {
            type: 'object',
            properties: {
              ServerSideEncryptionByDefault: {
                description: `Default encryption algorithm and key.`,
                type: 'object',
                properties: {
                  KMSMasterKeyID: {
                    description: `KMS key ID or ARN for SSE-KMS encryption.`,
                    anyOf: [
                      { $ref: '#/definitions/awsArn' },
                      { type: 'string', pattern: '^[a-f0-9-]+$' },
                    ],
                  },
                  SSEAlgorithm: {
                    description: `Server-side encryption algorithm.`,
                    enum: ['AES256', 'aws:kms'],
                  },
                },
                required: ['SSEAlgorithm'],
                additionalProperties: false,
              },
              BucketKeyEnabled: {
                description: `Enable S3 Bucket Key to reduce KMS costs.`,
                type: 'boolean',
              },
            },
            additionalProperties: false,
          },
        },
      },
      required: ['ServerSideEncryptionConfiguration'],
      additionalProperties: false,
    },
    bucketName: {
      description: `S3 bucket name.`,
      $ref: '#/definitions/awsS3BucketName',
    },
    corsConfiguration: {
      description: `Cross-origin resource sharing (CORS) configuration.`,
      type: 'object',
      properties: {
        CorsRules: {
          description: `CORS access rules.`,
          type: 'array',
          items: {
            type: 'object',
            properties: {
              AllowedHeaders: {
                description: `HTTP headers allowed in preflight requests.`,
                type: 'array',
                items: { type: 'string' },
              },
              AllowedMethods: {
                description: `HTTP methods allowed for cross-origin requests.`,
                type: 'array',
                items: { enum: ['GET', 'PUT', 'HEAD', 'POST', 'DELETE'] },
              },
              AllowedOrigins: {
                description: `Origins allowed to make cross-origin requests.`,
                type: 'array',
                items: { type: 'string' },
              },
              ExposedHeaders: {
                description: `Response headers exposed to browsers.`,
                type: 'array',
                items: { type: 'string' },
              },
              Id: {
                description: `Unique identifier for this CORS rule.`,
                type: 'string',
                maxLength: 255,
              },
              MaxAge: {
                description: `Preflight cache duration in seconds.`,
                type: 'integer',
                minimum: 0,
              },
            },
            required: ['AllowedMethods', 'AllowedOrigins'],
            additionalProperties: false,
          },
          maxItems: 100,
        },
      },
      required: ['CorsRules'],
      additionalProperties: false,
    },
    inventoryConfigurations: {
      description: `S3 Inventory report configurations.`,
      type: 'array',
      items: {
        type: 'object',
        properties: {
          Destination: destination,
          Enabled: {
            description: `Whether the inventory report is enabled.`,
            type: 'boolean',
          },
          Id: {
            description: `Unique identifier for this inventory configuration.`,
            type: 'string',
          },
          IncludedObjectVersions: {
            description: `Object version scope: all versions or current only.`,
            enum: ['All', 'Current'],
          },
          OptionalFields: {
            description: `Additional metadata fields to include in the report.`,
            type: 'array',
            items: { type: 'string' },
          },
          Prefix: {
            description: `Object key prefix filter for inventory scope.`,
            type: 'string',
          },
          ScheduleFrequency: {
            description: `Inventory report generation frequency.`,
            enum: ['Daily', 'Weekly'],
          },
        },
        required: [
          'Destination',
          'Enabled',
          'Id',
          'IncludedObjectVersions',
          'ScheduleFrequency',
        ],
        additionalProperties: false,
      },
    },
    lifecycleConfiguration: {
      description: `S3 object lifecycle management rules.`,
      type: 'object',
      properties: {
        Rules: {
          description: `Lifecycle rules defining transition and expiration actions.`,
          type: 'array',
          items: {
            type: 'object',
            properties: {
              AbortIncompleteMultipartUpload: {
                description: `Clean up incomplete multipart uploads after a timeout.`,
                type: 'object',
                properties: {
                  DaysAfterInitiation: {
                    description: `Days after initiation to abort the multipart upload.`,
                    type: 'integer',
                    minimum: 0,
                  },
                },
                required: ['DaysAfterInitiation'],
                additionalProperties: false,
              },
              ExpirationDate: {
                description: `Date on which objects expire (ISO 8601).`,
                type: 'string',
                format: 'iso-date-time',
              },
              ExpirationInDays: cfValue({
                description: `Days after creation before objects expire.`,
                type: 'integer',
                minimum: 0,
              }),
              Id: {
                description: `Unique identifier for this lifecycle rule.`,
                type: 'string',
                maxLength: 255,
              },
              NoncurrentVersionExpirationInDays: {
                description: `Days after objects become noncurrent before deletion.`,
                type: 'integer',
                minimum: 0,
              },
              NoncurrentVersionTransition: noncurrentVersionTransition,
              NoncurrentVersionTransitions: {
                description: `Transition rules for noncurrent object versions.`,
                type: 'array',
                items: noncurrentVersionTransition,
              },
              Prefix: {
                description: `Object key prefix filter for this lifecycle rule.`,
                type: 'string',
              },
              Status: {
                description: `Whether this lifecycle rule is active.`,
                enum: ['Disabled', 'Enabled'],
              },
              TagFilters: {
                description: `Tag-based filter conditions.`,
                type: 'array',
                items: tagFilter,
              },
              Transitions: {
                description: `Storage class transition rules for current versions.`,
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    StorageClass: {
                      description: `Target storage class for the transition.`,
                      enum: [
                        'DEEP_ARCHIVE',
                        'GLACIER',
                        'INTELLIGENT_TIERING',
                        'ONEZONE_IA',
                        'STANDARD_IA',
                      ],
                    },
                    TransitionDate: {
                      description: `Date on which objects transition (ISO 8601).`,
                      type: 'string',
                      format: 'iso-date-time',
                    },
                    TransitionInDays: {
                      description: `Days after creation before objects transition.`,
                      type: 'integer',
                      minimum: 1,
                    },
                  },
                  required: ['StorageClass'],
                  additionalProperties: false,
                },
              },
            },
            required: ['Status'],
            anyOf: [
              'AbortIncompleteMultipartUpload',
              'ExpirationDate',
              'ExpirationInDays',
              'NoncurrentVersionExpirationInDays',
              'NoncurrentVersionTransition',
              'NoncurrentVersionTransitions',
              'Transition',
              'Transitions',
            ].map((field) => ({ required: [field] })),
            additionalProperties: false,
          },
        },
      },
      required: ['Rules'],
      additionalProperties: false,
    },
    loggingConfiguration: {
      description: `Server access logging configuration.`,
      type: 'object',
      properties: {
        DestinationBucketName: {
          description: `Name of the bucket that receives access logs.`,
          anyOf: [
            { $ref: '#/definitions/awsS3BucketName' },
            { $ref: '#/definitions/awsCfFunction' },
          ],
        },
        LogFilePrefix: {
          description: `Key prefix for log objects.`,
          type: 'string',
        },
      },
      additionalProperties: false,
    },
    metricsConfigurations: {
      description: `CloudWatch request metrics configurations.`,
      type: 'array',
      items: {
        type: 'object',
        properties: {
          Id: {
            description: `Unique identifier for this metrics configuration.`,
            type: 'string',
          },
          Prefix: {
            description: `Object key prefix filter for metrics scope.`,
            type: 'string',
          },
          TagFilters: {
            description: `Tag-based filter conditions.`,
            type: 'array',
            items: tagFilter,
          },
        },
        required: ['Id'],
        additionalProperties: false,
      },
    },
    name: {
      description: `Logical provider-level bucket name key.`,
      $ref: '#/definitions/awsS3BucketName',
    },
    notificationConfiguration: {
      description: `S3 event notification configuration.`,
      type: 'object',
      properties: {
        LambdaConfigurations: {
          description: `Lambda function notification targets.`,
          type: 'array',
          items: {
            type: 'object',
            properties: {
              Event: {
                description: `S3 event type that triggers the notification.`,
                type: 'string',
                pattern: '^s3:',
              },
              Filter: notificationFilter,
              Function: {
                description: `Lambda function ARN destination.`,
                $ref: '#/definitions/awsArn',
              },
            },
            required: ['Event', 'Function'],
            additionalProperties: false,
          },
        },
        QueueConfigurations: {
          description: `SQS queue notification targets.`,
          type: 'array',
          items: {
            type: 'object',
            properties: {
              Event: {
                description: `S3 event type that triggers the notification.`,
                type: 'string',
                pattern: '^s3:',
              },
              Filter: notificationFilter,
              Queue: {
                description: `SQS queue ARN destination.`,
                $ref: '#/definitions/awsArn',
              },
            },
            required: ['Event', 'Queue'],
            additionalProperties: false,
          },
        },
        TopicConfigurations: {
          description: `SNS topic notification targets.`,
          type: 'array',
          items: {
            type: 'object',
            properties: {
              Event: {
                description: `S3 event type that triggers the notification.`,
                type: 'string',
                pattern: '^s3:',
              },
              Filter: notificationFilter,
              Topic: {
                description: `SNS topic ARN destination.`,
                $ref: '#/definitions/awsArn',
              },
            },
            required: ['Event', 'Topic'],
            additionalProperties: false,
          },
        },
      },
      additionalProperties: false,
    },
    objectLockConfiguration: {
      description: `S3 Object Lock configuration.`,
      type: 'object',
      properties: {
        ObjectLockEnabled: {
          description: `Enable Object Lock on the bucket.`,
          const: 'Enabled',
        },
        Rule: {
          description: `Default retention rule for Object Lock.`,
          type: 'object',
          properties: {
            DefaultRetention: {
              description: `Default retention period applied to new objects.`,
              type: 'object',
              properties: {
                Days: {
                  description: `Retention period in days.`,
                  type: 'integer',
                  minimum: 0,
                },
                Mode: {
                  description: `Retention mode: COMPLIANCE or GOVERNANCE.`,
                  enum: ['COMPLIANCE', 'GOVERNANCE'],
                },
                Years: {
                  description: `Retention period in years.`,
                  type: 'integer',
                  minimum: 0,
                },
              },
              additionalProperties: false,
            },
          },
          additionalProperties: false,
        },
      },
      additionalProperties: false,
    },
    objectLockEnabled: {
      description: `Whether Object Lock is enabled on the bucket.`,
      type: 'boolean',
    },
    publicAccessBlockConfiguration: {
      description: `S3 public access block settings.`,
      type: 'object',
      properties: {
        BlockPublicAcls: {
          description: `Block new public ACLs and uploading public objects.`,
          type: 'boolean',
        },
        BlockPublicPolicy: {
          description: `Block new public bucket policies.`,
          type: 'boolean',
        },
        IgnorePublicAcls: {
          description: `Ignore all public ACLs on the bucket.`,
          type: 'boolean',
        },
        RestrictPublicBuckets: {
          description: `Restrict access to the bucket to only authorized principals.`,
          type: 'boolean',
        },
      },
      additionalProperties: false,
    },
    replicationConfiguration: {
      description: `S3 cross-region or same-region replication configuration.`,
      type: 'object',
      properties: {
        Role: {
          description: `Replication IAM role ARN.`,
          $ref: '#/definitions/awsArn',
        },
        Rules: {
          description: `Replication rules.`,
          type: 'array',
          items: {
            type: 'object',
            properties: {
              DeleteMarkerReplication: {
                description: `Whether to replicate delete markers.`,
                type: 'object',
                properties: {
                  Status: {
                    description: `Whether this configuration is enabled or disabled.`,
                    enum: ['Disabled', 'Enabled'],
                  },
                },
                additionalProperties: false,
              },
              Destination: {
                description: `Replication destination configuration.`,
                type: 'object',
                properties: {
                  AccessControlTranslation: {
                    description: `Ownership override for replicated objects.`,
                    type: 'object',
                    properties: {
                      Owner: {
                        description: `Set destination account as object owner.`,
                        const: 'Destination',
                      },
                    },
                    required: ['Owner'],
                    additionalProperties: false,
                  },
                  Account: {
                    description: `Destination AWS account ID for cross-account replication.`,
                    type: 'string',
                    pattern: '^\\d{12}$',
                  },
                  Bucket: {
                    description: `Destination bucket ARN.`,
                    $ref: '#/definitions/awsArn',
                  },
                  EncryptionConfiguration: {
                    description: `Encryption settings for replicated objects.`,
                    type: 'object',
                    properties: {
                      ReplicaKmsKeyID: {
                        description: `KMS key ID used to encrypt replicated objects.`,
                        type: 'string',
                      },
                    },
                    required: ['ReplicaKmsKeyID'],
                    additionalProperties: false,
                  },
                  Metrics: {
                    description: `Replication metrics configuration.`,
                    type: 'object',
                    properties: {
                      EventThreshold: replicationTimeValue,
                      Status: {
                        description: `Whether this configuration is enabled or disabled.`,
                        enum: ['Disabled', 'Enabled'],
                      },
                    },
                    required: ['EventThreshold', 'Status'],
                    additionalProperties: false,
                  },
                  ReplicationTime: {
                    description: `Replication time control configuration.`,
                    type: 'object',
                    properties: {
                      Status: {
                        description: `Whether this configuration is enabled or disabled.`,
                        enum: ['Disabled', 'Enabled'],
                      },
                      Time: replicationTimeValue,
                    },
                    required: ['Status', 'Time'],
                    additionalProperties: false,
                  },
                  StorageClass: {
                    description: `Storage class for replicated objects.`,
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
              },
              Filter: {
                description: `Replication rule filter.`,
                type: 'object',
                properties: {
                  And: {
                    description: `Logical AND of multiple filter conditions.`,
                    type: 'object',
                    properties: {
                      Prefix: {
                        description: `Object key prefix filter.`,
                        type: 'string',
                      },
                      TagFilters: {
                        description: `Tag-based filter conditions.`,
                        type: 'array',
                        items: tagFilter,
                      },
                    },
                    additionalProperties: false,
                  },
                  Prefix: {
                    description: `Object key prefix filter.`,
                    type: 'string',
                  },
                  TagFilter: tagFilter,
                },
                additionalProperties: false,
              },
              Id: {
                description: `Unique identifier for this replication rule.`,
                type: 'string',
                maxLength: 255,
              },
              Prefix: {
                description: `Legacy prefix filter for this rule.`,
                type: 'string',
              },
              Priority: {
                description: `Rule priority for conflict resolution.`,
                type: 'integer',
              },
              SourceSelectionCriteria: {
                description: `Criteria for selecting source objects to replicate.`,
                type: 'object',
                properties: {
                  SseKmsEncryptedObjects: {
                    description: `Whether to replicate SSE-KMS encrypted objects.`,
                    type: 'object',
                    properties: {
                      Status: {
                        description: `Whether this configuration is enabled or disabled.`,
                        enum: ['Disabled', 'Enabled'],
                      },
                    },
                    required: ['Status'],
                    additionalProperties: false,
                  },
                },
                required: ['SseKmsEncryptedObjects'],
                additionalProperties: false,
              },
              Status: {
                description: `Whether this configuration is enabled or disabled.`,
                enum: ['Disabled', 'Enabled'],
              },
            },
            required: ['Destination', 'Status'],
            additionalProperties: false,
          },
          minItems: 1,
          maxItems: 1000,
        },
      },
      required: ['Role', 'Rules'],
      additionalProperties: false,
    },
    tags: {
      description: `Resource tags applied to the bucket.`,
      type: 'array',
      items: {
        type: 'object',
        properties: {
          Key: {
            description: `Tag key name.`,
            type: 'string',
          },
          Value: {
            description: `Tag value.`,
            type: 'string',
          },
        },
        required: ['Key', 'Value'],
        additionalProperties: false,
      },
    },
    versioningConfiguration: {
      description: `Bucket versioning configuration.`,
      type: 'object',
      properties: {
        Status: {
          description: `Whether this configuration is enabled or disabled.`,
          enum: ['Enabled', 'Suspended'],
        },
      },
      required: ['Status'],
      additionalProperties: false,
    },
    websiteConfiguration: {
      description: `Static website hosting configuration.`,
      type: 'object',
      properties: {
        ErrorDocument: {
          description: `Error page document key.`,
          type: 'string',
        },
        IndexDocument: {
          description: `Index page document key.`,
          type: 'string',
        },
        RedirectAllRequestsTo: {
          description: `Redirect all requests to another host.`,
          type: 'object',
          properties: {
            HostName: {
              description: `Target host name for the redirect.`,
              type: 'string',
            },
            Protocol: {
              description: `Protocol used for the redirect.`,
              enum: ['http', 'https'],
            },
          },
          required: ['HostName'],
          additionalProperties: false,
        },
        RoutingRules: {
          description: `URL redirect and rewrite rules.`,
          type: 'array',
          items: {
            type: 'object',
            properties: {
              RedirectRule: {
                description: `Redirect action configuration.`,
                type: 'object',
                properties: {
                  HostName: {
                    description: `Target host name for the redirect.`,
                    type: 'string',
                  },
                  HttpRedirectCode: {
                    description: `HTTP redirect status code.`,
                    type: 'string',
                  },
                  Protocol: {
                    description: `Protocol used for the redirect.`,
                    enum: ['http', 'https'],
                  },
                  ReplaceKeyPrefixWith: {
                    description: `Replacement key prefix for the redirect target.`,
                    type: 'string',
                  },
                  ReplaceKeyWith: {
                    description: `Replacement key for the redirect target.`,
                    type: 'string',
                  },
                },
                additionalProperties: false,
              },
              RoutingRuleCondition: {
                description: `Condition that triggers this routing rule.`,
                type: 'object',
                properties: {
                  HttpErrorCodeReturnedEquals: {
                    description: `HTTP error code that triggers the redirect.`,
                    type: 'string',
                  },
                  KeyPrefixEquals: {
                    description: `Object key prefix that triggers the redirect.`,
                    type: 'string',
                  },
                },
                additionalProperties: false,
              },
            },
            required: ['RedirectRule'],
            additionalProperties: false,
          },
        },
      },
      additionalProperties: false,
    },
  },
  additionalProperties: false,
}
