'use strict';

const accelerateConfiguration = {
  type: 'object',
  properties: {
    AccelerationStatus: { enum: ['Enabled', 'Suspended'] },
  },
  required: ['AccelerationStatus'],
  additionalProperties: false,
};

const accessControl = {
  enum: [
    'Private',
    'PublicRead',
    'PublicReadWrite',
    'AuthenticatedRead',
    'LogDeliveryWrite',
    'BucketOwnerRead',
    'BucketOwnerFullControl',
    'AwsExecRead',
  ],
};

const analyticsConfigurations = {
  type: 'object',
  properties: {
    Id: { type: 'string' },
    Prefix: { type: 'string' },
    StorageClassAnalysis: {
      type: 'object',
      properties: {
        DataExport: {
          type: 'object',
          properties: {
            Destination: {
              type: 'object',
              properties: {
                BucketAccountId: { type: 'string', pattern: '^\\d{12}$' },
              },
              additionalProperties: false,
            },
          },
          additionalProperties: false,
        },
      },
      additionalProperties: false,
    },
  },
  required: ['Id', 'StorageClassAnalysis'],
  additionalProperties: false,
};

const bucketEncryption = {
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
                oneOf: [{ $ref: '#/definitions/awsKmsArn' }, { type: 'string' }],
              },
              SSEAlgorithm: {
                enum: ['AES256', 'aws:kms'],
              },
            },
            required: ['SSEAlgorithm'],
            additionalProperties: false,
          },
        },
        required: [],
        additionalProperties: false,
      },
    },
  },
  required: ['ServerSideEncryptionConfiguration'],
  additionalProperties: false,
};

const corsConfiguration = {
  type: 'object',
  properties: {
    CorsRules: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          AllowedHeaders: { type: 'array', items: { type: 'string' } },
          AllowedMethods: { enum: ['GET', 'PUT', 'HEAD', 'POST', 'DELETE'] },
          AllowedOrigins: { type: 'array', items: { type: 'string' } },
          ExposedHeaders: { type: 'array', items: { type: 'string' } },
          Id: { type: 'string', maxLength: 255 },
          MaxAge: { type: 'integer' },
        },
        required: ['AllowedMethods', 'AllowedOrigins'],
        additionalProperties: false,
      },
    },
  },
  required: ['CorsRules'],
  additionalProperties: false,
};

const inventoryConfigurations = {
  type: 'array',
  items: {
    type: 'object',
    properties: {
      Destination: {
        type: 'object',
        properties: {
          BucketAccountId: { type: 'string', pattern: '\\d{12}' },
          BucketArn: { $ref: '#/definitions/awsArn' },
          Format: { enum: ['CSV', 'ORC', 'Parquet'] },
          Prefix: { type: 'string' },
        },
        required: ['BucketArn', 'Format'],
        additionalProperties: false,
      },
      Enabled: { enum: ['True', 'False'] },
      Id: { type: 'string' },
      IncludedObjectVersions: { enum: ['All', 'Current'] },
      OptionalFields: { type: 'array', items: { type: 'string' } },
      Prefix: { type: 'string' },
      ScheduleFrequency: { enum: ['Daily', 'Weekly'] },
    },
    required: ['Destination', 'Enabled', 'Id', 'IncludedObjectVersions', 'ScheduleFrequency'],
    additionalProperties: false,
  },
};

const NoncurrentVersionTransition = {
  type: 'object',
  properties: {
    StorageClass: {
      enum: ['DEEP_ARCHIVE', 'GLACIER', 'INTELLIGENT_TIERING', 'ONEZONE_IA', 'STANDARD_IA'],
    },
    TransitionInDays: { type: 'integer' },
  },
  required: ['StorageClass', 'TransitionInDays'],
  additionalProperties: false,
};

const lifecycleConfiguration = {
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
              DaysAfterInitiation: { type: 'integer' },
            },
            required: ['DaysAfterInitiation'],
            additionalProperties: false,
          },
          ExpirationDate: { format: 'date-time ' },
          ExpirationInDays: { type: 'integer' },
          Id: { type: 'string', maxLength: 255 },
          NoncurrentVersionExpirationInDays: { type: 'integer' },
          NoncurrentVersionTransition,
          NoncurrentVersionTransitions: {
            type: 'array',
            items: NoncurrentVersionTransition,
          },
          Prefix: { type: 'string' },
        },
        required: [],
        additionalProperties: false,
      },
    },
  },
  required: ['Rules'],
  additionalProperties: false,
};

// https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-properties-s3-bucket.html

module.exports = {
  type: 'object',
  properties: {
    name: { $ref: '#/definitions/awsS3BucketName' },
    accelerateConfiguration,
    accessControl,
    analyticsConfigurations,
    bucketEncryption,
    bucketName: { $ref: '#/definitions/awsS3BucketName' },
    corsConfiguration,
    inventoryConfigurations,
    lifecycleConfiguration,
  },
  additionalProperties: false,
};
