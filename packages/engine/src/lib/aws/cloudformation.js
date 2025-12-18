import {
  CloudFormationClient,
  DescribeStacksCommand,
  DescribeStackEventsCommand,
  DescribeStackResourcesCommand,
} from '@aws-sdk/client-cloudformation'
import { addProxyToAwsClient } from '@serverless/util'

export class AwsCloudformationService {
  constructor(awsConfig = {}) {
    this.client = addProxyToAwsClient(
      new CloudFormationClient({
        ...awsConfig,
      }),
    )
  }

  async describeStack(stackName) {
    try {
      const describeStacksResponse = await this.client.send(
        new DescribeStacksCommand({
          StackName: stackName,
        }),
      )
      if (describeStacksResponse.Stacks?.length > 0) {
        return describeStacksResponse.Stacks[0]
      }
      return null
    } catch (error) {
      return null
    }
  }

  /**
   * Get stack events for a CloudFormation stack with optional date filtering
   * @param {Object} params - Parameters for the request
   * @param {string} params.stackName - Name of the stack to get events for
   * @param {Date} [params.startDate] - Start date for filtering events
   * @param {Date} [params.endDate] - End date for filtering events
   * @param {boolean} [params.onlyCompletedDeployments] - If true, only return events for completed deployments
   * @returns {Promise<Object>} - Stack events response with events and metadata
   */
  async describeStackEvents(params) {
    try {
      const { stackName, startDate, endDate, onlyCompletedDeployments } =
        typeof params === 'string'
          ? { stackName: params } // Support for legacy usage with just stackName string
          : params

      // Collect all events with pagination
      let allEvents = []
      let nextToken = undefined
      let shouldContinue = true

      do {
        const command = new DescribeStackEventsCommand({
          StackName: stackName,
          NextToken: nextToken,
        })

        const response = await this.client.send(command)
        const events = response?.StackEvents || []

        // CloudFormation events are returned in reverse chronological order (newest first)
        if (events.length > 0) {
          // Check if we need to filter this batch based on date range
          if (startDate || endDate) {
            // Find the oldest event in this batch
            const oldestEventInBatch = events[events.length - 1]
            const oldestTimestamp = new Date(oldestEventInBatch.Timestamp)

            // If the oldest event is already older than our start date, we can stop paginating after this batch
            if (startDate && oldestTimestamp < startDate) {
              // Add only events that are within our date range
              const relevantEvents = events.filter((event) => {
                const eventTime = new Date(event.Timestamp)
                if (startDate && eventTime < startDate) return false
                if (endDate && eventTime > endDate) return false
                return true
              })

              allEvents = [...allEvents, ...relevantEvents]
              shouldContinue = false
              break
            }

            // If we have an end date, check if any events in this batch are newer than our end date
            if (endDate) {
              const newestEventInBatch = events[0] // First event is the newest
              const newestTimestamp = new Date(newestEventInBatch.Timestamp)

              // If all events in this batch are newer than our end date, skip this batch entirely
              if (newestTimestamp > endDate) {
                nextToken = response.NextToken
                continue
              }
            }
          }
        }

        // Otherwise add all events from this batch
        allEvents = [...allEvents, ...events]

        // Update the token for the next page
        nextToken = response.NextToken
      } while (nextToken && shouldContinue)

      // We've already filtered by both start and end date during pagination
      let filteredEvents = allEvents

      // Filter for completed deployments if requested
      if (onlyCompletedDeployments) {
        filteredEvents = filteredEvents.filter((event) => {
          // Check if this is a stack-level event (LogicalResourceId equals the stack name)
          // and if it's a CREATE_COMPLETE or UPDATE_COMPLETE event
          return (
            event.LogicalResourceId === stackName &&
            (event.ResourceStatus === 'CREATE_COMPLETE' ||
              event.ResourceStatus === 'UPDATE_COMPLETE')
          )
        })
      }

      return {
        events: filteredEvents,
        totalEvents: filteredEvents.length,
      }
    } catch (error) {
      throw error // Let the caller handle the error
    }
  }

  async describeStackResources(stackName) {
    try {
      const describeStackResourcesResponse = await this.client.send(
        new DescribeStackResourcesCommand({
          StackName: stackName,
        }),
      )
      if (describeStackResourcesResponse.StackResources?.length > 0) {
        return describeStackResourcesResponse.StackResources
      }
      return null
    } catch (error) {
      console.log(error)
      return {
        status: 'error',
        error: error.message,
        stackName,
      }
    }
  }
}
