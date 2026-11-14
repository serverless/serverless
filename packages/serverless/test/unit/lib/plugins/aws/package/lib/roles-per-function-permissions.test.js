import { jest } from '@jest/globals'
import applyPerFunctionPermissions from '../../../../../../../lib/plugins/aws/package/lib/roles-per-function-permissions.js'

describe('applyPerFunctionPermissions - Destination Permissions', () => {
  let serverless
  let provider
  let policyStatements
  let functionIamRole

  beforeEach(() => {
    provider = {
      naming: {
        getLogGroupName: jest.fn((name, { logGroupClass } = {}) => {
          const suffix = logGroupClass === 'INFREQUENT_ACCESS' ? '-ia' : ''
          return `/aws/lambda/${name}${suffix}`
        }),
      },
      getLogGroupClass: jest.fn((fn) => fn?.logs?.logGroupClass ?? undefined),
    }
    serverless = {
      service: {
        provider: {},
        getFunction: jest.fn((name) => ({
          name: `test-service-dev-${name}`,
        })),
      },
      getProvider: jest.fn(() => provider),
    }
    policyStatements = []
    functionIamRole = {
      Properties: {
        ManagedPolicyArns: [],
        AssumeRolePolicyDocument: {
          Statement: [
            {
              Effect: 'Allow',
              Principal: { Service: 'lambda.amazonaws.com' },
              Action: 'sts:AssumeRole',
            },
          ],
        },
      },
    }
  })

  it('should add SQS permissions for onSuccess SQS destination', () => {
    const functionObject = {
      name: 'test-function',
      destinations: {
        onSuccess: {
          type: 'sqs',
          arn: 'arn:aws:sqs:us-east-1:123456789012:my-queue',
        },
      },
    }

    applyPerFunctionPermissions({
      functionName: 'myFunc',
      functionObject,
      functionIamRole,
      policyStatements,
      serverless,
      provider,
      throwError: jest.fn(),
    })

    const sqsPermission = policyStatements.find(
      (s) => s.Action === 'sqs:SendMessage',
    )
    expect(sqsPermission).toBeDefined()
    expect(sqsPermission.Effect).toBe('Allow')
    expect(sqsPermission.Resource).toBe(
      'arn:aws:sqs:us-east-1:123456789012:my-queue',
    )
  })

  it('should add SNS permissions for onFailure SNS destination', () => {
    const functionObject = {
      name: 'test-function',
      destinations: {
        onFailure: {
          type: 'sns',
          arn: 'arn:aws:sns:us-east-1:123456789012:my-topic',
        },
      },
    }

    applyPerFunctionPermissions({
      functionName: 'myFunc',
      functionObject,
      functionIamRole,
      policyStatements,
      serverless,
      provider,
      throwError: jest.fn(),
    })

    const snsPermission = policyStatements.find(
      (s) => s.Action === 'sns:Publish',
    )
    expect(snsPermission).toBeDefined()
    expect(snsPermission.Effect).toBe('Allow')
    expect(snsPermission.Resource).toBe(
      'arn:aws:sns:us-east-1:123456789012:my-topic',
    )
  })

  it('should add Lambda permissions for onSuccess function destination', () => {
    const functionObject = {
      name: 'test-function',
      destinations: {
        onSuccess: {
          type: 'function',
          arn: 'arn:aws:lambda:us-east-1:123456789012:function:target-func',
        },
      },
    }

    applyPerFunctionPermissions({
      functionName: 'myFunc',
      functionObject,
      functionIamRole,
      policyStatements,
      serverless,
      provider,
      throwError: jest.fn(),
    })

    const lambdaPermission = policyStatements.find(
      (s) => s.Action === 'lambda:InvokeFunction',
    )
    expect(lambdaPermission).toBeDefined()
    expect(lambdaPermission.Effect).toBe('Allow')
    expect(lambdaPermission.Resource).toBe(
      'arn:aws:lambda:us-east-1:123456789012:function:target-func',
    )
  })

  it('should add EventBridge permissions for onFailure eventBus destination', () => {
    const functionObject = {
      name: 'test-function',
      destinations: {
        onFailure: {
          type: 'eventBus',
          arn: 'arn:aws:events:us-east-1:123456789012:event-bus/my-bus',
        },
      },
    }

    applyPerFunctionPermissions({
      functionName: 'myFunc',
      functionObject,
      functionIamRole,
      policyStatements,
      serverless,
      provider,
      throwError: jest.fn(),
    })

    const eventsPermission = policyStatements.find(
      (s) => s.Action === 'events:PutEvents',
    )
    expect(eventsPermission).toBeDefined()
    expect(eventsPermission.Effect).toBe('Allow')
    expect(eventsPermission.Resource).toBe(
      'arn:aws:events:us-east-1:123456789012:event-bus/my-bus',
    )
  })

  it('should infer Lambda permission from string ARN containing :function:', () => {
    const functionObject = {
      name: 'test-function',
      destinations: {
        onSuccess: 'arn:aws:lambda:us-east-1:123456789012:function:my-func',
      },
    }

    applyPerFunctionPermissions({
      functionName: 'myFunc',
      functionObject,
      functionIamRole,
      policyStatements,
      serverless,
      provider,
      throwError: jest.fn(),
    })

    const lambdaPermission = policyStatements.find(
      (s) => s.Action === 'lambda:InvokeFunction',
    )
    expect(lambdaPermission).toBeDefined()
    expect(lambdaPermission.Resource).toBe(
      'arn:aws:lambda:us-east-1:123456789012:function:my-func',
    )
  })

  it('should infer SQS permission from string ARN containing :sqs:', () => {
    const functionObject = {
      name: 'test-function',
      destinations: {
        onFailure: 'arn:aws:sqs:us-east-1:123456789012:my-queue',
      },
    }

    applyPerFunctionPermissions({
      functionName: 'myFunc',
      functionObject,
      functionIamRole,
      policyStatements,
      serverless,
      provider,
      throwError: jest.fn(),
    })

    const sqsPermission = policyStatements.find(
      (s) => s.Action === 'sqs:SendMessage',
    )
    expect(sqsPermission).toBeDefined()
    expect(sqsPermission.Resource).toBe(
      'arn:aws:sqs:us-east-1:123456789012:my-queue',
    )
  })

  it('should infer SNS permission from string ARN containing :sns:', () => {
    const functionObject = {
      name: 'test-function',
      destinations: {
        onSuccess: 'arn:aws:sns:us-east-1:123456789012:my-topic',
      },
    }

    applyPerFunctionPermissions({
      functionName: 'myFunc',
      functionObject,
      functionIamRole,
      policyStatements,
      serverless,
      provider,
      throwError: jest.fn(),
    })

    const snsPermission = policyStatements.find(
      (s) => s.Action === 'sns:Publish',
    )
    expect(snsPermission).toBeDefined()
    expect(snsPermission.Resource).toBe(
      'arn:aws:sns:us-east-1:123456789012:my-topic',
    )
  })

  it('should infer EventBridge permission from string ARN containing :event-bus/', () => {
    const functionObject = {
      name: 'test-function',
      destinations: {
        onFailure: 'arn:aws:events:us-east-1:123456789012:event-bus/my-bus',
      },
    }

    applyPerFunctionPermissions({
      functionName: 'myFunc',
      functionObject,
      functionIamRole,
      policyStatements,
      serverless,
      provider,
      throwError: jest.fn(),
    })

    const eventsPermission = policyStatements.find(
      (s) => s.Action === 'events:PutEvents',
    )
    expect(eventsPermission).toBeDefined()
    expect(eventsPermission.Resource).toBe(
      'arn:aws:events:us-east-1:123456789012:event-bus/my-bus',
    )
  })

  it('should create Fn::Sub ARN for function name reference', () => {
    const functionObject = {
      name: 'test-function',
      destinations: {
        onSuccess: 'targetFunction',
      },
    }

    applyPerFunctionPermissions({
      functionName: 'myFunc',
      functionObject,
      functionIamRole,
      policyStatements,
      serverless,
      provider,
      throwError: jest.fn(),
    })

    const lambdaPermission = policyStatements.find(
      (s) => s.Action === 'lambda:InvokeFunction',
    )
    expect(lambdaPermission).toBeDefined()
    expect(lambdaPermission.Resource).toEqual({
      'Fn::Sub':
        'arn:${AWS::Partition}:lambda:${AWS::Region}:${AWS::AccountId}:function:test-service-dev-targetFunction',
    })
  })

  it('should add permissions for both onSuccess and onFailure destinations', () => {
    const functionObject = {
      name: 'test-function',
      destinations: {
        onSuccess: {
          type: 'sqs',
          arn: 'arn:aws:sqs:us-east-1:123456789012:success-queue',
        },
        onFailure: {
          type: 'sns',
          arn: 'arn:aws:sns:us-east-1:123456789012:failure-topic',
        },
      },
    }

    applyPerFunctionPermissions({
      functionName: 'myFunc',
      functionObject,
      functionIamRole,
      policyStatements,
      serverless,
      provider,
      throwError: jest.fn(),
    })

    const sqsPermission = policyStatements.find(
      (s) => s.Action === 'sqs:SendMessage',
    )
    const snsPermission = policyStatements.find(
      (s) => s.Action === 'sns:Publish',
    )

    expect(sqsPermission).toBeDefined()
    expect(sqsPermission.Resource).toBe(
      'arn:aws:sqs:us-east-1:123456789012:success-queue',
    )

    expect(snsPermission).toBeDefined()
    expect(snsPermission.Resource).toBe(
      'arn:aws:sns:us-east-1:123456789012:failure-topic',
    )
  })

  it('should not add any permissions if no destinations are defined', () => {
    const functionObject = {
      name: 'test-function',
    }

    const initialLength = policyStatements.length

    applyPerFunctionPermissions({
      functionName: 'myFunc',
      functionObject,
      functionIamRole,
      policyStatements,
      serverless,
      provider,
      throwError: jest.fn(),
    })

    // Should only have log permissions added (1 statement)
    // Destination permissions should not add anything
    const destinationActions = [
      'sqs:SendMessage',
      'sns:Publish',
      'lambda:InvokeFunction',
      'events:PutEvents',
    ]
    const destinationPermissions = policyStatements.filter((s) =>
      destinationActions.includes(s.Action),
    )
    expect(destinationPermissions.length).toBe(0)
  })

  it('should call throwError for unsupported destination type', () => {
    const functionObject = {
      name: 'test-function',
      destinations: {
        onSuccess: {
          type: 'unsupported',
          arn: 'arn:aws:unsupported:us-east-1:123456789012:resource',
        },
      },
    }

    const throwError = jest.fn()
    applyPerFunctionPermissions({
      functionName: 'myFunc',
      functionObject,
      functionIamRole,
      policyStatements,
      serverless,
      provider,
      throwError,
    })

    expect(throwError).toHaveBeenCalledWith(
      expect.stringContaining('Unsupported destination target'),
      functionObject,
    )
  })

  it('should preserve aws:SourceAccount trust condition when adding CloudFront principal', () => {
    functionIamRole.Properties.AssumeRolePolicyDocument.Statement[0].Condition =
      {
        StringEquals: {
          'aws:SourceAccount': { Ref: 'AWS::AccountId' },
        },
      }

    const functionObject = {
      name: 'test-function',
      events: [
        {
          cloudFront: {
            eventType: 'viewer-request',
            origin: 's3://bucketname.s3.amazonaws.com/files',
          },
        },
      ],
    }

    applyPerFunctionPermissions({
      functionName: 'myFunc',
      functionObject,
      functionIamRole,
      policyStatements,
      serverless,
      provider,
      throwError: jest.fn(),
    })

    expect(functionIamRole.Properties.AssumeRolePolicyDocument).toEqual({
      Statement: [
        {
          Effect: 'Allow',
          Principal: {
            Service: ['lambda.amazonaws.com', 'edgelambda.amazonaws.com'],
          },
          Action: 'sts:AssumeRole',
          Condition: {
            StringEquals: {
              'aws:SourceAccount': { Ref: 'AWS::AccountId' },
            },
          },
        },
      ],
    })
  })

  it('should preserve aws:SourceAccount trust condition when adding Scheduler principal', () => {
    functionIamRole.Properties.AssumeRolePolicyDocument.Statement[0].Condition =
      {
        StringEquals: {
          'aws:SourceAccount': { Ref: 'AWS::AccountId' },
        },
      }

    const functionObject = {
      name: 'test-function',
      events: [
        {
          schedule: {
            method: 'scheduler',
            rate: 'rate(5 minutes)',
          },
        },
      ],
    }

    applyPerFunctionPermissions({
      functionName: 'myFunc',
      functionObject,
      functionIamRole,
      policyStatements,
      serverless,
      provider,
      throwError: jest.fn(),
    })

    expect(functionIamRole.Properties.AssumeRolePolicyDocument).toEqual({
      Statement: [
        {
          Effect: 'Allow',
          Principal: {
            Service: ['lambda.amazonaws.com', 'scheduler.amazonaws.com'],
          },
          Action: 'sts:AssumeRole',
          Condition: {
            StringEquals: {
              'aws:SourceAccount': { Ref: 'AWS::AccountId' },
            },
          },
        },
      ],
    })
  })
})

describe('applyPerFunctionPermissions - File System Permissions', () => {
  let serverless
  let provider
  let policyStatements
  let functionIamRole

  beforeEach(() => {
    provider = {
      naming: {
        getLogGroupName: jest.fn((name, { logGroupClass } = {}) => {
          const suffix = logGroupClass === 'INFREQUENT_ACCESS' ? '-ia' : ''
          return `/aws/lambda/${name}${suffix}`
        }),
      },
      getLogGroupClass: jest.fn((fn) => fn?.logs?.logGroupClass ?? undefined),
    }
    serverless = {
      service: {
        provider: {},
        getFunction: jest.fn((name) => ({
          name: `test-service-dev-${name}`,
        })),
      },
      getProvider: jest.fn(() => provider),
    }
    policyStatements = []
    functionIamRole = {
      Properties: {
        ManagedPolicyArns: [],
        AssumeRolePolicyDocument: {
          Statement: [
            {
              Effect: 'Allow',
              Principal: { Service: 'lambda.amazonaws.com' },
              Action: 'sts:AssumeRole',
            },
          ],
        },
      },
    }
  })

  it('should add EFS permissions for EFS ARN', () => {
    const efsArn =
      'arn:aws:elasticfilesystem:us-east-1:123456789012:access-point/fsap-0abcdef1234567890'
    const functionObject = {
      name: 'test-function',
      fileSystemConfig: {
        arn: efsArn,
        localMountPath: '/mnt/efs',
      },
    }

    applyPerFunctionPermissions({
      functionName: 'myFunc',
      functionObject,
      functionIamRole,
      policyStatements,
      serverless,
      provider,
      throwError: jest.fn(),
    })

    expect(policyStatements).toContainEqual({
      Effect: 'Allow',
      Action: [
        'elasticfilesystem:ClientMount',
        'elasticfilesystem:ClientWrite',
      ],
      Resource: [efsArn],
    })
  })

  it('should add S3 Files permissions for S3 Files ARN', () => {
    const s3FilesArn =
      'arn:aws:s3files:us-east-1:123456789012:file-system/fs-0abcdef1234567890/access-point/fsap-0abcdef1234567890'
    const functionObject = {
      name: 'test-function',
      fileSystemConfig: {
        arn: s3FilesArn,
        localMountPath: '/mnt/s3data',
      },
    }

    applyPerFunctionPermissions({
      functionName: 'myFunc',
      functionObject,
      functionIamRole,
      policyStatements,
      serverless,
      provider,
      throwError: jest.fn(),
    })

    expect(policyStatements).toContainEqual({
      Effect: 'Allow',
      Action: ['s3files:ClientMount', 's3files:ClientWrite'],
      Resource: [s3FilesArn],
    })
  })

  it('should add S3 Files permissions when type is explicitly set to s3files', () => {
    const cfRef = {
      'Fn::GetAtt': ['MyS3FilesAccessPoint', 'AccessPointArn'],
    }
    const functionObject = {
      name: 'test-function',
      fileSystemConfig: {
        arn: cfRef,
        localMountPath: '/mnt/s3data',
        type: 's3files',
      },
    }

    applyPerFunctionPermissions({
      functionName: 'myFunc',
      functionObject,
      functionIamRole,
      policyStatements,
      serverless,
      provider,
      throwError: jest.fn(),
    })

    expect(policyStatements).toContainEqual({
      Effect: 'Allow',
      Action: ['s3files:ClientMount', 's3files:ClientWrite'],
      Resource: [cfRef],
    })
  })

  it('should default to EFS permissions when CF reference is used without type', () => {
    const cfRef = { 'Fn::GetAtt': ['MyAccessPoint', 'AccessPointArn'] }
    const functionObject = {
      name: 'test-function',
      fileSystemConfig: {
        arn: cfRef,
        localMountPath: '/mnt/data',
      },
    }

    applyPerFunctionPermissions({
      functionName: 'myFunc',
      functionObject,
      functionIamRole,
      policyStatements,
      serverless,
      provider,
      throwError: jest.fn(),
    })

    expect(policyStatements).toContainEqual({
      Effect: 'Allow',
      Action: [
        'elasticfilesystem:ClientMount',
        'elasticfilesystem:ClientWrite',
      ],
      Resource: [cfRef],
    })
  })

  it('should not add permissions when fileSystemConfig is not set', () => {
    const functionObject = {
      name: 'test-function',
    }

    applyPerFunctionPermissions({
      functionName: 'myFunc',
      functionObject,
      functionIamRole,
      policyStatements,
      serverless,
      provider,
      throwError: jest.fn(),
    })

    expect(
      policyStatements.some(
        (s) =>
          s.Action &&
          (s.Action.includes('elasticfilesystem:ClientMount') ||
            s.Action.includes('s3files:ClientMount')),
      ),
    ).toBe(false)
  })
})

describe('applyPerFunctionPermissions - Log Permissions for INFREQUENT_ACCESS', () => {
  let serverless
  let provider
  let policyStatements
  let functionIamRole

  beforeEach(() => {
    provider = {
      naming: {
        getLogGroupName: jest.fn((name, { logGroupClass } = {}) => {
          const suffix = logGroupClass === 'INFREQUENT_ACCESS' ? '-ia' : ''
          return `/aws/lambda/${name}${suffix}`
        }),
      },
      getLogGroupClass: jest.fn((fn) => fn?.logs?.logGroupClass ?? undefined),
    }
    serverless = {
      service: {
        provider: {},
        getFunction: jest.fn((name) => ({
          name: `test-service-dev-${name}`,
        })),
      },
      getProvider: jest.fn(() => provider),
    }
    policyStatements = []
    functionIamRole = {
      Properties: {
        ManagedPolicyArns: [],
        AssumeRolePolicyDocument: {
          Statement: [
            {
              Effect: 'Allow',
              Principal: { Service: 'lambda.amazonaws.com' },
              Action: 'sts:AssumeRole',
            },
          ],
        },
      },
    }
  })

  it('grants logs:PutLogEvents on the IA log group for an INFREQUENT_ACCESS function', () => {
    const functionObject = {
      name: 'test-service-dev-myFunc',
      logs: { logGroupClass: 'INFREQUENT_ACCESS' },
    }

    applyPerFunctionPermissions({
      functionName: 'myFunc',
      functionObject,
      functionIamRole,
      policyStatements,
      serverless,
      provider,
      throwError: jest.fn(),
    })

    expect(policyStatements[0].Resource[0]).toEqual({
      'Fn::Sub':
        'arn:${AWS::Partition}:logs:${AWS::Region}:${AWS::AccountId}' +
        ':log-group:/aws/lambda/test-service-dev-myFunc-ia:*:*',
    })
  })

  it('grants logs:PutLogEvents on the standard log group when no logGroupClass is set', () => {
    const functionObject = {
      name: 'test-service-dev-myFunc',
    }

    applyPerFunctionPermissions({
      functionName: 'myFunc',
      functionObject,
      functionIamRole,
      policyStatements,
      serverless,
      provider,
      throwError: jest.fn(),
    })

    expect(policyStatements[0].Resource[0]).toEqual({
      'Fn::Sub':
        'arn:${AWS::Partition}:logs:${AWS::Region}:${AWS::AccountId}' +
        ':log-group:/aws/lambda/test-service-dev-myFunc:*:*',
    })
  })
})

describe('applyPerFunctionPermissions - Stream Permissions', () => {
  let serverless
  let provider
  let policyStatements
  let functionIamRole

  beforeEach(() => {
    provider = {
      naming: {
        getLogGroupName: jest.fn((name, { logGroupClass } = {}) => {
          const suffix = logGroupClass === 'INFREQUENT_ACCESS' ? '-ia' : ''
          return `/aws/lambda/${name}${suffix}`
        }),
        getStreamConsumerName: jest.fn(
          (fnName, streamName) => `${fnName}${streamName}Consumer`,
        ),
        getStreamConsumerLogicalId: jest.fn((name) => `${name}StreamConsumer`),
      },
      getLogGroupClass: jest.fn((fn) => fn?.logs?.logGroupClass ?? undefined),
    }
    serverless = {
      service: {
        provider: {},
        getFunction: jest.fn((name) => ({
          name: `test-service-dev-${name}`,
        })),
      },
      getProvider: jest.fn(() => provider),
    }
    policyStatements = []
    functionIamRole = {
      Properties: {
        ManagedPolicyArns: [],
        AssumeRolePolicyDocument: {
          Statement: [
            {
              Effect: 'Allow',
              Principal: { Service: 'lambda.amazonaws.com' },
              Action: 'sts:AssumeRole',
            },
          ],
        },
      },
    }
  })

  it('adds consumer-variant kinesis actions and SubscribeToShard for consumer:true', () => {
    const functionObject = {
      name: 'test-function',
      events: [
        {
          stream: {
            type: 'kinesis',
            arn: 'arn:aws:kinesis:us-east-1:123456789012:stream/MyStream',
            consumer: true,
          },
        },
      ],
    }
    applyPerFunctionPermissions({
      functionName: 'myFunc',
      functionObject,
      functionIamRole,
      policyStatements,
      serverless,
      provider,
    })
    const consumerVariant = policyStatements.find((s) =>
      s.Action?.includes?.('kinesis:DescribeStreamSummary'),
    )
    expect(consumerVariant).toEqual({
      Effect: 'Allow',
      Action: [
        'kinesis:GetRecords',
        'kinesis:GetShardIterator',
        'kinesis:DescribeStreamSummary',
        'kinesis:ListShards',
      ],
      Resource: ['arn:aws:kinesis:us-east-1:123456789012:stream/MyStream'],
    })
    const subscribe = policyStatements.find((s) =>
      s.Action?.includes?.('kinesis:SubscribeToShard'),
    )
    expect(subscribe.Resource).toEqual([
      { Ref: 'myFuncMyStreamConsumerStreamConsumer' },
    ])
    // plain-kinesis legacy statement must NOT be emitted for this stream
    expect(
      policyStatements.some((s) => s.Action?.includes?.('kinesis:ListStreams')),
    ).toBe(false)
  })

  it('uses the literal consumer ARN when consumer is an ARN string', () => {
    const consumerArn =
      'arn:aws:kinesis:us-east-1:123456789012:stream/MyStream/consumer/c1:1'
    const functionObject = {
      name: 'test-function',
      events: [
        {
          stream: {
            type: 'kinesis',
            arn: 'arn:aws:kinesis:us-east-1:123456789012:stream/MyStream',
            consumer: consumerArn,
          },
        },
      ],
    }
    applyPerFunctionPermissions({
      functionName: 'myFunc',
      functionObject,
      functionIamRole,
      policyStatements,
      serverless,
      provider,
    })
    const subscribe = policyStatements.find((s) =>
      s.Action?.includes?.('kinesis:SubscribeToShard'),
    )
    expect(subscribe.Resource).toEqual([consumerArn])
  })

  it('keeps legacy action set for plain kinesis streams', () => {
    const functionObject = {
      name: 'test-function',
      events: [
        { stream: 'arn:aws:kinesis:us-east-1:123456789012:stream/Plain' },
      ],
    }
    applyPerFunctionPermissions({
      functionName: 'myFunc',
      functionObject,
      functionIamRole,
      policyStatements,
      serverless,
      provider,
    })
    const kinesis = policyStatements.find((s) =>
      s.Action?.includes?.('kinesis:GetRecords'),
    )
    expect(kinesis.Action).toEqual([
      'kinesis:GetRecords',
      'kinesis:GetShardIterator',
      'kinesis:DescribeStream',
      'kinesis:ListStreams',
    ])
  })

  it('adds sns:Publish for stream onFailure SNS destination', () => {
    const functionObject = {
      name: 'test-function',
      events: [
        {
          stream: {
            type: 'kinesis',
            arn: 'arn:aws:kinesis:us-east-1:123456789012:stream/S',
            destinations: {
              onFailure: 'arn:aws:sns:us-east-1:123456789012:failures',
            },
          },
        },
      ],
    }
    applyPerFunctionPermissions({
      functionName: 'myFunc',
      functionObject,
      functionIamRole,
      policyStatements,
      serverless,
      provider,
    })
    const sns = policyStatements.find((s) =>
      s.Action?.includes?.('sns:Publish'),
    )
    expect(sns.Resource).toEqual([
      'arn:aws:sns:us-east-1:123456789012:failures',
    ])
  })

  it('adds sqs:ListQueues+SendMessage for stream onFailure SQS object destination', () => {
    const functionObject = {
      name: 'test-function',
      events: [
        {
          stream: {
            type: 'dynamodb',
            arn: 'arn:aws:dynamodb:us-east-1:123456789012:table/T/stream/x',
            destinations: {
              onFailure: {
                type: 'sqs',
                arn: { 'Fn::GetAtt': ['FailQueue', 'Arn'] },
              },
            },
          },
        },
      ],
    }
    applyPerFunctionPermissions({
      functionName: 'myFunc',
      functionObject,
      functionIamRole,
      policyStatements,
      serverless,
      provider,
    })
    const sqs = policyStatements.find((s) =>
      s.Action?.includes?.('sqs:SendMessage'),
    )
    expect(sqs).toEqual({
      Effect: 'Allow',
      Action: ['sqs:ListQueues', 'sqs:SendMessage'],
      Resource: [{ 'Fn::GetAtt': ['FailQueue', 'Arn'] }],
    })
  })

  it('adds sqs:ListQueues+SendMessage for stream onFailure plain-string SQS destination', () => {
    const functionObject = {
      name: 'test-function',
      events: [
        {
          stream: {
            type: 'dynamodb',
            arn: 'arn:aws:dynamodb:us-east-1:123456789012:table/T/stream/x',
            destinations: {
              onFailure: 'arn:aws:sqs:us-east-1:123456789012:plain-queue',
            },
          },
        },
      ],
    }
    applyPerFunctionPermissions({
      functionName: 'myFunc',
      functionObject,
      functionIamRole,
      policyStatements,
      serverless,
      provider,
    })
    const sqs = policyStatements.find((s) =>
      s.Action?.includes?.('sqs:SendMessage'),
    )
    expect(sqs).toEqual({
      Effect: 'Allow',
      Action: ['sqs:ListQueues', 'sqs:SendMessage'],
      Resource: ['arn:aws:sqs:us-east-1:123456789012:plain-queue'],
    })
  })

  it('infers sns:Publish for stream onFailure object destination without a type', () => {
    const functionObject = {
      name: 'test-function',
      events: [
        {
          stream: {
            type: 'kinesis',
            arn: 'arn:aws:kinesis:us-east-1:123456789012:stream/S',
            destinations: {
              onFailure: { arn: 'arn:aws:sns:us-east-1:123456789012:t' },
            },
          },
        },
      ],
    }
    applyPerFunctionPermissions({
      functionName: 'myFunc',
      functionObject,
      functionIamRole,
      policyStatements,
      serverless,
      provider,
    })
    const sns = policyStatements.find((s) =>
      s.Action?.includes?.('sns:Publish'),
    )
    expect(sns).toEqual({
      Effect: 'Allow',
      Action: ['sns:Publish'],
      Resource: ['arn:aws:sns:us-east-1:123456789012:t'],
    })
  })

  it('infers sqs:ListQueues+SendMessage for stream onFailure object destination without a type', () => {
    const functionObject = {
      name: 'test-function',
      events: [
        {
          stream: {
            type: 'kinesis',
            arn: 'arn:aws:kinesis:us-east-1:123456789012:stream/S',
            destinations: {
              onFailure: { arn: 'arn:aws:sqs:us-east-1:123456789012:q' },
            },
          },
        },
      ],
    }
    applyPerFunctionPermissions({
      functionName: 'myFunc',
      functionObject,
      functionIamRole,
      policyStatements,
      serverless,
      provider,
    })
    const sqs = policyStatements.find((s) =>
      s.Action?.includes?.('sqs:SendMessage'),
    )
    expect(sqs).toEqual({
      Effect: 'Allow',
      Action: ['sqs:ListQueues', 'sqs:SendMessage'],
      Resource: ['arn:aws:sqs:us-east-1:123456789012:q'],
    })
  })
})

describe('applyPerFunctionPermissions - VPC Permissions', () => {
  let serverless
  let provider
  let policyStatements
  let functionIamRole

  beforeEach(() => {
    provider = {
      naming: {
        getLogGroupName: jest.fn((name, { logGroupClass } = {}) => {
          const suffix = logGroupClass === 'INFREQUENT_ACCESS' ? '-ia' : ''
          return `/aws/lambda/${name}${suffix}`
        }),
      },
      getLogGroupClass: jest.fn((fn) => fn?.logs?.logGroupClass ?? undefined),
    }
    serverless = {
      service: {
        provider: {},
        getFunction: jest.fn((name) => ({
          name: `test-service-dev-${name}`,
        })),
      },
      getProvider: jest.fn(() => provider),
    }
    policyStatements = []
    functionIamRole = {
      Properties: {
        ManagedPolicyArns: [],
        AssumeRolePolicyDocument: {
          Statement: [
            {
              Effect: 'Allow',
              Principal: { Service: 'lambda.amazonaws.com' },
              Action: 'sts:AssumeRole',
            },
          ],
        },
      },
    }
  })

  it('adds the VPC managed policy ARN for a function with vpc config', () => {
    const functionObject = {
      name: 'test-function',
      vpc: { securityGroupIds: ['sg-1'], subnetIds: ['subnet-1'] },
    }

    applyPerFunctionPermissions({
      functionName: 'myFunc',
      functionObject,
      functionIamRole,
      policyStatements,
      serverless,
      provider,
      throwError: jest.fn(),
    })

    expect(functionIamRole.Properties.ManagedPolicyArns).toContainEqual({
      'Fn::Join': [
        '',
        [
          'arn:',
          { Ref: 'AWS::Partition' },
          ':iam::aws:policy/service-role/AWSLambdaVPCAccessExecutionRole',
        ],
      ],
    })
  })

  it('does not add the VPC managed policy for a function without vpc config', () => {
    const functionObject = {
      name: 'test-function',
    }

    applyPerFunctionPermissions({
      functionName: 'myFunc',
      functionObject,
      functionIamRole,
      policyStatements,
      serverless,
      provider,
      throwError: jest.fn(),
    })

    expect(functionIamRole.Properties.ManagedPolicyArns).toEqual([])
  })
})

describe('applyPerFunctionPermissions - KMS Permissions', () => {
  let serverless
  let provider
  let policyStatements
  let functionIamRole

  beforeEach(() => {
    provider = {
      naming: {
        getLogGroupName: jest.fn((name, { logGroupClass } = {}) => {
          const suffix = logGroupClass === 'INFREQUENT_ACCESS' ? '-ia' : ''
          return `/aws/lambda/${name}${suffix}`
        }),
      },
      getLogGroupClass: jest.fn((fn) => fn?.logs?.logGroupClass ?? undefined),
    }
    serverless = {
      service: {
        provider: {},
        getFunction: jest.fn((name) => ({
          name: `test-service-dev-${name}`,
        })),
      },
      getProvider: jest.fn(() => provider),
    }
    policyStatements = []
    functionIamRole = {
      Properties: {
        ManagedPolicyArns: [],
        AssumeRolePolicyDocument: {
          Statement: [
            {
              Effect: 'Allow',
              Principal: { Service: 'lambda.amazonaws.com' },
              Action: 'sts:AssumeRole',
            },
          ],
        },
      },
    }
  })

  it('adds kms:Decrypt for a string function-level kmsKeyArn', () => {
    const functionObject = {
      name: 'test-function',
      kmsKeyArn: 'arn:aws:kms:us-east-1:123456789012:key/abc',
    }
    applyPerFunctionPermissions({
      functionName: 'myFunc',
      functionObject,
      functionIamRole,
      policyStatements,
      serverless,
      provider,
    })
    const kms = policyStatements.find((s) =>
      s.Action?.includes?.('kms:Decrypt'),
    )
    expect(kms).toEqual({
      Effect: 'Allow',
      Action: ['kms:Decrypt'],
      Resource: ['arn:aws:kms:us-east-1:123456789012:key/abc'],
    })
  })

  it('falls back to provider-level kmsKeyArn', () => {
    serverless.service.provider.kmsKeyArn =
      'arn:aws:kms:us-east-1:123456789012:key/provider'
    applyPerFunctionPermissions({
      functionName: 'myFunc',
      functionObject: { name: 'test-function' },
      functionIamRole,
      policyStatements,
      serverless,
      provider,
    })
    const kms = policyStatements.find((s) =>
      s.Action?.includes?.('kms:Decrypt'),
    )
    expect(kms.Resource).toEqual([
      'arn:aws:kms:us-east-1:123456789012:key/provider',
    ])
  })

  it('adds nothing for a non-string (intrinsic) kmsKeyArn', () => {
    const functionObject = {
      name: 'test-function',
      kmsKeyArn: { 'Fn::GetAtt': ['MyKey', 'Arn'] },
    }
    applyPerFunctionPermissions({
      functionName: 'myFunc',
      functionObject,
      functionIamRole,
      policyStatements,
      serverless,
      provider,
    })
    expect(
      policyStatements.some((s) => s.Action?.includes?.('kms:Decrypt')),
    ).toBe(false)
  })
})
