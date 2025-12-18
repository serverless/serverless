import {
  getLambdaResourceInfo,
  getIamResourceInfo,
  getSqsResourceInfo,
  getS3ResourceInfo,
  getRestApiGatewayResourceInfo,
  getDynamoDBResourceInfo,
} from '../lib/aws/resource-info.js'
import { getHttpApiGatewayResourceInfo } from '../lib/aws/http-api-gateway-resource-info.js'
import { validateAndAdjustParameters } from '../lib/parameter-validator.js'
import { AwsCloudformationService } from '@serverless/engine/src/lib/aws/cloudformation.js'
import { handleAwsCredentialsError } from '../lib/aws-credentials-error-handler.js'

/**
 * Map of resource types to their corresponding info functions
 */
export const resourceTypeHandlers = {
  aws: {
    lambda: getLambdaResourceInfo,
    iam: getIamResourceInfo,
    sqs: getSqsResourceInfo,
    s3: getS3ResourceInfo,
    restapigateway: getRestApiGatewayResourceInfo,
    dynamodb: getDynamoDBResourceInfo,
    httpapigateway: getHttpApiGatewayResourceInfo,
  },
  // Prepared for future providers
  gcp: {},
  azure: {},
}

/**
 * Get detailed information about multiple cloud resources at once
 *
 * @param {Object} params - The parameters for the function
 * @param {Array<Object>} [params.resources] - Array of resource objects with id and type properties
 * @param {boolean} [params.serviceWideAnalysis] - Boolean flag to analyze all resources for a service
 * @param {string} [params.serviceName] - Required if serviceWideAnalysis is true
 * @param {string} [params.cloudProvider] - The cloud service provider (aws, gcp, azure). Required if serviceWideAnalysis is true
 * @param {string} [params.startTime] - Optional start time for metrics and logs (ISO string or timestamp)
 * @param {string} [params.endTime] - Optional end time for metrics and logs (ISO string or timestamp)
 * @param {number} [params.period] - Optional period for metrics in seconds (minimum 60, default 3600)
 * @param {string} [params.region] - Optional region to use
 * @param {string} [params.profile] - Optional profile to use for credentials
 * @returns {Promise<Object>} - Information about the requested resources
 */
export async function getServiceSummary(params) {
  try {
    const {
      resources,
      serviceWideAnalysis = false,
      serviceName,
      cloudProvider,
      startTime,
      endTime,
      period,
      region,
      profile,
    } = params

    // Validate input parameters
    if (!cloudProvider) {
      return {
        content: [
          {
            type: 'text',
            text: 'Error: Please provide a cloud provider.',
          },
        ],
        isError: true,
      }
    }

    // Determine which resources to analyze
    let effectiveResources = resources || []

    if (serviceWideAnalysis) {
      // Validate service parameters
      if (!serviceName || !cloudProvider) {
        return {
          content: [
            {
              type: 'text',
              text: 'Error: serviceName and cloudProvider are required for serviceWideAnalysis.',
            },
          ],
          isError: true,
        }
      }

      // Create AWS config with region and/or profile if provided
      const awsConfig = {}
      if (region) awsConfig.region = region
      if (profile) awsConfig.profile = profile

      try {
        // Get CloudFormation resources
        const cloudformationService = new AwsCloudformationService(awsConfig)
        const stackResources =
          await cloudformationService.describeStackResources(serviceName)

        if (stackResources.error) {
          // Check if this is an AWS credentials error
          const credentialErrorMessage = handleAwsCredentialsError(
            stackResources.error,
            profile,
          )

          // Special handling for 'Stack does not exist' errors
          if (
            stackResources.error &&
            stackResources.error.includes('does not exist')
          ) {
            const agentHint =
              `This is a 'Stack does not exist' error. Return this message to the user: "Stack '${serviceName}' was not found. Original error: ${stackResources.error}" ` +
              `Then ask the user: 1) Is the service deployed? 2) Is the correct profile being used? ` +
              `(Current profile: '${profile || 'default'}')

` +
              `If the user confirms the service is deployed, suggest they try a different AWS profile or region.`

            return {
              content: [
                {
                  type: 'text',
                  text: agentHint,
                },
              ],
              isError: true,
            }
          }

          return {
            content: [
              {
                type: 'text',
                text:
                  credentialErrorMessage ||
                  `Error retrieving resources for stack '${serviceName}': ${stackResources.error}`,
              },
            ],
            isError: true,
          }
        }

        // Define CloudFormation resource type mapping once
        const resourceTypeMap = {
          'AWS::Lambda::Function': 'lambda',
          'AWS::IAM::Role': 'iam',
          'AWS::SQS::Queue': 'sqs',
          'AWS::S3::Bucket': 's3',
          'AWS::ApiGateway::RestApi': 'restapigateway',
          'AWS::ApiGatewayV2::Api': 'httpapigateway',
          'AWS::DynamoDB::Table': 'dynamodb',
        }

        // Map CloudFormation resources to the format expected by this tool
        effectiveResources = stackResources
          // Filter for supported resource types
          .filter((resource) => resourceTypeMap[resource.ResourceType])
          // Map to the format expected by this tool
          .map((resource) => ({
            id: resource.PhysicalResourceId,
            type: resourceTypeMap[resource.ResourceType],
          }))
      } catch (error) {
        // Check if this is an AWS credentials error
        const credentialErrorMessage = handleAwsCredentialsError(error, profile)

        return {
          content: [
            {
              type: 'text',
              text:
                credentialErrorMessage ||
                `Error retrieving resources for service '${serviceName}': ${error.message}`,
            },
          ],
          isError: true,
        }
      }
    }

    if (effectiveResources.length === 0) {
      return {
        content: [
          {
            type: 'text',
            text: serviceWideAnalysis
              ? `No supported resources found for service '${serviceName}'. Supported resource types: lambda, iam, sqs, s3, restapigateway, httpapigateway, dynamodb.`
              : 'Error: Please provide at least one resource to get information about.',
          },
        ],
        isError: true,
      }
    }

    // Validate and adjust time parameters
    const {
      startTimeMs,
      endTimeMs,
      period: adjustedPeriod,
    } = validateAndAdjustParameters({
      startTime,
      endTime,
      period,
    })

    // Check if the cloud provider is supported
    if (!resourceTypeHandlers[cloudProvider]) {
      return {
        content: [
          {
            type: 'text',
            text: `Error: Unsupported cloud provider: ${cloudProvider}. Supported providers: ${Object.keys(resourceTypeHandlers).join(', ')}`,
          },
        ],
        isError: true,
      }
    }

    // Process each resource
    const results = await Promise.all(
      effectiveResources.map(async (resource) => {
        // Validate resource object
        if (!resource.id || !resource.type) {
          return {
            error: 'Resource must have both id and type properties',
          }
        }

        // Check if the resource type is supported for the given cloud provider
        if (!resourceTypeHandlers[cloudProvider][resource.type]) {
          return {
            id: resource.id,
            type: resource.type,
            error: `Unsupported resource type: ${resource.type} for cloud provider: ${cloudProvider}`,
          }
        }

        try {
          // Call the appropriate handler function for the resource type
          return await resourceTypeHandlers[cloudProvider][resource.type]({
            resourceId: resource.id,
            startTime: startTimeMs,
            endTime: endTimeMs,
            period: adjustedPeriod,
            region,
            profile,
          })
        } catch (error) {
          return {
            id: resource.id,
            type: resource.type,
            error: error.message,
          }
        }
      }),
    )

    // Create the response object
    let responseObject

    if (serviceWideAnalysis) {
      const resourceTypes = [
        ...new Set(effectiveResources.map((r) => r.type)),
      ].join(', ')

      // Create a single response object with metadata and results
      responseObject = {
        metadata: {
          serviceWideAnalysis: true,
          serviceName,
          cloudProvider,
          resourceCount: effectiveResources.length,
          resourceTypes: resourceTypes,
          message: `Retrieved information for ${effectiveResources.length} resources of types: ${resourceTypes}`,
        },
        resources: results,
      }
    } else {
      // For backward compatibility, just return the results array when not using serviceWideAnalysis
      responseObject = results
    }

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(responseObject, null, 2),
        },
      ],
    }
  } catch (error) {
    return {
      content: [
        {
          type: 'text',
          text: `Error retrieving service summary: ${error.message}`,
        },
      ],
      isError: true,
    }
  }
}
