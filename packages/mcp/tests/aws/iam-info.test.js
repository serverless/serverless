/**
 * Jest tests for AWS IAM Info Tool
 *
 * This test file directly tests the getIamInfo function, mocking the AwsIamClient
 * to avoid making actual AWS API calls during testing.
 */

import { jest, expect, describe, test, beforeEach } from '@jest/globals'

// Create a mock function for getRoleDetails
const mockGetRoleDetails = jest.fn()

// Mock the AWS IAM client
await jest.unstable_mockModule('../../../engine/src/lib/aws/iam.js', () => {
  return {
    AwsIamClient: jest.fn(() => ({
      getRoleDetails: mockGetRoleDetails,
    })),
  }
})

// Import the function after mocking dependencies
const { getIamInfo } = await import('../../src/tools/aws/iam-info.js')
const { AwsIamClient } = await import('../../../engine/src/lib/aws/iam.js')

describe('AWS IAM Info Tool', () => {
  beforeEach(() => {
    // Clear all mocks before each test
    jest.clearAllMocks()
  })

  test('should validate input and return error for empty role names', async () => {
    const result = await getIamInfo({ roleNames: [] })

    expect(result).toBeDefined()
    expect(result.isError).toBe(true)
    expect(result.content).toHaveLength(1)
    expect(result.content[0].type).toBe('text')
    expect(result.content[0].text).toContain(
      'Please provide at least one IAM role name',
    )
    expect(mockGetRoleDetails).not.toHaveBeenCalled()
  })

  test('should validate input and return error for non-array role names', async () => {
    const result = await getIamInfo({ roleNames: 'my-role' })

    expect(result).toBeDefined()
    expect(result.isError).toBe(true)
    expect(result.content).toHaveLength(1)
    expect(result.content[0].type).toBe('text')
    expect(result.content[0].text).toContain(
      'Please provide at least one IAM role name',
    )
    expect(mockGetRoleDetails).not.toHaveBeenCalled()
  })

  test('should get IAM role information successfully', async () => {
    const mockRoleDetails = {
      roleName: 'lambda-execution-role',
      status: 'success',
      role: {
        Role: {
          Path: '/',
          RoleName: 'lambda-execution-role',
          RoleId: 'AROAEXAMPLEID',
          Arn: 'arn:aws:iam::123456789012:role/lambda-execution-role',
          CreateDate: new Date('2023-01-01T00:00:00.000Z'),
          AssumeRolePolicyDocument: {
            Version: '2012-10-17',
            Statement: [
              {
                Effect: 'Allow',
                Principal: {
                  Service: 'lambda.amazonaws.com',
                },
                Action: 'sts:AssumeRole',
              },
            ],
          },
        },
      },
      attachedPolicies: [
        {
          PolicyName: 'AWSLambdaBasicExecutionRole',
          PolicyArn:
            'arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole',
          DefaultVersionId: 'v1',
          Document: {
            Version: '2012-10-17',
            Statement: [
              {
                Effect: 'Allow',
                Action: [
                  'logs:CreateLogGroup',
                  'logs:CreateLogStream',
                  'logs:PutLogEvents',
                ],
                Resource: '*',
              },
            ],
          },
        },
      ],
      inlinePolicies: [
        {
          PolicyName: 'custom-permissions',
          PolicyDocument: {
            Version: '2012-10-17',
            Statement: [
              {
                Effect: 'Allow',
                Action: ['s3:GetObject', 's3:PutObject'],
                Resource: 'arn:aws:s3:::my-bucket/*',
              },
            ],
          },
        },
      ],
    }

    mockGetRoleDetails.mockResolvedValue(mockRoleDetails)

    const result = await getIamInfo({
      roleNames: ['lambda-execution-role'],
    })

    expect(result).toBeDefined()
    expect(result.content).toHaveLength(1)
    expect(result.content[0].type).toBe('text')
    const parsedJson = JSON.parse(result.content[0].text)
    expect(parsedJson).toHaveLength(1)
    expect(parsedJson[0].roleName).toBe('lambda-execution-role')
    expect(parsedJson[0].status).toBe('success')
    expect(mockGetRoleDetails).toHaveBeenCalledWith('lambda-execution-role')
  })

  test('should handle multiple IAM roles', async () => {
    const mockRole1 = {
      roleName: 'role-1',
      status: 'success',
      role: {
        Role: {
          RoleName: 'role-1',
          Arn: 'arn:aws:iam::123456789012:role/role-1',
        },
      },
    }

    const mockRole2 = {
      roleName: 'role-2',
      status: 'success',
      role: {
        Role: {
          RoleName: 'role-2',
          Arn: 'arn:aws:iam::123456789012:role/role-2',
        },
      },
    }

    mockGetRoleDetails
      .mockResolvedValueOnce(mockRole1)
      .mockResolvedValueOnce(mockRole2)

    const result = await getIamInfo({
      roleNames: ['role-1', 'role-2'],
    })

    expect(result).toBeDefined()
    expect(result.content).toHaveLength(1)
    expect(result.content[0].type).toBe('text')
    const parsedJson = JSON.parse(result.content[0].text)
    expect(parsedJson).toHaveLength(2)
    expect(parsedJson[0].roleName).toBe('role-1')
    expect(parsedJson[1].roleName).toBe('role-2')
    expect(mockGetRoleDetails).toHaveBeenCalledTimes(2)
    expect(mockGetRoleDetails).toHaveBeenCalledWith('role-1')
    expect(mockGetRoleDetails).toHaveBeenCalledWith('role-2')
  })

  test('should handle errors for individual IAM roles', async () => {
    mockGetRoleDetails.mockRejectedValue(new Error('Role does not exist'))

    const result = await getIamInfo({
      roleNames: ['non-existent-role'],
    })

    expect(result).toBeDefined()
    expect(result.content).toHaveLength(1)
    expect(result.content[0].type).toBe('text')
    const parsedJson = JSON.parse(result.content[0].text)
    expect(parsedJson).toHaveLength(1)
    expect(parsedJson[0].roleName).toBe('non-existent-role')
    expect(parsedJson[0].status).toBe('error')
    expect(parsedJson[0].error).toBe('Role does not exist')
    expect(mockGetRoleDetails).toHaveBeenCalledWith('non-existent-role')
  })
})
