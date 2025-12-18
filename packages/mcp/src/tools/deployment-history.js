import { formatDate } from '../utils/date-utils.js'
import { AwsCloudformationService } from '../../../engine/src/lib/aws/cloudformation.js'
import { handleAwsCredentialsError } from '../lib/aws-credentials-error-handler.js'

/**
 * Get deployment history for a service
 * @param {Object} params - Parameters for the deployment history query
 * @param {string} params.serviceName - Name of the service to get history for
 * @param {string} params.serviceType - Type of service (serverless-framework or cloudformation)
 * @param {string} [params.region] - AWS region to query
 * @param {string} [params.profile] - AWS profile to use
 * @param {string} [params.endDate] - End date for the history query (ISO format)
 * @returns {Promise<Object>} - Deployment history information
 */
export async function getDeploymentHistory({
  serviceName,
  serviceType,
  region,
  profile,
  endDate,
}) {
  try {
    // Configure AWS SDK with the correct credential handling pattern
    // Create a separate config object and conditionally add properties
    const awsConfig = {}

    // Only set region if it's provided
    if (region) {
      awsConfig.region = region
    }

    // Set profile directly in the main config object, not in a nested credentials object
    // This is the correct way to handle AWS profiles with the SDK v3
    if (profile) {
      awsConfig.profile = profile
    }

    // Use the CloudFormation service from the engine package
    const cfnService = new AwsCloudformationService(awsConfig)

    // For serverless-framework, the stack name is the serviceName
    // For cloudformation, the stack name is directly the serviceName
    const stackName = serviceName

    // Calculate the start date (7 days before endDate or current date)
    const end = endDate ? new Date(endDate) : new Date()
    const start = new Date(end)
    start.setDate(start.getDate() - 7)

    // Get stack events with date filtering using the engine service
    // Also filter for completed deployments (CREATE_COMPLETE or UPDATE_COMPLETE events where LogicalResourceId equals stackName)
    const response = await cfnService.describeStackEvents({
      stackName,
      startDate: start,
      endDate: end,
      onlyCompletedDeployments: true,
    })

    // Get events with defensive programming using null/undefined checks
    const events = response?.events || []

    // Format the events for display
    const formattedEvents = events.map((event) => ({
      timestamp: formatDate(event.Timestamp),
      logicalId: event.LogicalResourceId || 'Unknown',
      resourceType: event.ResourceType || 'Unknown',
      status: event.ResourceStatus || 'Unknown',
      statusReason: event.ResourceStatusReason || null,
      physicalId: event.PhysicalResourceId || null,
    }))

    // Group events by day for better readability
    const groupedEvents = {}
    formattedEvents.forEach((event) => {
      const day = event.timestamp.split(' ')[0] // Extract date part
      if (!groupedEvents[day]) {
        groupedEvents[day] = []
      }
      groupedEvents[day].push(event)
    })

    // Prepare the result data
    const resultData = {
      service: serviceName,
      serviceType,
      region: region || 'default',
      timeRange: {
        start: formatDate(start),
        end: formatDate(end),
      },
      eventsByDay: groupedEvents,
      totalEvents: formattedEvents.length,
    }

    // Return content as text type with stringified JSON
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(resultData, null, 2),
        },
      ],
    }
  } catch (error) {
    console.error(
      `Deployment History Tool Error: ${error.message || String(error)}`,
    )
    // Check if this is an AWS credentials error
    const credentialErrorMessage = handleAwsCredentialsError(error, profile)

    return {
      content: [
        {
          type: 'text',
          text: `Error retrieving deployment history: ${credentialErrorMessage || error.message}`,
        },
      ],
      isError: true,
    }
  }
}
