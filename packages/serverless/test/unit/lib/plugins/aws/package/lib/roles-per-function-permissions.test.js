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
})
