/**
 * Jest tests for IaC Resources
 *
 * This test file directly tests the getIacResources function, focusing on the Terraform functionality
 * which doesn't rely on AWS CloudFormation service.
 */

import { beforeEach, describe, expect, jest, test } from '@jest/globals'

// Create a mock function for describeStackResources
const mockDescribeStackResources = jest.fn()

// Mock the AWS CloudFormation service
await jest.unstable_mockModule(
  '../../engine/src/lib/aws/cloudformation.js',
  () => {
    return {
      AwsCloudformationService: jest.fn(() => ({
        describeStackResources: mockDescribeStackResources,
      })),
    }
  },
)

// Import the actual module
const { getIacResources, setListProjectsCalled } =
  await import('../src/tools/list-resources.js')

describe('IaC Resources Tool', () => {
  beforeEach(() => {
    // Clear all mocks before each test
    jest.clearAllMocks()
    // Call setListProjectsCalled to set the flag for most tests
    setListProjectsCalled()
  })

  test('should require list-projects to be called first', async () => {
    // Reset modules to clear the flag state
    jest.resetModules()

    // Re-import the module to get a fresh instance with flag reset
    const freshModule = await import('../src/tools/list-resources.js')

    const result = await freshModule.getIacResources({
      serviceName: 'my-terraform-project',
      serviceType: 'terraform',
    })

    expect(result).toBeDefined()
    expect(result.isError).toBe(true)
    expect(result.content).toHaveLength(1)
    expect(result.content[0].type).toBe('text')
    expect(result.content[0].text).toContain(
      'You must use the list-projects tool BEFORE using list-resources',
    )

    // Set the flag back for subsequent tests
    setListProjectsCalled()
  })

  // Test Terraform functionality
  test('should get Terraform instructions', async () => {
    const result = await getIacResources({
      serviceName: 'my-terraform-project',
      serviceType: 'terraform',
    })

    expect(result).toBeDefined()
    expect(result.content).toHaveLength(1)
    expect(result.content[0].type).toBe('text')
    expect(result.content[0].text).toContain('Terraform')
    expect(result.content[0].text).toContain('terraform state list')
    expect(result.content[0].text).toContain('terraform state show')
  })

  test('should handle unsupported service type', async () => {
    const result = await getIacResources({
      serviceName: 'some-service',
      serviceType: 'unsupported-type',
    })

    expect(result).toBeDefined()
    expect(result.content).toHaveLength(1)
    expect(result.content[0].type).toBe('text')
    expect(result.content[0].text).toContain('not supported yet')
    expect(result.content[0].text).toContain('serverless-framework')
    expect(result.content[0].text).toContain('terraform')
  })

  // Test serverless-framework functionality
  test('should get Serverless Framework resources successfully', async () => {
    const mockResources = [
      {
        LogicalResourceId: 'ApiGatewayRestApi',
        PhysicalResourceId: 'abc123',
        ResourceType: 'AWS::ApiGateway::RestApi',
      },
    ]

    mockDescribeStackResources.mockResolvedValue(mockResources)

    const result = await getIacResources({
      serviceName: 'my-serverless-service-dev',
      serviceType: 'serverless-framework',
    })

    expect(result).toBeDefined()
    expect(result.content).toHaveLength(1)
    expect(result.content[0].type).toBe('text')
    const parsedContent = JSON.parse(result.content[0].text)
    expect(parsedContent).toEqual([
      {
        LogicalResourceId: 'ApiGatewayRestApi',
        PhysicalResourceId: 'abc123',
        ResourceType: 'AWS::ApiGateway::RestApi',
      },
    ])
    expect(mockDescribeStackResources).toHaveBeenCalledWith(
      'my-serverless-service-dev',
    )
  })

  test('should handle no resources found for Serverless Framework', async () => {
    mockDescribeStackResources.mockResolvedValue(null)

    const result = await getIacResources({
      serviceName: 'non-existent-service-dev',
      serviceType: 'serverless-framework',
    })

    expect(result).toBeDefined()
    expect(result.content).toHaveLength(1)
    expect(result.content[0].type).toBe('text')
    expect(result.content[0].text).toContain('No resources found')
    expect(mockDescribeStackResources).toHaveBeenCalledWith(
      'non-existent-service-dev',
    )
  })

  test('should handle errors for Serverless Framework', async () => {
    mockDescribeStackResources.mockRejectedValue(
      new Error('Stack does not exist'),
    )

    const result = await getIacResources({
      serviceName: 'error-service-dev',
      serviceType: 'serverless-framework',
    })

    expect(result).toBeDefined()
    expect(result.content).toHaveLength(1)
    expect(result.content[0].type).toBe('text')
    expect(result.content[0].text).toContain('Error retrieving resources')
    expect(result.content[0].text).toContain('Stack does not exist')
    expect(mockDescribeStackResources).toHaveBeenCalledWith('error-service-dev')
  })
})
