'use strict';

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

const notificationFilter = {
  type: 'object',
  properties: {
    S3Key: {
      type: 'object',
      properties: {
        Rules: {
          type: 'array',
          items: {
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
          },
        },
      },
      required: ['Rules'],
      additionalProperties: false,
    },
  },
  required: ['S3Key'],
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
      minimum: 0,
    },
  },
  required: ['StorageClass', 'TransitionInDays'],
  additionalProperties: false,
};

const replicationTimeValue = {
  type: 'object',
  properties: {
    Minutes: {
      type: 'integer',
      minimum: 0,
    },
  },
  required: ['Minutes'],
  additionalProperties: false,
};

module.exports = {
  type: 'object',
  properties: {
    accelerateConfiguration: {
      type: 'object',
      properties: {
        AccelerationStatus: {
          enum: ['Enabled', 'Suspended'],
        },
      },
      required: ['AccelerationStatus'],
      additionalProperties: false,
    },
    accessControl: {
      type: 'string',
    },
    analyticsConfigurations: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          Id: {
            type: 'string',
          },
          Prefix: {
            type: 'string',
          },
          StorageClassAnalysis: {
            type: 'object',
            properties: {
              DataExport: {
                type: 'object',
                properties: {
                  Destination: destination,
                  OutputSchemaVersion: {
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
            type: 'array',
            items: tagFilter,
          },
        },
        required: ['Id', 'StorageClassAnalysis'],
        additionalProperties: false,
      },
    },
    bucketEncryption: {
      type: 'object',
      properties: {
        ServerSideEncryptionConfiguration: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              ServerSideEncryptionByDefault: {
                type: 'object',
                properties: {
                  KMSMasterKeyID: {
                    anyOf: [
                      { $ref: '#/definitions/awsArn' },
                      { type: 'string', pattern: '^[a-f0-9-]+$' },
                    ],
                  },
                  SSEAlgorithm: {
                    enum: ['AES256', 'aws:kms'],
                  },
                },
                required: ['SSEAlgorithm'],
                additionalProperties: false,
              },
            },
            additionalProperties: false,
          },
        },
      },
      required: ['ServerSideEncryptionConfiguration'],
      additionalProperties: false,
    },
    bucketName: { $ref: '#/definitions/awsS3BucketName' },
    corsConfiguration: {
      type: 'object',
      properties: {
        CorsRules: {
          type: 'array',
          items: {
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
      type: 'array',
      items: {
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
      },
    },
    lifecycleConfiguration: {
      type: 'object',
      properties: {
        Rules: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              AbortIncompleteMultipartUpload: {
                type: 'object',
                properties: {
                  DaysAfterInitiation: {
                    type: 'integer',
                    minimum: 0,
                  },
                },
                required: ['DaysAfterInitiation'],
                additionalProperties: false,
              },
              ExpirationDate: {
                type: 'string',
                format: 'date-time',
              },
              ExpirationInDays: {
                type: 'integer',
                minimum: 0,
              },
              Id: {
                type: 'string',
                maxLength: 255,
              },
              NoncurrentVersionExpirationInDays: {
                type: 'integer',
                minimum: 0,
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
              Transitions: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    StorageClass: {
                      enum: [
                        'DEEP_ARCHIVE',
                        'GLACIER',
                        'INTELLIGENT_TIERING',
                        'ONEZONE_IA',
                        'STANDARD_IA',
                      ],
                    },
                    TransitionDate: {
                      type: 'string',
                      format: 'date-time',
                    },
                    TransitionInDays: {
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
      type: 'object',
      properties: {
        DestinationBucketName: {
          anyOf: [
            { $ref: '#/definitions/awsS3BucketName' },
            { $ref: '#/definitions/awsCfFunction' },
          ],
        },
        LogFilePrefix: {
          type: 'string',
        },
      },
      additionalProperties: false,
    },
    metricsConfigurations: {
      type: 'array',
      items: {
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
      },
    },
    name: { $ref: '#/definitions/awsS3BucketName' },
    notificationConfiguration: {
      type: 'object',
      properties: {
        LambdaConfigurations: {
          type: 'array',
          items: {
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
          },
        },
        QueueConfigurations: {
          type: 'array',
          items: {
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
          },
        },
        TopicConfigurations: {
          type: 'array',
          items: {
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
          },
        },
      },
      additionalProperties: false,
    },
    objectLockConfiguration: {
      type: 'object',
      properties: {
        ObjectLockEnabled: {
          const: 'Enabled',
        },
        Rule: {
          type: 'object',
          properties: {
            DefaultRetention: {
              type: 'object',
              properties: {
                Days: {
                  type: 'integer',
                  minimum: 0,
                },
                Mode: {
                  enum: ['COMPLIANCE', 'GOVERNANCE'],
                },
                Years: {
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
      type: 'boolean',
    },
    publicAccessBlockConfiguration: {
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
      additionalProperties: false,
    },
    replicationConfiguration: {
      type: 'object',
      properties: {
        Role: { $ref: '#/definitions/awsArn' },
        Rules: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              DeleteMarkerReplication: {
                type: 'object',
                properties: {
                  Status: {
                    enum: ['Disabled', 'Enabled'],
                  },
                },
                additionalProperties: false,
              },
              Destination: {
                type: 'object',
                properties: {
                  AccessControlTranslation: {
                    type: 'object',
                    properties: {
                      Owner: {
                        const: 'Destination',
                      },
                    },
                    required: ['Owner'],
                    additionalProperties: false,
                  },
                  Account: {
                    type: 'string',
                    pattern: '^\\d{12}$',
                  },
                  Bucket: { $ref: '#/definitions/awsArn' },
                  EncryptionConfiguration: {
                    type: 'object',
                    properties: {
                      ReplicaKmsKeyID: {
                        type: 'string',
                      },
                    },
                    required: ['ReplicaKmsKeyID'],
                    additionalProperties: false,
                  },
                  Metrics: {
                    type: 'object',
                    properties: {
                      EventThreshold: replicationTimeValue,
                      Status: {
                        enum: ['Disabled', 'Enabled'],
                      },
                    },
                    required: ['EventThreshold', 'Status'],
                    additionalProperties: false,
                  },
                  ReplicationTime: {
                    type: 'object',
                    properties: {
                      Status: {
                        enum: ['Disabled', 'Enabled'],
                      },
                      Time: replicationTimeValue,
                    },
                    required: ['Status', 'Time'],
                    additionalProperties: false,
                  },
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
              },
              Filter: {
                type: 'object',
                properties: {
                  And: {
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
                  },
                  Prefix: {
                    type: 'string',
                  },
                  TagFilter: tagFilter,
                },
                additionalProperties: false,
              },
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
              SourceSelectionCriteria: {
                type: 'object',
                properties: {
                  SseKmsEncryptedObjects: {
                    type: 'object',
                    properties: {
                      Status: {
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
      type: 'array',
      items: {
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
      },
    },
    versioningConfiguration: {
      type: 'object',
      properties: {
        Status: {
          enum: ['Enabled', 'Suspended'],
        },
      },
      required: ['Status'],
      additionalProperties: false,
    },
    websiteConfiguration: {
      type: 'object',
      properties: {
        ErrorDocument: {
          type: 'string',
        },
        IndexDocument: {
          type: 'string',
        },
        RedirectAllRequestsTo: {
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
        },
        RoutingRules: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              RedirectRule: {
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
              },
              RoutingRuleCondition: {
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
};
