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
        getLogGroupName: jest.fn((name) => `/aws/lambda/${name}`),
      },
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
        getLogGroupName: jest.fn((name) => `/aws/lambda/${name}`),
      },
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
